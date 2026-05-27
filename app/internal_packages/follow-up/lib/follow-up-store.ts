/**
 * Follow-up Store — bilet MVP #106.
 *
 * Detect outbound threads bez inbound reply > N dni.
 * Sidebar "Waiting" list + per-thread snooze/dismiss/resolve + manual reminder.
 *
 * Background job (depends #91 scheduler): daily detection sweep.
 * Storage: localStorage.
 */

export type WaitingStatus = 'pending' | 'snoozed' | 'dismissed' | 'resolved';

export interface WaitingEntry {
  threadId: string;
  /** Last outbound message Unix ms — "kiedy wysłałem ostatnio". */
  lastOutboundAt: number;
  /** Recipient email (do contact card linkage z #102). */
  recipient?: string;
  /** Subject snapshot dla sidebar list view. */
  subject?: string;
  status: WaitingStatus;
  /** Gdy status='snoozed' — kiedy ponownie się pojawić. */
  snoozeUntil?: number;
  /** Manual reminder set w composer ("remind me if no response in X days") — date trigger. */
  manualRemindAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DetectionInput {
  threadId: string;
  lastOutboundAt: number;
  lastInboundAt?: number;
  recipient?: string;
  subject?: string;
}

export interface DetectionResult {
  /** New entries created (threads that crossed threshold this sweep). */
  newWaiting: WaitingEntry[];
  /** Already-tracked entries skipped. */
  skippedExisting: number;
  /** Entries auto-resolved (because lastInboundAt > lastOutboundAt — someone replied). */
  autoResolved: WaitingEntry[];
}

export interface FollowUpSettings {
  /** Days after lastOutbound po którym uznajemy thread za "waiting". */
  detectionThresholdDays: number;
}

const STORAGE_KEY = 'actuna.waiting-followups';
const SETTINGS_KEY = 'actuna.followup-settings';

export const DETECTION_THRESHOLD_DEFAULT_DAYS = 3;
export const DETECTION_THRESHOLD_MIN_DAYS = 1;
export const DETECTION_THRESHOLD_MAX_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

class FollowUpStoreImpl {
  private _entries: Map<string, WaitingEntry> = new Map();
  private _settings: FollowUpSettings = { detectionThresholdDays: DETECTION_THRESHOLD_DEFAULT_DAYS };
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Settings ===

  getSettings(): FollowUpSettings {
    return { ...this._settings };
  }

  setDetectionThreshold(days: number): void {
    if (days < DETECTION_THRESHOLD_MIN_DAYS || days > DETECTION_THRESHOLD_MAX_DAYS) {
      throw new Error(`[FollowUp] threshold must be ${DETECTION_THRESHOLD_MIN_DAYS}-${DETECTION_THRESHOLD_MAX_DAYS} days`);
    }
    this._settings.detectionThresholdDays = days;
    this._saveSettings();
    this._emit();
  }

  // === Detection sweep ===

