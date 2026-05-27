/**
 * Subscription Store — bilet MVP #115.
 *
 * Aggregates List-Unsubscribe info per sender. Status tracking per unsubscribe action.
 *
 * Real SMTP send mailto + browser open URL — wire-up w UI ticket.
 * Background scan headers wire-up w mailsync-bridge integration.
 */

import { UnsubscribeInfo } from './list-unsubscribe-parser';

export type UnsubscribeStatus = 'pending' | 'sent' | 'confirmed' | 'failed' | 'blocked';

export interface SubscriptionEntry {
  /** Sender domain lub email (lowercased) — primary key. */
  sender: string;
  /** Display name (z From header). */
  senderName?: string;
  /** Last seen List-Unsubscribe payload. */
  unsubscribeInfo?: UnsubscribeInfo;
  /** Count received emails od tego sendera. */
  receivedCount: number;
  /** Unix ms ostatniego received. */
  lastReceivedAt: number;
  /** Status. */
  status: UnsubscribeStatus;
  /** Unix ms gdy unsubscribe sent. */
  unsubscribedAt?: number;
  /** Unix ms gdy confirmed (RFC 8058 one-click POST returned 200). */
  confirmedAt?: number;
  /** Error message gdy failed. */
  errorMessage?: string;
}

const STORAGE_KEY = 'actuna.subscriptions';

class SubscriptionStoreImpl {
  private _entries: Map<string, SubscriptionEntry> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Scan / aggregate ===

  /**
   * Record incoming message — inkrementuje receivedCount + updates unsubscribeInfo.
   * Background scan caller wywołuje per nową wiadomość z List-Unsubscribe.
   */
  recordIncoming(input: {
    sender: string;
    senderName?: string;
    unsubscribeInfo?: UnsubscribeInfo;
    receivedAt?: number;
  }): SubscriptionEntry {
    const key = this._normalize(input.sender);
    if (!key) throw new Error('[Subscription] sender required');
    const now = input.receivedAt || Date.now();
    const existing = this._entries.get(key);
    const entry: SubscriptionEntry = existing
      ? {
          ...existing,
          senderName: input.senderName || existing.senderName,
          unsubscribeInfo: input.unsubscribeInfo || existing.unsubscribeInfo,
          receivedCount: existing.receivedCount + 1,
          lastReceivedAt: Math.max(existing.lastReceivedAt, now),
        }
      : {
          sender: key,
          senderName: input.senderName,
          unsubscribeInfo: input.unsubscribeInfo,
          receivedCount: 1,
          lastReceivedAt: now,
          status: 'pending',
        };
    this._entries.set(key, entry);
    this._save();
    this._emit();
    return entry;
  }

  // === Unsubscribe actions ===

  /** Mark sent — caller dispatched mailto SMTP lub HTTP browser open. */
  markSent(sender: string, opts: { method?: 'mailto' | 'http' } = {}): SubscriptionEntry | undefined {
    const entry = this._entries.get(this._normalize(sender));
    if (!entry) return undefined;
    entry.status = 'sent';
    entry.unsubscribedAt = Date.now();
    if (opts.method) (entry as any).method = opts.method;
    this._save();
    this._emit();
    return entry;
  }

  /** Mark confirmed (RFC 8058 one-click POST returned 200). */
  markConfirmed(sender: string): SubscriptionEntry | undefined {
    const entry = this._entries.get(this._normalize(sender));
    if (!entry) return undefined;
    entry.status = 'confirmed';
    entry.confirmedAt = Date.now();
    this._save();
    this._emit();
    return entry;
  }

  markFailed(sender: string, errorMessage: string): SubscriptionEntry | undefined {
    const entry = this._entries.get(this._normalize(sender));
    if (!entry) return undefined;
    entry.status = 'failed';
    entry.errorMessage = errorMessage;
    this._save();
    this._emit();
    return entry;
  }

  /** Block sender alternative — gdy unsubscribe nie działa, oznacz blocked (UI dispatches auto-rule #100). */
  markBlocked(sender: string): SubscriptionEntry | undefined {
    const entry = this._entries.get(this._normalize(sender));
    if (!entry) return undefined;
    entry.status = 'blocked';
    this._save();
    this._emit();
    return entry;
  }

  // === Bulk ===

  /** Bulk select — apply markSent dla każdego sender. Returns count. */
  bulkMarkSent(senders: string[]): number {
    let count = 0;
    for (const s of senders) {
      if (this.markSent(s)) count++;
    }
    return count;
  }

  // === Query ===

  get(sender: string): SubscriptionEntry | undefined {
    return this._entries.get(this._normalize(sender));
  }

  list(): SubscriptionEntry[] {
    return Array.from(this._entries.values()).sort((a, b) => b.lastReceivedAt - a.lastReceivedAt);
  }

  listByStatus(status: UnsubscribeStatus): SubscriptionEntry[] {
    return this.list().filter(e => e.status === status);
  }

  /** Tylko subskrypcje z dostępnym mechanizmem unsubscribe. */
  listActionable(): SubscriptionEntry[] {
    return this.list().filter(e =>
      e.status === 'pending' &&
      e.unsubscribeInfo &&
      (e.unsubscribeInfo.mailto || e.unsubscribeInfo.httpUrl),
    );
  }

  count(): number {
    return this._entries.size;
  }

  countActionable(): number {
    return this.listActionable().length;
  }

  remove(sender: string): boolean {
    const had = this._entries.delete(this._normalize(sender));
    if (had) {
      this._save();
      this._emit();
    }
    return had;
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

  private _normalize(sender: string): string {
    return (sender || '').toLowerCase().trim();
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as SubscriptionEntry[];
      for (const e of arr) {
        if (e && e.sender) this._entries.set(e.sender, e);
      }
    } catch (e) {
      console.error('[Subscription] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._entries.values())));
    } catch (e) {
      console.error('[Subscription] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[Subscription] listener error', e); }
    }
  }
}

export const SubscriptionStore = new SubscriptionStoreImpl();
