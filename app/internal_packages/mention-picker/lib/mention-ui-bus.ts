/**
 * MentionUIBus — singleton bus for MentionDropdown open/close + query.
 * Plan v1.0 #108.
 */
type Listener = () => void;

class MentionUIBusImpl {
  private _open = false;
  private _query = '';
  private _listeners: Set<Listener> = new Set();

  isOpen(): boolean { return this._open; }
  getQuery(): string { return this._query; }

  openWithQuery(q: string): void { this._open = true; this._query = q; this._emit(); }
  setQuery(q: string): void { this._query = q; if (this._open) this._emit(); }
  close(): void { if (!this._open) return; this._open = false; this._query = ''; this._emit(); }

  listen(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _emit(): void { for (const fn of this._listeners) { try { fn(); } catch (e) {} } }

  _reset(): void { this._open = false; this._query = ''; this._listeners.clear(); }
}

export const MentionUIBus = new MentionUIBusImpl();
