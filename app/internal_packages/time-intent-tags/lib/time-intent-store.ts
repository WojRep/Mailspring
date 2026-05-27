/**
 * Time-Intent Tags Store — bilet MVP #96.
 *
 * Trzy built-in system tagi: Today / Upcoming / Anytime. Per-thread
 * assignment (jeden tag per thread, exclusive).
 *
 * Storage: localStorage `actuna.time-intent-tags` (Map<threadId, intent>).
 *
 * Auto-rollover (midnight): items oznaczone Today bez ukończenia automatycznie
 * przechodzą do Anytime. Implementacja: setInterval check co minutę, jeśli
 * przekroczył midnight od ostatniego rollover → wykonaj.
 *
 * Manifest §5 (intent-first) — Time-intent jest dimensjon priorytetu (Today =
 * pilne, Upcoming = zaplanowane, Anytime = backlog/no urgency).
 *
 * Keyboard: T / U / A / X w focused message context.
 */

export type TimeIntent = 'today' | 'upcoming' | 'anytime';

export const TAG_TODAY = '__system_today';
export const TAG_UPCOMING = '__system_upcoming';
export const TAG_ANYTIME = '__system_anytime';

/** System tag mapping (np. dla integration z tag picker #98). */
export const SYSTEM_TAGS: Record<TimeIntent, string> = {
  today: TAG_TODAY,
  upcoming: TAG_UPCOMING,
  anytime: TAG_ANYTIME,
};

const STORAGE_KEY = 'actuna.time-intent-tags';
const STORAGE_LAST_ROLLOVER = 'actuna.time-intent-tags.last-rollover';

class TimeIntentStoreImpl {
  private _assignments: Map<string, TimeIntent> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;
  private _rolloverInterval: any = null;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._maybeRollover();
    this._startRolloverWatcher();
    this._loaded = true;
  }

  /** Get current intent assignment for thread (undefined if none). */
  get(threadId: string): TimeIntent | undefined {
    return this._assignments.get(threadId);
  }

  /** Set intent (exclusive — overrides previous). */
  set(threadId: string, intent: TimeIntent): void {
    if (!threadId) return;
    if (this._assignments.get(threadId) === intent) return; // idempotent
    this._assignments.set(threadId, intent);
    this._save();
    this._emit();
  }

  /** Remove intent assignment (no assignment = thread w neutral state). */
  clear(threadId: string): boolean {
    const had = this._assignments.delete(threadId);
    if (had) {
      this._save();
      this._emit();
    }
    return had;
  }

  /** List threads with given intent. */
  list(intent: TimeIntent): string[] {
    const result: string[] = [];
    for (const [tid, i] of this._assignments.entries()) {
      if (i === intent) result.push(tid);
    }
    return result;
  }

  /** Stats per intent. */
  stats(): Record<TimeIntent, number> {
    const s: Record<TimeIntent, number> = { today: 0, upcoming: 0, anytime: 0 };
    for (const i of this._assignments.values()) {
      s[i]++;
    }
    return s;
  }

  /**
   * Midnight rollover: Today → Anytime dla items niesplaszczonych.
   * Run manualnie lub przez interval watcher.
   * Returns count moved.
   */
  rolloverNow(): number {
    let count = 0;
    for (const [tid, intent] of Array.from(this._assignments.entries())) {
      if (intent === 'today') {
        this._assignments.set(tid, 'anytime');
        count++;
      }
    }
    if (count > 0) {
      this._save();
      this._emit();
    }
    this._setLastRollover(Date.now());
    return count;
  }

  /** Get last rollover timestamp. */
  getLastRollover(): number {
    try {
      const raw = localStorage.getItem(STORAGE_LAST_ROLLOVER);
      return raw ? parseInt(raw, 10) : 0;
    } catch (e) { return 0; }
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._assignments.clear();
    this._listeners.clear();
    this._loaded = false;
    if (this._rolloverInterval) {
      clearInterval(this._rolloverInterval);
      this._rolloverInterval = null;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_LAST_ROLLOVER);
    } catch (e) { /* node env */ }
  }

  // === internals ===

  /** Check if midnight passed since last rollover; if yes, execute. */
  private _maybeRollover(): void {
    const last = this.getLastRollover();
    const now = new Date();
    const lastDate = new Date(last);
    // Different calendar date → rollover needed
    if (last === 0 || lastDate.toDateString() !== now.toDateString()) {
      this.rolloverNow();
    }
  }

  private _startRolloverWatcher(): void {
    // Check every 5 minutes (lightweight)
    if (typeof setInterval === 'undefined') return;
    this._rolloverInterval = setInterval(() => this._maybeRollover(), 5 * 60 * 1000);
  }

  private _setLastRollover(ts: number): void {
    try {
      localStorage.setItem(STORAGE_LAST_ROLLOVER, String(ts));
    } catch (e) { /* node env */ }
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw) as Array<[string, TimeIntent]>;
      for (const [tid, intent] of entries) {
        if (tid && (intent === 'today' || intent === 'upcoming' || intent === 'anytime')) {
          this._assignments.set(tid, intent);
        }
      }
    } catch (e) {
      console.error('[TimeIntent] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._assignments.entries())));
    } catch (e) {
      console.error('[TimeIntent] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[TimeIntent] listener error', e); }
    }
  }
}

export const TimeIntentStore = new TimeIntentStoreImpl();
