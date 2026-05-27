/**
 * Audit Log Store — bilet MVP #114.
 *
 * Cross-cutting audit infrastructure dla compliance ticketów (#94/#98/#100/#104/
 * #105/#106/#111/#112/#113). KNF Rec. D §22 + Rec. Z §43 (retention).
 *
 * Tamper-evidence: każdy entry ma prev_hash (chain) — wymyk zostawia ślad.
 * Hash = SHA-256-like deterministic short hash (16 hex) z prev_hash + content.
 * Faktyczny WebCrypto SHA-256 — TODO crypto-integration (tu fallback djb2).
 *
 * RODO Art. 17 right-to-erasure: cascade purge audit gdy account/contact deleted.
 * Retention: 30/90/180/365/1825 dni (5 lat = KNF Rec. Z §43 max).
 */

export type AuditActor = 'user' | 'system' | 'ai';

export type AuditSubsystem =
  | 'tags'
  | 'rules'
  | 'contacts'
  | 'time'
  | 'privacy'
  | 'pgp'
  | 'gatekeeper'
  | 'consent'
  | 'smart_folder'
  | 'compound_action'
  | 'tracker'
  | 'mdn'
  | 'other';

export interface AuditEntry {
  id: string;
  timestamp: number;
  actor: AuditActor;
  eventType: string;
  subsystem: AuditSubsystem;
  /** Affected target id (threadId / contactEmail / ruleId / etc.) — accountable. */
  targetId?: string;
  /** State przed change (JSON-serialized). */
  beforeJson?: any;
  /** State po change. */
  afterJson?: any;
  /** Extra metadata (request context, IP, etc.) — caller dostarcza. */
  metadataJson?: any;
  /** Chain hash — links to previous entry (tamper detection). */
  prevHash: string;
  /** This entry hash. */
  hash: string;
}

export interface AuditSettings {
  /** Retention days. 30/90/180/365/1825. Default 90. */
  retentionDays: number;
}

export interface AuditFilter {
  subsystem?: AuditSubsystem;
  eventType?: string;
  actor?: AuditActor;
  /** Range start (Unix ms). */
  fromTs?: number;
  /** Range end (Unix ms). */
  toTs?: number;
  /** Target id substring. */
  targetIdLike?: string;
}

const STORAGE_KEY = 'actuna.audit-log';
const SETTINGS_KEY = 'actuna.audit-settings';

export const RETENTION_OPTIONS_DAYS = [30, 90, 180, 365, 1825];
export const RETENTION_DEFAULT_DAYS = 90;
/** KNF Rec. Z §43 maximum — 5 years. */
export const RETENTION_MAX_DAYS = 1825;

/** Genesis prev_hash dla pierwszego entry. */
const GENESIS_HASH = '0'.repeat(16);

class AuditLogStoreImpl {
  private _entries: AuditEntry[] = [];
  private _settings: AuditSettings = { retentionDays: RETENTION_DEFAULT_DAYS };
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Settings ===

  getSettings(): AuditSettings {
    return { ...this._settings };
  }

  setRetentionDays(days: number): void {
    if (!RETENTION_OPTIONS_DAYS.includes(days)) {
      throw new Error(`[Audit] retention must be one of ${RETENTION_OPTIONS_DAYS.join('/')} days`);
    }
    this._settings.retentionDays = days;
    this._saveSettings();
    this._emit();
  }

  // === Log API ===

  log(input: {
    actor?: AuditActor;
    eventType: string;
    subsystem: AuditSubsystem;
    targetId?: string;
    before?: any;
    after?: any;
    metadata?: any;
  }): AuditEntry {
    if (!input.eventType || !input.subsystem) {
      throw new Error('[Audit] eventType + subsystem required');
    }
    const prevHash = this._entries.length > 0
      ? this._entries[this._entries.length - 1].hash
      : GENESIS_HASH;
    const entry: AuditEntry = {
      id: this._generateId(),
      timestamp: Date.now(),
      actor: input.actor || 'user',
      eventType: input.eventType,
      subsystem: input.subsystem,
      targetId: input.targetId,
      beforeJson: input.before,
      afterJson: input.after,
      metadataJson: input.metadata,
      prevHash,
      hash: '', // computed below
    };
    entry.hash = computeEntryHash(entry);
    this._entries.push(entry);
    this._save();
    this._emit();
    return entry;
  }

  // === Query ===

  count(): number {
    return this._entries.length;
  }

  list(): AuditEntry[] {
    return [...this._entries];
  }

  /** Paginated list. */
  listPaginated(page: number, perPage = 50): { entries: AuditEntry[]; totalPages: number } {
    const total = this._entries.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const sorted = [...this._entries].sort((a, b) => b.timestamp - a.timestamp); // newest first
    const start = page * perPage;
    return { entries: sorted.slice(start, start + perPage), totalPages };
  }

