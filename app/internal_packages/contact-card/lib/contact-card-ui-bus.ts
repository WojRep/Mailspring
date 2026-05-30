/**
 * ContactCardUIBus — singleton bus dla Contact Card open/close state.
 * Plan v1.0 #102. Wzór: SnoozeUIBus / SmartFolderUIBus.
 */

type Listener = () => void;

class ContactCardUIBusImpl {
  private _open = false;
  private _email: string | null = null;
  private _listeners: Set<Listener> = new Set();

  isOpen(): boolean { return this._open; }
  getEmail(): string | null { return this._email; }

  openFor(email: string | null): void {
    this._open = true;
    this._email = email;
    this._emit();
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this._email = null;
    this._emit();
  }

  listen(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _emit(): void {
    for (const fn of this._listeners) {
      try { fn(); } catch (e) { /* swallow */ }
    }
  }

  _reset(): void {
    this._open = false;
    this._email = null;
    this._listeners.clear();
  }
}

export const ContactCardUIBus = new ContactCardUIBusImpl();
