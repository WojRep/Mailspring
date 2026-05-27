/**
 * CommandPaletteStore — registry wszystkich actions dostępnych w palette.
 *
 * Bilet MVP #89 (Cmd+K Command Palette). Foundation tier MVP.
 *
 * Built-in commands ładowane przy activate(). Plugin API:
 *   CommandPalette.register({id, label, keywords, handler, scope})
 *   CommandPalette.unregister(id)
 *
 * Scope:
 *   - 'global' — zawsze dostępne
 *   - 'message-list' — gdy thread list focused
 *   - 'reading-pane' — gdy mail open
 *   - 'composer' — w composerze
 *
 * Reactive: Store emituje 'change' gdy registry się zmienia (Flux pattern
 * spójny z resztą ActunaMail — actuna-store base class).
 */

const ActunaStore = require('../../../src/global/actunamail-store').default || require('../../../src/global/actunamail-store');

export type PaletteScope = 'global' | 'message-list' | 'reading-pane' | 'composer';

export interface PaletteCommand {
  /** Unique id (np. 'mail:archive', 'composer:send-later'). */
  id: string;
  /** Display label (localized). */
  label: string;
  /** Optional secondary description (shown muted). */
  description?: string;
  /** Search keywords (fuzzy match). */
  keywords?: string[];
  /** Section header w palette (np. 'Mail', 'Navigation', 'Compose'). */
  section?: string;
  /** Optional SVG icon name (z app/static/images lub inline). */
  icon?: string;
  /** Skróty klawiszowe do wyświetlenia (info only — actual keymap w app/keymaps). */
  shortcut?: string[];
  /** Wykonywana akcja. Albo handler, albo command-id który dispatchnemy przez AppEnv.commands. */
  handler?: () => void;
  /** Alternatywa do handler — AppEnv.commands.dispatch(...) z tym id. */
  dispatchCommand?: string;
  /** Zakres (default 'global'). */
  scope?: PaletteScope;
}

class CommandPaletteStoreImpl {
  private _commands: Map<string, PaletteCommand> = new Map();
  private _open = false;
  private _query = '';
  private _selectedIndex = 0;
  private _listeners: Set<() => void> = new Set();

  /** Public API — register a command (idempotent: re-register replaces). */
  register(cmd: PaletteCommand): void {
    if (!cmd.id || !cmd.label) {
      console.warn('[CommandPalette] register: id + label required, got', cmd);
      return;
    }
    this._commands.set(cmd.id, { scope: 'global', ...cmd });
    this._emit();
  }

  /** Public API — unregister command by id. */
  unregister(id: string): void {
    if (this._commands.delete(id)) this._emit();
  }

  /** Public API — bulk register (built-in commands setup). */
  registerAll(cmds: PaletteCommand[]): void {
    for (const c of cmds) {
      if (!c.id || !c.label) continue;
      this._commands.set(c.id, { scope: 'global', ...c });
    }
    this._emit();
  }

  /** All commands (sorted by section then label). */
  getCommands(): PaletteCommand[] {
    return Array.from(this._commands.values()).sort((a, b) => {
      const sa = a.section || 'zzz';
      const sb = b.section || 'zzz';
      if (sa !== sb) return sa.localeCompare(sb);
      return a.label.localeCompare(b.label);
    });
  }

  /** Get one by id (for debugging / tests). */
  getCommand(id: string): PaletteCommand | undefined {
    return this._commands.get(id);
  }

  /** Toggle palette open/closed. */
  toggle(): void {
    this._open = !this._open;
    if (!this._open) {
      this._query = '';
      this._selectedIndex = 0;
    }
    this._emit();
  }

  open(): void {
    if (this._open) return;
    this._open = true;
    this._query = '';
    this._selectedIndex = 0;
    this._emit();
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this._query = '';
    this._selectedIndex = 0;
    this._emit();
  }

  isOpen(): boolean {
    return this._open;
  }

  getQuery(): string {
    return this._query;
  }

  setQuery(q: string): void {
    this._query = q;
    this._selectedIndex = 0;
    this._emit();
  }

  getSelectedIndex(): number {
    return this._selectedIndex;
  }

  setSelectedIndex(i: number): void {
    this._selectedIndex = Math.max(0, i);
    this._emit();
  }

  /** Execute command — uses handler if provided, falls back to dispatchCommand. */
  execute(id: string): boolean {
    const cmd = this._commands.get(id);
    if (!cmd) {
      console.warn('[CommandPalette] execute: unknown command', id);
      return false;
    }
    try {
      if (cmd.handler) {
        cmd.handler();
      } else if (cmd.dispatchCommand) {
        const target = document.activeElement || document.body;
        if (typeof (window as any).AppEnv?.commands?.dispatch === 'function') {
          (window as any).AppEnv.commands.dispatch(cmd.dispatchCommand, target);
        }
      } else {
        console.warn('[CommandPalette] command has no handler / dispatchCommand:', id);
        return false;
      }
    } catch (err) {
      console.error('[CommandPalette] execute error:', err);
      return false;
    }
    this.close();
    return true;
  }

  /** Flux subscription. */
  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[CommandPalette] listener error', e); }
    }
  }

  /** Test helper — reset state. */
  _reset(): void {
    this._commands.clear();
    this._open = false;
    this._query = '';
    this._selectedIndex = 0;
    this._listeners.clear();
  }
}

// Singleton store
export const CommandPaletteStore = new CommandPaletteStoreImpl();

// Public plugin API (eksportowane przez activate()).
export const CommandPalette = {
  register: (cmd: PaletteCommand) => CommandPaletteStore.register(cmd),
  unregister: (id: string) => CommandPaletteStore.unregister(id),
  open: () => CommandPaletteStore.open(),
  close: () => CommandPaletteStore.close(),
  toggle: () => CommandPaletteStore.toggle(),
};