  /** Filter entries. */
  filter(f: AuditFilter): AuditEntry[] {
    return this._entries.filter(e => {
      if (f.subsystem && e.subsystem !== f.subsystem) return false;
      if (f.eventType && e.eventType !== f.eventType) return false;
      if (f.actor && e.actor !== f.actor) return false;
      if (f.fromTs !== undefined && e.timestamp < f.fromTs) return false;
      if (f.toTs !== undefined && e.timestamp > f.toTs) return false;
      if (f.targetIdLike && (!e.targetId || !e.targetId.includes(f.targetIdLike))) return false;
      return true;
    });
  }

  // === Retention purge ===

  /** Background daily job — usuwa entries older than retentionDays. */
  purgeExpired(now = Date.now()): number {
    const cutoff = now - this._settings.retentionDays * 24 * 60 * 60 * 1000;
    const before = this._entries.length;
    this._entries = this._entries.filter(e => e.timestamp >= cutoff);
    const removed = before - this._entries.length;
    if (removed > 0) {
      this._save();
      this._emit();
    }
    return removed;
  }

  /** Manual purge all. */
  purgeAll(): number {
    const removed = this._entries.length;
    this._entries = [];
    this._save();
    this._emit();
    return removed;
  }

  /** Art. 17 right-to-erasure — cascade purge gdy account/contact deleted. */
  purgeByTargetId(targetId: string): number {
    const before = this._entries.length;
    this._entries = this._entries.filter(e => e.targetId !== targetId);
    const removed = before - this._entries.length;
    if (removed > 0) {
      this._save();
      this._emit();
    }
    return removed;
  }

  /** Bulk purge by subsystem (np. cleanup whole subsystem). */
  purgeBySubsystem(subsystem: AuditSubsystem): number {
    const before = this._entries.length;
    this._entries = this._entries.filter(e => e.subsystem !== subsystem);
    const removed = before - this._entries.length;
    if (removed > 0) {
      this._save();
      this._emit();
    }
    return removed;
  }

  // === Tamper detection ===

  /** Verify chain integrity — true gdy każdy prev_hash matches poprzedni hash + content. */
  verifyChain(): { valid: boolean; firstInvalidIndex?: number } {
    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < this._entries.length; i++) {
      const e = this._entries[i];
      if (e.prevHash !== expectedPrev) return { valid: false, firstInvalidIndex: i };
      const recomputed = computeEntryHash(e);
      if (recomputed !== e.hash) return { valid: false, firstInvalidIndex: i };
      expectedPrev = e.hash;
    }
    return { valid: true };
  }

  // === Export ===

  /** Export filtered entries to JSON. */
  exportJSON(filter?: AuditFilter): string {
    const entries = filter ? this.filter(filter) : this.list();
    return JSON.stringify({
      schemaVersion: '1.0',
      exportedAt: Date.now(),
      retentionDays: this._settings.retentionDays,
      chainValid: this.verifyChain().valid,
      entries,
    }, null, 2);
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._entries = [];
    this._settings = { retentionDays: RETENTION_DEFAULT_DAYS };
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    } catch (e) { /* node env */ }
  }

  // === internals ===

  private _generateId(): string {
    return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as AuditEntry[];
        for (const e of arr) {
          if (e && e.id) this._entries.push(e);
        }
      }
      const rawSet = localStorage.getItem(SETTINGS_KEY);
      if (rawSet) {
        const s = JSON.parse(rawSet) as AuditSettings;
        if (s && RETENTION_OPTIONS_DAYS.includes(s.retentionDays)) {
          this._settings.retentionDays = s.retentionDays;
        }
      }
    } catch (e) {
      console.error('[Audit] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._entries));
    } catch (e) {
      console.error('[Audit] save failed:', e);
    }
  }

  private _saveSettings(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
    } catch (e) {
      console.error('[Audit] save settings failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[Audit] listener error', e); }
    }
  }
}

export const AuditLogStore = new AuditLogStoreImpl();

/**
 * Compute entry hash — deterministic z prev_hash + content (excludes own .hash field).
 *
 * TODO crypto-integration: replace djb2 + base16 z WebCrypto SHA-256.
 * Tu fallback dla testów (deterministic, no native deps).
 */
export function computeEntryHash(entry: AuditEntry): string {
  const canonical = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    actor: entry.actor,
    eventType: entry.eventType,
    subsystem: entry.subsystem,
    targetId: entry.targetId,
    beforeJson: entry.beforeJson,
    afterJson: entry.afterJson,
    metadataJson: entry.metadataJson,
    prevHash: entry.prevHash,
  });
  // djb2 hash → 8 hex chars; pad/concat z reverse-djb2 do 16 hex
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 7) + h2 + c) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
