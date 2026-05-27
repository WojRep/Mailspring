/**
 * Background Scheduler Store — bilet MVP #91.
 *
 * Persistent queue scheduled actions z idempotency + audit log integration.
 *
 * Storage strategy:
 *   - Primary: localStorage `actuna.scheduler.actions` (JSON serialized).
 *     Simple bo DatabaseStore w Mailspring inheritance jest read-only z
 *     Electron-side (sync engine pisze do SQLite). Scheduler actions to
 *     local-only state, nie wymaga sync między device — localStorage OK.
 *   - Future migration path (v1.x): schema migration do dedicated SQLite
 *     `scheduled_actions` table via sync engine extension. Wymaga changes
 *     w C++ Mailspring-Sync — odłożone.
 *
 * Fire mechanism: setTimeout per action, plus re-check on startup
 * (handles app restart while action pending).
 *
 * Idempotency: action marked `status: done` po wykonaniu — re-fire safe.
 *
 * Cross-device gotcha: scheduler local per device. Server-side fallback
 * (#104 IMAP `\Snoozed`, #105 Gmail Schedule Send API) jest osobnym layer.
 */

const STORAGE_KEY = 'actuna.scheduler.actions';

export type ScheduledActionType =
  | 'snooze'        // #104 Snooze (return mail to inbox)
  | 'send-later'    // #105 Send Later (real SMTP send)
  | 'follow-up'     // #106 Follow-up reminder
  | 'rule'          // #100 scheduled rule fire
  | 'custom';       // plugin-defined

export type ActionStatus = 'pending' | 'done' | 'cancelled' | 'failed';

export interface ScheduledAction {
  id: string;
  type: ScheduledActionType;
  /** Unix timestamp ms gdy odpalić. */
  fireAt: number;
  /** Action-specific payload (mail id, recipients, etc.). */
  payload: any;
  status: ActionStatus;
  createdAt: number;
  firedAt?: number;
  cancelledAt?: number;
  failedAt?: number;
  failureReason?: string;
  /** Optional account id (per-account scoping). */
  accountId?: string;
  /** Optional description for audit log / UI. */
  description?: string;
}

export interface ScheduleParams {
  id?: string;
  type: ScheduledActionType;
  fireAt: number | Date;
  payload: any;
  accountId?: string;
  description?: string;
}

type FireHandler = (action: ScheduledAction) => Promise<void> | void;

class SchedulerStoreImpl {
  private _actions: Map<string, ScheduledAction> = new Map();
  private _timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _handlers: Map<ScheduledActionType, FireHandler> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  /** Initialize — load actions from storage + schedule pending. */
  init(): void {
    if (this._loaded) return;
    this._load();
    this._scheduleAllPending();
    this._loaded = true;
  }

  /** Register handler dla danego action type. */
  registerHandler(type: ScheduledActionType, handler: FireHandler): void {
    this._handlers.set(type, handler);
  }

  /** Schedule new action. Returns generated id. */
  schedule(params: ScheduleParams): string {
    const id = params.id || this._generateId();
    const fireAt = typeof params.fireAt === 'number' ? params.fireAt : params.fireAt.getTime();
    if (fireAt <= Date.now()) {
      console.warn('[Scheduler] schedule: fireAt is past, action will fire immediately');
    }
    const action: ScheduledAction = {
      id,
      type: params.type,
      fireAt,
      payload: params.payload,
      status: 'pending',
      createdAt: Date.now(),
      accountId: params.accountId,
      description: params.description,
    };
    this._actions.set(id, action);
    this._save();
    this._scheduleTimer(action);
    this._emit();
    return id;
  }

  /** Cancel pending action. */
  cancel(id: string): boolean {
    const action = this._actions.get(id);
    if (!action || action.status !== 'pending') return false;
    action.status = 'cancelled';
    action.cancelledAt = Date.now();
    this._clearTimer(id);
    this._save();
    this._emit();
    return true;
  }

  /** List actions, optionally filtered. */
  list(filter: { type?: ScheduledActionType; status?: ActionStatus; accountId?: string } = {}): ScheduledAction[] {
    let result = Array.from(this._actions.values());
    if (filter.type) result = result.filter(a => a.type === filter.type);
    if (filter.status) result = result.filter(a => a.status === filter.status);
    if (filter.accountId) result = result.filter(a => a.accountId === filter.accountId);
    return result.sort((a, b) => a.fireAt - b.fireAt);
  }

  /** Get action by id. */
  get(id: string): ScheduledAction | undefined {
    return this._actions.get(id);
  }

