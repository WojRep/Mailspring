/**
 * Snooze Store — bilet MVP #104.
 *
 * Ukrywa thread z Inbox aż do wakeAt, wraca jako nowy (top of Inbox + "Snoozed" badge).
 *
 * Storage: localStorage + in-memory queue. Real IMAP `\Snoozed` keyword
 * adapter (services/imap-snooze.ts) wymaga mailsync-bridge extension — local-only
 * z warning na cross-device gdy account bez support.
 *
 * Implementacja: deterministic wake check (`tickWake(now?)`) callable z scheduler
 * (#91) interval — nie używamy setTimeout (server-restart safety).
 */

import { SnoozePreset, resolvePreset } from './snooze-presets';

export type SnoozeServerSupport = 'gmail' | 'imap_keyword' | 'local_only';

export interface SnoozeEntry {
  threadId: string;
  /** Original folder where thread lived przed snooze (do restore). */
  originalFolder?: string;
  /** Account id thread należy do (do per-account server support detection). */
  accountId?: string;
  /** Server support level dla tego accountu. */
  serverSupport: SnoozeServerSupport;
  /** Unix ms — kiedy thread ma się obudzić. */
  wakeAt: number;
  /** Optional preset name (label do UI). Undefined dla custom date. */
  preset?: SnoozePreset;
  /** Optional user-provided note. */
  note?: string;
  snoozedAt: number;
}

export interface WakeResult {
  /** Threads, które się obudziły w tym tick. */
  awakened: SnoozeEntry[];
}

const STORAGE_KEY = 'actuna.snoozed-threads';

class SnoozeStoreImpl {
  private _entries: Map<string, SnoozeEntry> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Snooze API ===

  snoozeByPreset(threadId: string, preset: SnoozePreset, opts: Partial<Omit<SnoozeEntry, 'threadId' | 'wakeAt' | 'preset' | 'snoozedAt'>> = {}, now = new Date()): SnoozeEntry {
    return this._snooze(threadId, resolvePreset(preset, now), { ...opts, preset });
  }

  snoozeUntil(threadId: string, wakeAt: number, opts: Partial<Omit<SnoozeEntry, 'threadId' | 'wakeAt' | 'snoozedAt'>> = {}): SnoozeEntry {
    if (wakeAt <= Date.now()) {
      throw new Error('[Snooze] snoozeUntil: wakeAt must be in future');
    }
    return this._snooze(threadId, wakeAt, opts);
  }

  unsnooze(threadId: string): SnoozeEntry | undefined {
    const entry = this._entries.get(threadId);
    if (!entry) return undefined;
    this._entries.delete(threadId);
    this._save();
    this._emit();
    return entry;
  }

  modify(threadId: string, newWakeAt: number): SnoozeEntry | undefined {
    const entry = this._entries.get(threadId);
    if (!entry) return undefined;
    if (newWakeAt <= Date.now()) {
      throw new Error('[Snooze] modify: newWakeAt must be in future');
    }
    entry.wakeAt = newWakeAt;
    entry.preset = undefined; // custom override
    this._save();
    this._emit();
    return entry;
  }

  // === Query ===

  get(threadId: string): SnoozeEntry | undefined {
    return this._entries.get(threadId);
  }

  isSnoozed(threadId: string): boolean {
    return this._entries.has(threadId);
  }

  /** All entries sorted by wakeAt ascending. */
  list(): SnoozeEntry[] {
    return Array.from(this._entries.values()).sort((a, b) => a.wakeAt - b.wakeAt);
  }

  /** Per-account filter. */
  listForAccount(accountId: string): SnoozeEntry[] {
    return this.list().filter(e => e.accountId === accountId);
  }

  count(): number {
    return this._entries.size;
  }

  /** Earliest wakeAt or undefined gdy queue empty. */
  nextWakeAt(): number | undefined {
    const sorted = this.list();
    return sorted[0]?.wakeAt;
  }

  /** Total local-only count (do cross-device warning). */
  countLocalOnly(): number {
    return this.list().filter(e => e.serverSupport === 'local_only').length;
  }

  // === Wake tick ===

  /**
   * Check which entries have wakeAt <= now, remove them, return awakened.
   * Caller (scheduler #91 interval, lub na startup) dispatches awakened do
   * Mailspring Task system (move from Snoozed folder → Inbox + emit notification).
   */
  tickWake(now = Date.now()): WakeResult {
    const awakened: SnoozeEntry[] = [];
    for (const [tid, entry] of this._entries.entries()) {
      if (entry.wakeAt <= now) {
        awakened.push(entry);
        this._entries.delete(tid);
      }
    }
    if (awakened.length > 0) {
      this._save();
      this._emit();
    }
    return { awakened };
  }

  // === a11y helper ===

  /**
   * WCAG 4.1.3 aria-label do Snoozed badge.
   * "5 maili w snooze, najwcześniejszy wraca jutro 9:00".
   */
  ariaLabel(locale: 'pl' | 'en' = 'pl'): string {
    const n = this.count();
    if (n === 0) {
      return locale === 'pl' ? 'Brak maili w snooze' : 'No snoozed mails';
    }
    const next = this.nextWakeAt()!;
    const dt = new Date(next);
    const dateStr = dt.toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-US', {
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
    return locale === 'pl'
      ? `${n} ${n === 1 ? 'mail' : 'maili'} w snooze, najwcześniejszy wraca ${dateStr}`
      : `${n} snoozed ${n === 1 ? 'mail' : 'mails'}, earliest returns ${dateStr}`;
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._entries.clear();
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  // === internals ===

  private _snooze(threadId: string, wakeAt: number, opts: Partial<SnoozeEntry>): SnoozeEntry {
    if (!threadId) throw new Error('[Snooze] threadId required');
    const entry: SnoozeEntry = {
      threadId,
      originalFolder: opts.originalFolder,
      accountId: opts.accountId,
      serverSupport: opts.serverSupport || 'local_only',
      wakeAt,
      preset: opts.preset,
      note: opts.note,
      snoozedAt: Date.now(),
    };
    this._entries.set(threadId, entry);
    this._save();
    this._emit();
    return entry;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as SnoozeEntry[];
      for (const e of arr) {
        if (e && e.threadId) this._entries.set(e.threadId, e);
      }
    } catch (e) {
      console.error('[Snooze] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._entries.values())));
    } catch (e) {
      console.error('[Snooze] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[Snooze] listener error', e); }
    }
  }
}

export const SnoozeStore = new SnoozeStoreImpl();
