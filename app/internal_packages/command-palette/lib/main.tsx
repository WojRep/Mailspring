/**
 * Cmd+K Command Palette — plugin entry.
 *
 * Bilet MVP #89 (foundation tier). Faza E plan v1.0.
 *
 * activate():
 *   1. Load built-in commands do CommandPaletteStore.
 *   2. Register keyboard shortcut (mod+k / mod+shift+p) via AppEnv.commands.
 *   3. Mount CommandPalette React component as Sheet overlay.
 *   4. Eksportuj API publiczne (window.AppEnv.commandPalette).
 *
 * deactivate():
 *   1. Unmount component.
 *   2. Unregister keyboard shortcut.
 *   3. Reset store.
 */

import React from 'react';
import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import CommandPalette from './command-palette';
import { CommandPaletteStore, CommandPalette as CommandPaletteAPI } from './command-palette-store';
import { getBuiltInCommands } from './built-in-commands';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  // 1. Load built-in commands
  CommandPaletteStore.registerAll(getBuiltInCommands());

  // 2. Register keyboard shortcuts (palette toggle)
  // mod+k = Cmd+K (Mac) / Ctrl+K (Win/Linux)
  // mod+shift+p = alternative (palette VS Code style)
  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'command-palette:toggle': () => CommandPaletteStore.toggle(),
      'command-palette:open': () => CommandPaletteStore.open(),
      'command-palette:close': () => CommandPaletteStore.close(),
    });
  }

  // 3. Mount overlay component — Sheet.Global.Footer jest zawsze renderowane
  // niezależnie od top sheet. Komponent ma position:fixed w CSS, więc renderuje
  // jako overlay nad całą aplikacją gdy isOpen() jest true.
  ComponentRegistry.register(CommandPalette, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });

  // 4. Public API on AppEnv
  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.commandPalette = CommandPaletteAPI;
}

export function deactivate() {
  ComponentRegistry.unregister(CommandPalette);
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  if ((window as any).AppEnv?.commandPalette) {
    delete (window as any).AppEnv.commandPalette;
  }
  // NOTE: store not reset — re-activation reuses singleton.
  // Tests używają CommandPaletteStore._reset() explicit.
}
