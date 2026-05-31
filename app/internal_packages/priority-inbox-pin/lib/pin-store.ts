/**
 * PinStore — local-only pinned threads tracking.
 *
 * Bilet MVP #93. Storage: localStorage `actuna.pinned-threads` (Set<threadId>).
 *
 * Cross-device sync: NIE (local-only w MVP). Plan v1.x:
 * IMAP $Important keyword jako proxy dla cross-device.
 *
 * Mailspring inheritance ma `Thread.starred` (boolean) ale to osobna semantyka:
 *   - starred = user favourite (różowe), 1 click toggle
 *   - pinned = "przyklejony na top" (manifest §1), Shift+P shortcut
 *
 * Pin sort weight: pinned threads zawsze na top w Inbox view, sortowane
 * po pin time desc.
 */

const STORAGE_KEY = 'actuna.pinned-threads';

class PinStoreImpl {
  private _pinned: Map<string, number> = new Map(); // threadId → pinnedAt timestamp
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  isPinned(threadId: string): boolean {
    return this._pinned.has(threadId);
  }

  pin(threadId: string): void {
    if (!threadId) return;
    if (this._pinned.has(threadId)) return; // idempotent
    this._pinned.set(threadId, Date.now());
    this._save();
    this._emit();
  }

  unpin(threadId: string): void {
    if (!this._pinned.has(threadId)) return;
    this._pinned.delete(threadId);
    this._save();
    this._emit();
  }

  toggle(threadId: string): boolean {
    if (this._pinned.has(threadId)) {
      this.unpin(threadId);
      return false;
    }
    this.pin(threadId);
    return true;
  }

  /** Lista pinned thread ids sortowana po pinnedAt desc (najnowsze pierwsze). */
  list(): Array<{ threadId: string; pinnedAt: number }> {
    return Array.from(this._pinned.entries())
      .map(([threadId, pinnedAt]) => ({ threadId, pinnedAt }))
      .sort((a, b) => b.pinnedAt - a.pinnedAt);
  }

  count(): number {
    return this._pinned.size;
  }

  /** Zwraca timestamp przypięcia thread (do sort weight). 0 gdy nie pinned. */
  getPinnedAt(threadId: string): number {
    return this._pinned.get(threadId) || 0;
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._pinned.clear();
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as Array<[string, number]>;
      for (const [id, ts] of arr) {
        if (id && typeof ts === 'number') this._pinned.set(id, ts);
      }
    } catch (e) {
      console.error('[PinStore] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._pinned.entries())));
    } catch (e) {
      console.error('[PinStore] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[PinStore] listener error', e); }
    }
  }
}

export const PinStore = new PinStoreImpl();
