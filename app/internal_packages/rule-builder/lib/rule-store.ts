/**
 * Rule Store — bilet MVP #100.
 *
 * CRUD + reorder + JSON export/import + audit log + run-now preview/execute.
 *
 * Storage: localStorage (na razie — sync engine integration odłożona do osobnego ticketa).
 *  - actuna.automation-rules            → AutomationRule[]
 *  - actuna.automation-rules.audit      → RuleAuditEntry[] (cap 1000)
 */

import {
  AutomationRule,
  Action,
  RuleAuditEntry,
  TriggerType,
  RuleLocation,
  CONSENT_REQUIRED_ACTIONS,
  BULK_CONFIRM_THRESHOLD,
} from './rule-types';
import { evalRules, ThreadMeta, Rule as ConditionRule, MatchMode } from '../../smart-folder/lib/rule-engine';

const STORAGE_KEY = 'actuna.automation-rules';
const AUDIT_KEY = 'actuna.automation-rules.audit';
const JSON_VERSION = '1.0';
const AUDIT_CAP = 1000;

export interface CreateRuleInput {
  name: string;
  trigger?: TriggerType;
  location?: RuleLocation;
  match?: MatchMode;
  conditions?: ConditionRule[];
  actions?: Action[];
  exceptions?: ConditionRule[];
  enabled?: boolean;
  scheduleAt?: string;
}

export interface PreviewResult {
  matched: ThreadMeta[];
  /** True when matched.length >= BULK_CONFIRM_THRESHOLD — caller must confirm before executing. */
  requiresBulkConfirm: boolean;
  /** Actions that require explicit consent dialog (forward/delete/auto_reply). */
  requiresConsent: Action[];
}

class RuleStoreImpl {
  private _rules: Map<string, AutomationRule> = new Map();
  private _audit: RuleAuditEntry[] = [];
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === CRUD ===

  create(input: CreateRuleInput): AutomationRule {
    if (!input.name || !input.name.trim()) {
      throw new Error('[RuleStore] create: name required');
    }
    const id = this._generateId();
    const now = Date.now();
    const rule: AutomationRule = {
      id,
      name: input.name.trim(),
      enabled: input.enabled ?? true,
      location: input.location || 'local',
      trigger: input.trigger || 'message_arrives',
      scheduleAt: input.scheduleAt,
      match: input.match || 'all',
      conditions: input.conditions || [],
      actions: input.actions || [],
      exceptions: input.exceptions || [],
      order: this._rules.size,
      hits: 0,
      createdAt: now,
      updatedAt: now,
    };
    this._rules.set(id, rule);
    this._audit_log({ ruleId: id, event: 'created' });
    this._save();
    this._emit();
    return rule;
  }

