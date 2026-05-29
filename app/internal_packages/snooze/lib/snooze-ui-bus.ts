/**
 * SnoozeUIBus — singleton bus dla SnoozePicker open/close state.
 *
 * Bilet MVP #104 (UI implementation). Wzór: TagSystemUIBus / GlassDemoStore.
 *
 * Drży which thread aktualnie open w pickerze + open/close state. React
 * komponent subskrybuje przez listen() i syncuje state. Cmd+Shift+H lub
 * Cmd+K palette command wywołuje openPicker(threadId).
 */

type Listener = () => void;

class SnoozeUIBusImpl {
  private _open = false;
  private _threadId: string | null = null;
  private _listeners: Set<Listener> = new Set();

  isPickerOpen(): boolean {
    return this._open;
  }

  getPickerThreadId(): string | null {
    return this._threadId;
  }

  openPicker(threadId: string | null): void {
    this._open = true;
    this._threadId = threadId;
    this._emit();
  }

  closePicker(): void {
    if (!this._open) return;
    this._open = false;
    this._threadId = null;
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

  /** Test helper. */
  _reset(): void {
    this._open = false;
    this._threadId = null;
    this._listeners.clear();
  }
}

export const SnoozeUIBus = new SnoozeUIBusImpl();
