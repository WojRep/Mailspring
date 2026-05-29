/**
 * SmartFolderUIBus — singleton bus dla SmartFolderWizard open/close + edit state.
 *
 * Bilet MVP #99 (UI implementation). Wzór: TagSystemUIBus / SnoozeUIBus.
 *
 * editingFolderId !== null oznacza edit mode (load existing folder); null
 * oznacza create new folder z pustym formularzem.
 */

type Listener = () => void;

class SmartFolderUIBusImpl {
  private _open = false;
  private _editingFolderId: string | null = null;
  private _listeners: Set<Listener> = new Set();

  isWizardOpen(): boolean {
    return this._open;
  }

  getEditingFolderId(): string | null {
    return this._editingFolderId;
  }

  openWizard(folderId: string | null = null): void {
    this._open = true;
    this._editingFolderId = folderId;
    this._emit();
  }

  closeWizard(): void {
    if (!this._open) return;
    this._open = false;
    this._editingFolderId = null;
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
    this._editingFolderId = null;
    this._listeners.clear();
  }
}

export const SmartFolderUIBus = new SmartFolderUIBusImpl();