  update(id: string, patch: Partial<Omit<AutomationRule, 'id' | 'createdAt' | 'hits'>>): AutomationRule | undefined {
    const existing = this._rules.get(id);
    if (!existing) return undefined;
    const updated: AutomationRule = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      hits: existing.hits,
      updatedAt: Date.now(),
    };
    this._rules.set(id, updated);
    this._audit_log({
      ruleId: id,
      event: patch.enabled === true && !existing.enabled
        ? 'enabled'
        : patch.enabled === false && existing.enabled
          ? 'disabled'
          : 'updated',
    });
    this._save();
    this._emit();
    return updated;
  }

  delete(id: string): boolean {
    const had = this._rules.delete(id);
    if (had) {
      this._audit_log({ ruleId: id, event: 'deleted' });
      // re-pack order to keep contiguous 0..N-1
      const sorted = Array.from(this._rules.values()).sort((a, b) => a.order - b.order);
      sorted.forEach((r, idx) => { r.order = idx; });
      this._save();
      this._emit();
    }
    return had;
  }

  duplicate(id: string): AutomationRule | undefined {
    const src = this._rules.get(id);
    if (!src) return undefined;
    return this.create({
      name: `${src.name} (copy)`,
      trigger: src.trigger,
      location: src.location,
      match: src.match,
      conditions: [...src.conditions],
      actions: [...src.actions],
      exceptions: [...src.exceptions],
      enabled: false, // start disabled
      scheduleAt: src.scheduleAt,
    });
  }

  get(id: string): AutomationRule | undefined {
    return this._rules.get(id);
  }

  list(): AutomationRule[] {
    return Array.from(this._rules.values()).sort((a, b) => a.order - b.order);
  }

  listEnabled(): AutomationRule[] {
    return this.list().filter(r => r.enabled);
  }

  count(): number {
    return this._rules.size;
  }

  // === Reorder ===

  moveUp(id: string): boolean {
    const rule = this._rules.get(id);
    if (!rule || rule.order === 0) return false;
    const above = this.list().find(r => r.order === rule.order - 1);
    if (!above) return false;
    above.order = rule.order;
    rule.order = rule.order - 1;
    this._save();
    this._emit();
    return true;
  }

  moveDown(id: string): boolean {
    const rule = this._rules.get(id);
    if (!rule || rule.order === this._rules.size - 1) return false;
    const below = this.list().find(r => r.order === rule.order + 1);
    if (!below) return false;
    below.order = rule.order;
    rule.order = rule.order + 1;
    this._save();
    this._emit();
    return true;
  }

  // === Run / Preview ===

  /** Find threads matching the rule (without modifying anything). */
  preview(ruleId: string, threads: ThreadMeta[]): PreviewResult {
    const rule = this._rules.get(ruleId);
    if (!rule) return { matched: [], requiresBulkConfirm: false, requiresConsent: [] };

    const matched = threads.filter(t => this._threadMatches(rule, t));
    const requiresConsent = rule.actions.filter(a => CONSENT_REQUIRED_ACTIONS.has(a.type));

    return {
      matched,
      requiresBulkConfirm: matched.length >= BULK_CONFIRM_THRESHOLD,
      requiresConsent,
    };
  }

  /** Execute rule against thread set — increments hits + writes audit. Returns matched count. */
  runNow(ruleId: string, threads: ThreadMeta[]): number {
    const rule = this._rules.get(ruleId);
    if (!rule) return 0;
    const preview = this.preview(ruleId, threads);
    if (preview.matched.length === 0) {
      this._audit_log({ ruleId, event: 'run_now', matchCount: 0 });
      return 0;
    }
    rule.hits += preview.matched.length;
    rule.lastRunAt = Date.now();
    this._audit_log({ ruleId, event: 'run_now', matchCount: preview.matched.length });
    this._save();
    this._emit();
    return preview.matched.length;
  }

  /** Test trigger semantics: returns rules that should run on event. */
  rulesForTrigger(trigger: TriggerType): AutomationRule[] {
    return this.listEnabled().filter(r => r.trigger === trigger);
  }

  // === Export / Import ===

  exportJSON(): string {
    return JSON.stringify({
      version: JSON_VERSION,
      exportedAt: Date.now(),
      rules: this.list(),
    }, null, 2);
  }

  importJSON(json: string, options: { replace?: boolean } = {}): number {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.rules)) {
      throw new Error('[RuleStore] importJSON: invalid format — missing "rules" array');
    }
    if (data.version && data.version !== JSON_VERSION) {
      console.warn(`[RuleStore] importJSON: version mismatch — got ${data.version}, expected ${JSON_VERSION}`);
    }
    if (options.replace) this._rules.clear();
    let count = 0;
    let nextOrder = this._rules.size;
    const now = Date.now();
    for (const r of data.rules as AutomationRule[]) {
      if (!r.name || !Array.isArray(r.conditions) || !Array.isArray(r.actions)) continue;
      const id = this._generateId();
      const rule: AutomationRule = {
        id,
        name: r.name,
        enabled: r.enabled ?? false, // import disabled by default — safety
        location: r.location || 'local',
        trigger: r.trigger || 'message_arrives',
        scheduleAt: r.scheduleAt,
        match: r.match || 'all',
        conditions: r.conditions,
        actions: r.actions,
        exceptions: Array.isArray(r.exceptions) ? r.exceptions : [],
        order: nextOrder++,
        hits: 0, // reset on import
        createdAt: now,
        updatedAt: now,
      };
      this._rules.set(id, rule);
      this._audit_log({ ruleId: id, event: 'created', detail: 'imported' });
      count++;
    }
    if (count > 0) {
      this._save();
      this._emit();
    }
    return count;
  }

  // === Audit ===

  getAudit(): RuleAuditEntry[] {
    return [...this._audit];
  }

  clearAudit(): void {
    this._audit = [];
    this._saveAudit();
    this._emit();
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._rules.clear();
    this._audit = [];
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(AUDIT_KEY);
    } catch (e) { /* node env */ }
  }

  // === internals ===

  private _threadMatches(rule: AutomationRule, t: ThreadMeta): boolean {
    if (!evalRules(rule.conditions, rule.match, t)) return false;
    if (rule.exceptions.length > 0 && evalRules(rule.exceptions, 'any', t)) return false;
    return true;
  }

  private _audit_log(entry: Omit<RuleAuditEntry, 'timestamp'>): void {
    this._audit.push({ ...entry, timestamp: Date.now() });
    if (this._audit.length > AUDIT_CAP) {
      this._audit = this._audit.slice(-AUDIT_CAP);
    }
    this._saveAudit();
  }

  private _generateId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as AutomationRule[];
        for (const r of arr) {
          if (r && r.id) this._rules.set(r.id, r);
        }
      }
      const rawAudit = localStorage.getItem(AUDIT_KEY);
      if (rawAudit) {
        this._audit = JSON.parse(rawAudit) as RuleAuditEntry[];
      }
    } catch (e) {
      console.error('[RuleStore] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.list()));
    } catch (e) {
      console.error('[RuleStore] save failed:', e);
    }
  }

  private _saveAudit(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(AUDIT_KEY, JSON.stringify(this._audit));
    } catch (e) {
      console.error('[RuleStore] audit save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[RuleStore] listener error', e); }
    }
  }
}

export const RuleStore = new RuleStoreImpl();
