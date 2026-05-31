/**
 * PinStore — pinned threads.
 *
 * Bilet #93 + decyzja cross-device plan_to_version_1.0/46.
 *
 * Storage: localStorage `actuna.pinned-threads` to INSTANT LOCAL CACHE (szybkie
 * odczyty/UI). Źródłem prawdy między urządzeniami jest synchronizowany atrybut
 * `Thread.pinned` niesiony keywordem IMAP `$Pinned`. pin/unpin wysyłają
 * ChangePinnedTask → silnik C++ ustawia keyword na serwerze (uniwersalnie,
 * cross-device); serwer bez wsparcia własnych keywordów → fallback lokalny.
 *
 * ActunaMail (fork upstream) ma osobny `Thread.starred` (boolean) o innej
 * semantyce:
 *   - starred = user favourite (gwiazdka), 1 click toggle
 *   - pinned = "przyklejony na top" (manifest §1), Shift+P shortcut
 *
 * Pin sort weight: pinned threads na top w Inbox view (sort po pinnedAt desc) —
 * realizowane przez zapytanie po `Thread.pinned` (osobny krok sort/filter).
 */

const STORAGE_KEY = 'actuna.pinned-threads';
// One-time guard: marks that pre-existing local pins were pushed to the server
// as `$Pinned` keywords (decyzja plan_to_version_1.0/46).
const MIGRATED_KEY = 'actuna.pinned-migrated-v46';

class PinStoreImpl {
  private _pinned: Map<string, number> = new Map(); // threadId → pinnedAt timestamp
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
    this._migrateLocalPinsToServer();
  }

  /**
   * Jednorazowa migracja (decyzja plan_to_version_1.0/46): piny utworzone na
   * starszej, lokalnej wersji nigdy nie trafiły na serwer. Przy pierwszym
   * uruchomieniu po update wypychamy je keywordem `$Pinned` (ChangePinnedTask),
   * żeby stały się cross-device. Idempotentne (flaga w localStorage).
   */
  private _migrateLocalPinsToServer(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      if (localStorage.getItem(MIGRATED_KEY)) return;
      for (const threadId of this._pinned.keys()) {
        this._queueSyncTask(threadId, true);
      }
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch (e) {
      /* storage error — retry next launch */
    }
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
    this._queueSyncTask(threadId, true);
  }

  unpin(threadId: string): void {
    if (!this._pinned.has(threadId)) return;
    this._pinned.delete(threadId);
    this._save();
    this._emit();
    this._queueSyncTask(threadId, false);
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

  /**
   * Cross-device (decyzja plan_to_version_1.0/46): odzwierciedl pin w
   * synchronizowanym modelu przez ChangePinnedTask → silnik C++ ustawia keyword
   * IMAP `$Pinned` na serwerze. localStorage to instant cache; keyword = źródło
   * prawdy między urządzeniami. Fire-and-forget; brak exports/threadu = no-op.
   */
  private _queueSyncTask(threadId: string, pinned: boolean): void {
    try {
      const exp = require('actunamail-exports');
      const { DatabaseStore, Thread, Actions, ChangePinnedTask } = exp;
      if (!DatabaseStore || !ChangePinnedTask || !Actions) return;
      Promise.resolve(DatabaseStore.find(Thread, threadId))
        .then((thread: any) => {
          if (thread) {
            Actions.queueTask(new ChangePinnedTask({ threads: [thread], pinned }));
          }
        })
        .catch(() => {
          /* offline / not found — local cache still reflects the pin */
        });
    } catch (e) {
      /* actunamail-exports unavailable (node-only context) */
    }
  }

  _reset(): void {
    this._pinned.clear();
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(MIGRATED_KEY);
    } catch (e) {
      /* node env */
    }
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
      try {
        cb();
      } catch (e) {
        console.error('[PinStore] listener error', e);
      }
    }
  }
}

export const PinStore = new PinStoreImpl();
