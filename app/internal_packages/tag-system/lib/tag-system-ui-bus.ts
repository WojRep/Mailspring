/**
 * TagSystemUIBus — singleton dla open/close picker/manager events.
 *
 * Bilet MVP #98 UI implementation. Replaces console.info dispatchers w main.ts.
 *
 * State:
 *  - pickerThreadId: string|null — gdy non-null, TagPicker overlay open dla tego threada.
 *  - managerOpen: boolean — gdy true, Tag Manager Preferences focus.
 *
 * Mirrors CommandPaletteStore (#89) listen pattern.
 */

class TagSystemUIBusImpl {
  private _pickerThreadId: string | null = null;
  private _managerOpen = false;
  private _listeners: Set<() => void> = new Set();

  // === Picker ===

  isPickerOpen(): boolean { return this._pickerThreadId !== null; }
  getPickerThreadId(): string | null { return this._pickerThreadId; }

  openPicker(threadId: string): void {
    if (!threadId) return;
    if (this._pickerThreadId === threadId) return;
    this._pickerThreadId = threadId;
    this._emit();
  }

  closePicker(): void {
    if (this._pickerThreadId === null) return;
    this._pickerThreadId = null;
    this._emit();
  }

  // === Manager ===

  isManagerOpen(): boolean { return this._managerOpen; }

  openManager(): void {
    if (this._managerOpen) return;
    this._managerOpen = true;
    this._emit();
  }

  closeManager(): void {
    if (!this._managerOpen) return;
    this._managerOpen = false;
    this._emit();
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._pickerThreadId = null;
    this._managerOpen = false;
    this._listeners.clear();
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[TagSystemUIBus] listener error', e); }
    }
  }
}

export const TagSystemUIBus = new TagSystemUIBusImpl();
