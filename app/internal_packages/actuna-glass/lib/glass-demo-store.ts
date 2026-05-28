/**
 * GlassDemoStore — bilet MVP #92.
 *
 * Simple open/close state dla demo overlay. Singleton with listen() pattern
 * mirroring CommandPaletteStore (#89).
 */

class GlassDemoStoreImpl {
  private _open = false;
  private _listeners: Set<() => void> = new Set();

  isOpen(): boolean { return this._open; }

  open(): void {
    if (this._open) return;
    this._open = true;
    this._emit();
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this._emit();
  }

  toggle(): void {
    this._open = !this._open;
    this._emit();
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._open = false;
    this._listeners.clear();
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[GlassDemoStore] listener error', e); }
    }
  }
}

export const GlassDemoStore = new GlassDemoStoreImpl();
