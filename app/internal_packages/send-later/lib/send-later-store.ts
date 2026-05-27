/**
 * Send Later + Undo Send Store — bilet MVP #105.
 *
 * Dwa odrębne queue'y:
 *  1. **Scheduled** — drafts czekające na sendAt (Send Later). User może modify/cancel.
 *  2. **Undo window** — drafts po klik [Send], przez 5-30s w hold zanim faktyczny SMTP. User może Undo.
 *
 * Server-side path:
 *  - Gmail: prefer Gmail Schedule Send API gdy account.provider === 'gmail'.
 *  - Inne: local Outbox queue + scheduled fire przez #91 background-scheduler.
 *  - Warning UI: "Scheduled send wymaga aplikacji uruchomionej" gdy local-only.
 *
 * Undo flush mechanika: tickFlush(now?) — releases drafts z holdUntil <= now do SMTP dispatch.
 * Caller (scheduler #91 interval) dispatches faktyczny send + cleanup z queue.
 */

export type SendLaterServerSupport = 'gmail_api' | 'imap_outbox' | 'local_only';

export interface ScheduledDraft {
  draftId: string;
  /** Composer accountId. */
  accountId?: string;
  /** Server support level — determines Gmail API vs local queue. */
  serverSupport: SendLaterServerSupport;
  /** Unix ms — planned send time. */
  sendAt: number;
  /** Optional preset name (do UI label). */
  preset?: SendLaterPreset;
  /** Compose snapshot (subject + to[] + body summary) dla queue view. */
  snapshot?: { subject?: string; to?: string[]; bodyPreview?: string };
  scheduledAt: number;
}

export interface UndoWindowEntry {
  draftId: string;
  accountId?: string;
  /** Unix ms — kiedy hold expires + faktyczny send. */
  holdUntil: number;
  /** Configurable undo window seconds (5-30, WCAG 2.2.1). */
  undoWindowSec: number;
  /** Snapshot dla toast text. */
  snapshot?: { subject?: string; to?: string[] };
  enqueuedAt: number;
}

export interface FlushResult {
  /** Drafts whose hold expired — caller dispatches do SMTP + removes from queue. */
  toSend: UndoWindowEntry[];
}

export interface WakeScheduledResult {
  /** Scheduled drafts due — caller dispatches send. */
  due: ScheduledDraft[];
}

export type SendLaterPreset =
  | 'in_1h'
  | 'tomorrow_9am'
  | 'next_monday_morning'
  | 'custom';

const SCHEDULED_KEY = 'actuna.scheduled-drafts';
const UNDO_KEY = 'actuna.undo-window';
const SETTINGS_KEY = 'actuna.send-later-settings';

/** WCAG 2.2.1 — defaults + bounds. */
export const UNDO_WINDOW_DEFAULT_SEC = 5;
export const UNDO_WINDOW_MIN_SEC = 5;
export const UNDO_WINDOW_MAX_SEC = 30;

/** Right-to-disconnect warning bounds (KP soft warning). */
export const WORK_HOURS_START = 8;  // < 8:00 = poza godzinami
export const WORK_HOURS_END = 18;   // > 18:00 = poza godzinami

export interface SendLaterSettings {
  undoWindowSec: number;
}

class SendLaterStoreImpl {
  private _scheduled: Map<string, ScheduledDraft> = new Map();
  private _undoWindow: Map<string, UndoWindowEntry> = new Map();
  private _settings: SendLaterSettings = { undoWindowSec: UNDO_WINDOW_DEFAULT_SEC };
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Settings ===

  getSettings(): SendLaterSettings {
    return { ...this._settings };
  }

  setUndoWindow(sec: number): void {
    if (sec < UNDO_WINDOW_MIN_SEC || sec > UNDO_WINDOW_MAX_SEC) {
      throw new Error(`[SendLater] undo window must be ${UNDO_WINDOW_MIN_SEC}-${UNDO_WINDOW_MAX_SEC}s`);
    }
    this._settings.undoWindowSec = sec;
    this._saveSettings();
    this._emit();
  }

  // === Send Later API ===

  schedule(input: {
    draftId: string;
    sendAt: number;
    accountId?: string;
    serverSupport?: SendLaterServerSupport;
    preset?: SendLaterPreset;
    snapshot?: ScheduledDraft['snapshot'];
  }): ScheduledDraft {
    if (!input.draftId) throw new Error('[SendLater] draftId required');
    if (input.sendAt <= Date.now()) throw new Error('[SendLater] sendAt must be in future');
    const draft: ScheduledDraft = {
      draftId: input.draftId,
      accountId: input.accountId,
      serverSupport: input.serverSupport || 'local_only',
      sendAt: input.sendAt,
      preset: input.preset,
      snapshot: input.snapshot,
      scheduledAt: Date.now(),
    };
    this._scheduled.set(input.draftId, draft);
    this._saveScheduled();
    this._emit();
    return draft;
  }

  cancel(draftId: string): ScheduledDraft | undefined {
    const draft = this._scheduled.get(draftId);
    if (!draft) return undefined;
    this._scheduled.delete(draftId);
    this._saveScheduled();
    this._emit();
    return draft;
  }

  modify(draftId: string, newSendAt: number): ScheduledDraft | undefined {
    const draft = this._scheduled.get(draftId);
    if (!draft) return undefined;
    if (newSendAt <= Date.now()) throw new Error('[SendLater] newSendAt must be in future');
    draft.sendAt = newSendAt;
    draft.preset = undefined; // custom override
    this._saveScheduled();
    this._emit();
    return draft;
  }