  /**
   * Background daily detection. Caller dostarcza thread metadata (lastOutbound + lastInbound + recipient/subject).
   *
   * Logika:
   *  - Auto-resolve: jeśli istnieje entry I lastInbound > lastOutbound → status='resolved'.
   *  - Skip: istnieje entry pending/snoozed/dismissed → no-op.
   *  - Create: gdy NIE istnieje entry I (now - lastOutbound) > threshold I brak lastInbound > lastOutbound → status='pending'.
   */
  runDetection(threads: DetectionInput[], now = Date.now()): DetectionResult {
    const thresholdMs = this._settings.detectionThresholdDays * DAY_MS;
    const newWaiting: WaitingEntry[] = [];
    const autoResolved: WaitingEntry[] = [];
    let skippedExisting = 0;

    for (const t of threads) {
      const existing = this._entries.get(t.threadId);
      const hasReply = t.lastInboundAt !== undefined && t.lastInboundAt > t.lastOutboundAt;

      if (existing) {
        if (hasReply && existing.status !== 'resolved') {
          existing.status = 'resolved';
          existing.updatedAt = now;
          autoResolved.push(existing);
        } else {
          skippedExisting++;
        }
        continue;
      }

      if (hasReply) continue; // never tracked, already replied — nic do detekcji
      const ageMs = now - t.lastOutboundAt;
      if (ageMs <= thresholdMs) continue; // too fresh

      const entry: WaitingEntry = {
        threadId: t.threadId,
        lastOutboundAt: t.lastOutboundAt,
        recipient: t.recipient,
        subject: t.subject,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      this._entries.set(entry.threadId, entry);
      newWaiting.push(entry);
    }

    if (newWaiting.length > 0 || autoResolved.length > 0) {
      this._save();
      this._emit();
    }
    return { newWaiting, skippedExisting, autoResolved };
  }

  // === Per-thread actions ===

  snooze(threadId: string, untilAt: number): WaitingEntry | undefined {
    const entry = this._entries.get(threadId);
    if (!entry) return undefined;
    if (untilAt <= Date.now()) throw new Error('[FollowUp] snooze untilAt must be in future');
    entry.status = 'snoozed';
    entry.snoozeUntil = untilAt;
    entry.updatedAt = Date.now();
    this._save();
    this._emit();
    return entry;
  }

  dismiss(threadId: string): WaitingEntry | undefined {
    return this._setStatus(threadId, 'dismissed');
  }

  markResolved(threadId: string): WaitingEntry | undefined {
    return this._setStatus(threadId, 'resolved');
  }

  /** Tick: snoozed entries z snoozeUntil <= now → status='pending'. */
  tickUnsnooze(now = Date.now()): WaitingEntry[] {
    const restored: WaitingEntry[] = [];
    for (const entry of this._entries.values()) {
      if (entry.status === 'snoozed' && entry.snoozeUntil !== undefined && entry.snoozeUntil <= now) {
        entry.status = 'pending';
        entry.snoozeUntil = undefined;
        entry.updatedAt = now;
        restored.push(entry);
      }
    }
    if (restored.length > 0) {
      this._save();
      this._emit();
    }
    return restored;
  }

  // === Manual reminder (composer) ===

  /** Composer: "Remind me if no response in N days" → set manualRemindAt. */
  setManualReminder(threadId: string, recipient: string | undefined, subject: string | undefined, lastOutboundAt: number, inDays: number): WaitingEntry {
    if (inDays < 1 || inDays > 30) {
      throw new Error('[FollowUp] manual reminder days must be 1-30');
    }
    const remindAt = lastOutboundAt + inDays * DAY_MS;
    const now = Date.now();
    const existing = this._entries.get(threadId);
    if (existing) {
      existing.manualRemindAt = remindAt;
      existing.recipient = recipient ?? existing.recipient;
      existing.subject = subject ?? existing.subject;
      existing.lastOutboundAt = lastOutboundAt;
      existing.updatedAt = now;
      this._save();
      this._emit();
      return existing;
    }
    const entry: WaitingEntry = {
      threadId,
      lastOutboundAt,
      recipient,
      subject,
      status: 'pending',
      manualRemindAt: remindAt,
      createdAt: now,
      updatedAt: now,
    };
    this._entries.set(threadId, entry);
    this._save();
    this._emit();
    return entry;
  }

  /** Tick: entries z manualRemindAt <= now → notification fire (caller dispatches). */
  tickManualReminders(now = Date.now()): WaitingEntry[] {
    const due: WaitingEntry[] = [];
    for (const entry of this._entries.values()) {
      if (entry.manualRemindAt !== undefined && entry.manualRemindAt <= now && entry.status === 'pending') {
        due.push(entry);
        // Clear manualRemindAt to avoid double-fire
        entry.manualRemindAt = undefined;
        entry.updatedAt = now;
      }
    }
    if (due.length > 0) {
      this._save();
      this._emit();
    }
    return due;
  }

  // === Query ===

  get(threadId: string): WaitingEntry | undefined {
    return this._entries.get(threadId);
  }

  /** Active = pending only (UI sidebar default). Sortuje wg ageing (oldest lastOutbound first). */
  listActive(): WaitingEntry[] {
    return Array.from(this._entries.values())
      .filter(e => e.status === 'pending')
      .sort((a, b) => a.lastOutboundAt - b.lastOutboundAt);
  }

  listByStatus(status: WaitingStatus): WaitingEntry[] {
    return Array.from(this._entries.values()).filter(e => e.status === status);
  }

  /** Per-recipient (do #102 contact card "Pending follow-ups"). */
  listForRecipient(recipient: string): WaitingEntry[] {
    const r = recipient.toLowerCase().trim();
    return Array.from(this._entries.values())
      .filter(e => e.status === 'pending' && (e.recipient || '').toLowerCase() === r);
  }

  countActive(): number {
    return this.listActive().length;
  }

  count(): number {
    return this._entries.size;
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._entries.clear();
    this._settings = { detectionThresholdDays: DETECTION_THRESHOLD_DEFAULT_DAYS };
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    } catch (e) { /* node env */ }
  }

  // === internals ===

  private _setStatus(threadId: string, status: WaitingStatus): WaitingEntry | undefined {
    const entry = this._entries.get(threadId);
    if (!entry) return undefined;
    entry.status = status;
    entry.updatedAt = Date.now();
    this._save();
    this._emit();
    return entry;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as WaitingEntry[];
        for (const e of arr) {
          if (e && e.threadId) this._entries.set(e.threadId, e);
        }
      }
      const rawSet = localStorage.getItem(SETTINGS_KEY);
      if (rawSet) {
        const s = JSON.parse(rawSet) as FollowUpSettings;
        if (s && typeof s.detectionThresholdDays === 'number') {
          this._settings = {
            detectionThresholdDays: Math.max(
              DETECTION_THRESHOLD_MIN_DAYS,
              Math.min(DETECTION_THRESHOLD_MAX_DAYS, s.detectionThresholdDays),
            ),
          };
        }
      }
    } catch (e) {
      console.error('[FollowUp] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._entries.values())));
    } catch (e) {
      console.error('[FollowUp] save failed:', e);
    }
  }

  private _saveSettings(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
    } catch (e) {
      console.error('[FollowUp] save settings failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[FollowUp] listener error', e); }
    }
  }
}

export const FollowUpStore = new FollowUpStoreImpl();