  /** Get count per status. */
  stats(): { pending: number; done: number; cancelled: number; failed: number } {
    const stats = { pending: 0, done: 0, cancelled: 0, failed: 0 };
    for (const a of this._actions.values()) {
      stats[a.status]++;
    }
    return stats;
  }

  /** Subscribe to changes. */
  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  /** Purge old completed actions (retention policy). Default: 30 dni. */
  purgeOld(retentionDays = 30): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let purged = 0;
    for (const [id, a] of this._actions.entries()) {
      const refTime = a.firedAt || a.cancelledAt || a.failedAt;
      if (a.status !== 'pending' && refTime && refTime < cutoff) {
        this._actions.delete(id);
        purged++;
      }
    }
    if (purged > 0) {
      this._save();
      this._emit();
    }
    return purged;
  }

  /** Test helper — reset. */
  _reset(): void {
    for (const id of this._timers.keys()) this._clearTimer(id);
    this._actions.clear();
    this._timers.clear();
    this._handlers.clear();
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  /** Force-fire action immediately (testing + manual trigger). */
  async fireNow(id: string): Promise<boolean> {
    const action = this._actions.get(id);
    if (!action || action.status !== 'pending') return false;
    return this._fire(action);
  }

  // === internals ===

  private _generateId(): string {
    return `sch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as ScheduledAction[];
      for (const a of arr) {
        if (a.id) this._actions.set(a.id, a);
      }
    } catch (e) {
      console.error('[Scheduler] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._actions.values())));
    } catch (e) {
      console.error('[Scheduler] save failed:', e);
    }
  }

  private _scheduleAllPending(): void {
    const now = Date.now();
    for (const a of this._actions.values()) {
      if (a.status === 'pending') {
        if (a.fireAt <= now) {
          // Past-due (app was offline) — fire immediately
          setImmediate(() => this._fire(a));
        } else {
          this._scheduleTimer(a);
        }
      }
    }
  }

  private _scheduleTimer(action: ScheduledAction): void {
    this._clearTimer(action.id);
    const delay = Math.max(0, action.fireAt - Date.now());
    // setTimeout max ~24.8 dni (2^31-1 ms). Dla dłuższych delay'ów potrzebny
    // chunked timer — but typical scheduled actions to godziny/dni/tygodnie,
    // > 24 dni = corner case. Plan: re-schedule on app restart.
    if (delay > 2_000_000_000) {
      console.log(`[Scheduler] action ${action.id} fires >24 dni — re-schedule on next startup`);
      return;
    }
    const timer = setTimeout(() => this._fire(action), delay);
    this._timers.set(action.id, timer);
  }

  private _clearTimer(id: string): void {
    const t = this._timers.get(id);
    if (t) {
      clearTimeout(t);
      this._timers.delete(id);
    }
  }

  private async _fire(action: ScheduledAction): Promise<boolean> {
    if (action.status !== 'pending') return false; // idempotent
    this._clearTimer(action.id);
    const handler = this._handlers.get(action.type);
    if (!handler) {
      console.warn(`[Scheduler] no handler for type "${action.type}" — marking failed`);
      action.status = 'failed';
      action.failedAt = Date.now();
      action.failureReason = `no handler for type "${action.type}"`;
      this._save();
      this._emit();
      return false;
    }
    try {
      await handler(action);
      action.status = 'done';
      action.firedAt = Date.now();
      this._save();
      this._emit();
      return true;
    } catch (err: any) {
      console.error(`[Scheduler] fire failed for ${action.id}:`, err);
      action.status = 'failed';
      action.failedAt = Date.now();
      action.failureReason = String(err?.message || err);
      this._save();
      this._emit();
      return false;
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[Scheduler] listener error', e); }
    }
  }
}

// Singleton
export const SchedulerStore = new SchedulerStoreImpl();

// Public plugin API
export const BackgroundScheduler = {
  schedule: (p: ScheduleParams) => SchedulerStore.schedule(p),
  cancel: (id: string) => SchedulerStore.cancel(id),
  list: (filter?: { type?: ScheduledActionType; status?: ActionStatus; accountId?: string }) =>
    SchedulerStore.list(filter),
  get: (id: string) => SchedulerStore.get(id),
  stats: () => SchedulerStore.stats(),
  registerHandler: (type: ScheduledActionType, handler: FireHandler) =>
    SchedulerStore.registerHandler(type, handler),
  fireNow: (id: string) => SchedulerStore.fireNow(id),
  purgeOld: (retentionDays?: number) => SchedulerStore.purgeOld(retentionDays),
};