  listScheduled(): ScheduledDraft[] {
    return Array.from(this._scheduled.values()).sort((a, b) => a.sendAt - b.sendAt);
  }

  listScheduledForAccount(accountId: string): ScheduledDraft[] {
    return this.listScheduled().filter(d => d.accountId === accountId);
  }

  getScheduled(draftId: string): ScheduledDraft | undefined {
    return this._scheduled.get(draftId);
  }

  countScheduled(): number {
    return this._scheduled.size;
  }

  wakeScheduled(now = Date.now()): WakeScheduledResult {
    const due: ScheduledDraft[] = [];
    for (const [id, d] of this._scheduled.entries()) {
      if (d.sendAt <= now) {
        due.push(d);
        this._scheduled.delete(id);
      }
    }
    if (due.length > 0) {
      this._saveScheduled();
      this._emit();
    }
    return { due };
  }

  // === Undo Send API ===

  /**
   * Enqueue draft po klik [Send] z hold = now + undoWindowSec.
   * Wraca entry z holdUntil — UI używa do toast countdown.
   */
  enqueueForUndo(input: {
    draftId: string;
    accountId?: string;
    snapshot?: UndoWindowEntry['snapshot'];
  }): UndoWindowEntry {
    if (!input.draftId) throw new Error('[SendLater] draftId required');
    const now = Date.now();
    const entry: UndoWindowEntry = {
      draftId: input.draftId,
      accountId: input.accountId,
      holdUntil: now + this._settings.undoWindowSec * 1000,
      undoWindowSec: this._settings.undoWindowSec,
      snapshot: input.snapshot,
      enqueuedAt: now,
    };
    this._undoWindow.set(input.draftId, entry);
    this._saveUndo();
    this._emit();
    return entry;
  }

  /** User clicked Undo → return entry to caller (caller restores draft to Drafts folder). */
  undo(draftId: string): UndoWindowEntry | undefined {
    const entry = this._undoWindow.get(draftId);
    if (!entry) return undefined;
    if (Date.now() > entry.holdUntil) {
      // Already past hold — too late for undo
      return undefined;
    }
    this._undoWindow.delete(draftId);
    this._saveUndo();
    this._emit();
    return entry;
  }

  /** Drafts whose hold expired — caller dispatches do SMTP send + removes. */
  tickFlush(now = Date.now()): FlushResult {
    const toSend: UndoWindowEntry[] = [];
    for (const [id, e] of this._undoWindow.entries()) {
      if (e.holdUntil <= now) {
        toSend.push(e);
        this._undoWindow.delete(id);
      }
    }
    if (toSend.length > 0) {
      this._saveUndo();
      this._emit();
    }
    return { toSend };
  }

  listUndoWindow(): UndoWindowEntry[] {
    return Array.from(this._undoWindow.values()).sort((a, b) => a.holdUntil - b.holdUntil);
  }

  countUndoWindow(): number {
    return this._undoWindow.size;
  }

  // === Right-to-disconnect warning ===

  /**
   * KP "right to disconnect" soft warning detection.
   * Returns true gdy sendAt poza godzinami pracy (< 8:00 lub > 18:00 weekdays, or weekends).
   * UI pokazuje warning dialog "Wysyłka poza godzinami pracy — kontynuować?".
   */
  isPozaGodzinamiPracy(sendAt: number): boolean {
    const d = new Date(sendAt);
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return true;
    const h = d.getHours();
    if (h < WORK_HOURS_START || h >= WORK_HOURS_END) return true;
    return false;
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._scheduled.clear();
    this._undoWindow.clear();
    this._settings = { undoWindowSec: UNDO_WINDOW_DEFAULT_SEC };
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(SCHEDULED_KEY);
      localStorage.removeItem(UNDO_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    } catch (e) { /* node env */ }
  }

  // === internals ===

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const rawS = localStorage.getItem(SCHEDULED_KEY);
      if (rawS) {
        const arr = JSON.parse(rawS) as ScheduledDraft[];
        for (const d of arr) if (d && d.draftId) this._scheduled.set(d.draftId, d);
      }
      const rawU = localStorage.getItem(UNDO_KEY);
      if (rawU) {
        const arr = JSON.parse(rawU) as UndoWindowEntry[];
        for (const e of arr) if (e && e.draftId) this._undoWindow.set(e.draftId, e);
      }
      const rawSet = localStorage.getItem(SETTINGS_KEY);
      if (rawSet) {
        const s = JSON.parse(rawSet) as SendLaterSettings;
        if (s && typeof s.undoWindowSec === 'number') {
          this._settings = { undoWindowSec: Math.max(UNDO_WINDOW_MIN_SEC, Math.min(UNDO_WINDOW_MAX_SEC, s.undoWindowSec)) };
        }
      }
    } catch (e) {
      console.error('[SendLater] load failed:', e);
    }
  }

  private _saveScheduled(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SCHEDULED_KEY, JSON.stringify(Array.from(this._scheduled.values())));
    } catch (e) {
      console.error('[SendLater] save scheduled failed:', e);
    }
  }

  private _saveUndo(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(UNDO_KEY, JSON.stringify(Array.from(this._undoWindow.values())));
    } catch (e) {
      console.error('[SendLater] save undo failed:', e);
    }
  }

  private _saveSettings(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
    } catch (e) {
      console.error('[SendLater] save settings failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[SendLater] listener error', e); }
    }
  }
}

export const SendLaterStore = new SendLaterStoreImpl();
