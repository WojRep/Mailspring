/**
 * Akcje seryjne / Compound Actions Store — bilet MVP #101.
 *
 * Compound action = łańcuch action primitives (reuse z #100) zbindowany na
 * Ctrl+Shift+1..9 (Windows/Linux) lub Cmd+Shift+1..9 (macOS).
 *
 * Per-account override: account A może mieć inne akcje seryjne niż account B.
 *
 * **TM compliance**: NIGDY nie używać "Quick Steps" / "Quick Actions" w UI / labels /
 * marketing. Internal slug 101-quick-steps-compound-actions.md zostaje, ale code
 * używa "Compound Action" / "Akcja seryjna" wyłącznie.
 */

import type { Action, ActionType } from '../../rule-builder/lib/rule-types';

export type CompoundShortcut = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface CompoundAction {
  id: string;
  name: string;
  /** Icon name (ContentIsMask compatible). */
  icon?: string;
  /** 1..9 — empty string = no shortcut. */
  shortcut?: CompoundShortcut;
  /** Jeśli undefined → globalne (wszystkie konta). Jeśli set → tylko ten account. */
  accountId?: string;
  /** Łańcuch akcji aplikowanych sekwencyjnie do każdego threadu. */
  actions: Action[];
  /** Pokaż w toolbar default? */
  showInToolbar: boolean;
  /** Pozycja w toolbar gdy showInToolbar=true. */
  toolbarOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** Destructive action types — wymagają WCAG 3.3.4 confirm dla bulk > BULK_DESTRUCTIVE_THRESHOLD. */
export const DESTRUCTIVE_ACTIONS: Set<ActionType> = new Set(['delete', 'forward', 'auto_reply']);

/** WCAG 3.3.4 — confirm gdy łańcuch zawiera destructive AND > 5 messages. */
export const BULK_DESTRUCTIVE_THRESHOLD = 5;

const STORAGE_KEY = 'actuna.compound-actions';

export interface ApplyPreview {
  /** Compound action being applied. */
  compoundId: string;
  /** Number of threads affected. */
  threadCount: number;
  /** True when destructive action AND threadCount > BULK_DESTRUCTIVE_THRESHOLD (WCAG 3.3.4). */
  requiresDestructiveConfirm: boolean;
  /** Destructive actions within the chain. */
  destructiveActions: Action[];
}

class CompoundActionStoreImpl {
  private _actions: Map<string, CompoundAction> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === CRUD ===

  create(input: {
    name: string;
    icon?: string;
    shortcut?: CompoundShortcut;
    accountId?: string;
    actions?: Action[];
    showInToolbar?: boolean;
  }): CompoundAction {
    if (!input.name || !input.name.trim()) {
      throw new Error('[CompoundAction] create: name required');
    }
    // Validate shortcut uniqueness per scope (global vs accountId)
    if (input.shortcut !== undefined) {
      const conflict = this._findShortcutConflict(input.shortcut, input.accountId);
      if (conflict) {
        throw new Error(`[CompoundAction] shortcut Ctrl/Cmd+Shift+${input.shortcut} already bound to "${conflict.name}"`);
      }
    }
    const id = this._generateId();
    const now = Date.now();
    const action: CompoundAction = {
      id,
      name: input.name.trim(),
      icon: input.icon,
      shortcut: input.shortcut,
      accountId: input.accountId,
      actions: input.actions || [],
      showInToolbar: input.showInToolbar ?? true,
      toolbarOrder: this._actions.size,
      createdAt: now,
      updatedAt: now,
    };
    this._actions.set(id, action);
    this._save();
    this._emit();
    return action;
  }

  update(id: string, patch: Partial<Omit<CompoundAction, 'id' | 'createdAt'>>): CompoundAction | undefined {
    const existing = this._actions.get(id);
    if (!existing) return undefined;
    // Validate shortcut change for conflicts (skip self)
    if (patch.shortcut !== undefined && patch.shortcut !== existing.shortcut) {
      const accountScope = patch.accountId !== undefined ? patch.accountId : existing.accountId;
      const conflict = this._findShortcutConflict(patch.shortcut, accountScope, id);
      if (conflict) {
        throw new Error(`[CompoundAction] shortcut Ctrl/Cmd+Shift+${patch.shortcut} already bound to "${conflict.name}"`);
      }
    }
    const updated: CompoundAction = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this._actions.set(id, updated);
    this._save();
    this._emit();
    return updated;
  }

  delete(id: string): boolean {
    const had = this._actions.delete(id);
    if (had) {
      // Re-pack toolbar order
      const list = this.list();
      list.forEach((a, idx) => { a.toolbarOrder = idx; });
      this._save();
      this._emit();
    }
    return had;
  }

  get(id: string): CompoundAction | undefined {
    return this._actions.get(id);
  }

  list(): CompoundAction[] {
    return Array.from(this._actions.values()).sort((a, b) => a.toolbarOrder - b.toolbarOrder);
  }

  /** List relevant for given account: globalne (accountId undefined) + per-account. */
  listForAccount(accountId: string): CompoundAction[] {
    return this.list().filter(a => a.accountId === undefined || a.accountId === accountId);
  }

  /** Tylko te zaznaczone "showInToolbar". */
  toolbarFor(accountId?: string): CompoundAction[] {
    const base = accountId ? this.listForAccount(accountId) : this.list();
    return base.filter(a => a.showInToolbar).sort((a, b) => a.toolbarOrder - b.toolbarOrder);
  }

  count(): number {
    return this._actions.size;
  }

  // === Shortcut binding ===

  /** Znajdź akcję po skrócie + scope (global lub account). */
  findByShortcut(shortcut: CompoundShortcut, accountId?: string): CompoundAction | undefined {
    for (const a of this._actions.values()) {
      if (a.shortcut !== shortcut) continue;
      if (a.accountId === undefined || a.accountId === accountId) return a;
    }
    return undefined;
  }

  /** Wszystkie zajęte skróty w danym scope (do UI greying). */
  usedShortcuts(accountId?: string): CompoundShortcut[] {
    const list = accountId ? this.listForAccount(accountId) : this.list();
    return list.filter(a => a.shortcut !== undefined).map(a => a.shortcut!);
  }

  // === Apply (preview + execute) ===

  previewApply(compoundId: string, threadIds: string[]): ApplyPreview {
    const compound = this._actions.get(compoundId);
    if (!compound) {
      return {
        compoundId,
        threadCount: threadIds.length,
        requiresDestructiveConfirm: false,
        destructiveActions: [],
      };
    }
    const destructive = compound.actions.filter(a => DESTRUCTIVE_ACTIONS.has(a.type));
    return {
      compoundId,
      threadCount: threadIds.length,
      requiresDestructiveConfirm: destructive.length > 0 && threadIds.length > BULK_DESTRUCTIVE_THRESHOLD,
      destructiveActions: destructive,
    };
  }

  // === Export / Import ===

  exportJSON(): string {
    return JSON.stringify({
      version: '1.0',
      exportedAt: Date.now(),
      compoundActions: this.list(),
    }, null, 2);
  }

  importJSON(json: string, options: { replace?: boolean } = {}): number {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.compoundActions)) {
      throw new Error('[CompoundAction] importJSON: invalid format — missing "compoundActions" array');
    }
    if (data.version && data.version !== '1.0') {
      console.warn(`[CompoundAction] importJSON: version mismatch — got ${data.version}, expected 1.0`);
    }
    if (options.replace) this._actions.clear();
    let count = 0;
    let nextOrder = this._actions.size;
    const now = Date.now();
    for (const a of data.compoundActions as CompoundAction[]) {
      if (!a.name || !Array.isArray(a.actions)) continue;
      // Import without shortcut to avoid conflicts — user must re-bind in Preferences
      const id = this._generateId();
      const compound: CompoundAction = {
        id,
        name: a.name,
        icon: a.icon,
        shortcut: undefined, // safety: drop shortcut on import
        accountId: a.accountId,
        actions: a.actions,
        showInToolbar: a.showInToolbar ?? false, // safety: hide from toolbar by default
        toolbarOrder: nextOrder++,
        createdAt: a.createdAt || now,
        updatedAt: now,
      };
      this._actions.set(id, compound);
      count++;
    }
    if (count > 0) {
      this._save();
      this._emit();
    }
    return count;
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._actions.clear();
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  // === internals ===

  private _findShortcutConflict(
    shortcut: CompoundShortcut,
    accountId: string | undefined,
    excludeId?: string,
  ): CompoundAction | undefined {
    for (const a of this._actions.values()) {
      if (excludeId && a.id === excludeId) continue;
      if (a.shortcut !== shortcut) continue;
      // Conflict gdy oba globalne, oba w tym samym account, lub jedno globalne + drugie w account
      // Global (undefined) konfliktuje z everything; account-specific konfliktuje tylko ze swoim account + globalnym
      if (a.accountId === undefined || accountId === undefined) return a;
      if (a.accountId === accountId) return a;
    }
    return undefined;
  }

  private _generateId(): string {
    return `compound_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as CompoundAction[];
      for (const a of arr) {
        if (a && a.id) this._actions.set(a.id, a);
      }
    } catch (e) {
      console.error('[CompoundAction] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.list()));
    } catch (e) {
      console.error('[CompoundAction] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[CompoundAction] listener error', e); }
    }
  }
}

export const CompoundActionStore = new CompoundActionStoreImpl();
