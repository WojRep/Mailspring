/**
 * CheatSheetUIBus — singleton bus dla CheatSheet overlay (#109).
 */
type Listener = () => void;

class CheatSheetUIBusImpl {
  private _open = false;
  private _listeners: Set<Listener> = new Set();

  isOpen(): boolean { return this._open; }
  open(): void { this._open = true; this._emit(); }
  close(): void { if (!this._open) return; this._open = false; this._emit(); }
  toggle(): void { this._open = !this._open; this._emit(); }
  listen(fn: Listener): () => void { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  private _emit(): void { for (const fn of this._listeners) { try { fn(); } catch (e) {} } }
  _reset(): void { this._open = false; this._listeners.clear(); }
}

export const CheatSheetUIBus = new CheatSheetUIBusImpl();
