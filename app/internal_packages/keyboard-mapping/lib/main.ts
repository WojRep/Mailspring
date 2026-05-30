/**
 * Keyboard Mapping plugin entry — bilet MVP #109.
 */

import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import CheatSheetOverlay from './cheatsheet-overlay';
import { CheatSheetUIBus } from './cheatsheet-ui-bus';
import { KeyboardMappingStore } from './keyboard-mapping-store';
import { PRESET_BINDINGS, PRESET_LABELS_PL, PRESET_LABELS_EN } from './keymap-presets';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  KeyboardMappingStore.init();

  ComponentRegistry.register(CheatSheetOverlay, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'keyboard-mapping:open-cheat-sheet': () => openCheatSheet(),
      'keyboard-mapping:open-preferences': () => openPreferences(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'keyboard-mapping:cheat-sheet',
      label: 'Pokaż wszystkie skróty / Show keyboard shortcuts',
      section: 'Help',
      keywords: ['shortcuts', 'skróty', 'cheat sheet', 'keyboard', 'klawiatura', 'help'],
      shortcut: ['?'],
      handler: () => openCheatSheet(),
    });
    palette.register({
      id: 'keyboard-mapping:preferences',
      label: 'Zmień mapping klawiatury (Default/Apple Mail/Gmail/Outlook)',
      section: 'Settings',
      keywords: ['keyboard', 'mapping', 'preset', 'klawiatura', 'preferences'],
      handler: () => openPreferences(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.keyboardMapping = {
    Store: KeyboardMappingStore,
    PRESET_BINDINGS,
    labels_pl: PRESET_LABELS_PL,
    labels_en: PRESET_LABELS_EN,
  };
}

export function deactivate() {
  ComponentRegistry.unregister(CheatSheetOverlay);
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('keyboard-mapping:cheat-sheet');
    palette.unregister('keyboard-mapping:preferences');
  }
  if ((window as any).AppEnv?.keyboardMapping) {
    delete (window as any).AppEnv.keyboardMapping;
  }
}

function openCheatSheet(): void {
  CheatSheetUIBus.toggle();
}

function openPreferences(): void {
  console.info('[keyboard-mapping] open Preferences > Shortcuts');
}

export type { KeymapPreset, KeymapBinding, KeymapCategory } from './keymap-presets';
export type { KeymapSettings } from './keyboard-mapping-store';
