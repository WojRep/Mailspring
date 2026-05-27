/**
 * Centrum dnia plugin entry — bilet MVP #95.
 *
 * activate():
 *   1. CentrumDniaStore.init() — restore pane state + collapsed sections.
 *   2. Bind shortcut `mod-shift-d` (Cmd+Shift+D) → toggle pane.
 *   3. Cmd+K palette commands.
 *   4. Expose `AppEnv.centrumDnia` public API.
 */

import { CentrumDniaStore } from './centrum-dnia-store';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  CentrumDniaStore.init();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'centrum-dnia:toggle-pane': () => CentrumDniaStore.togglePane(),
      'centrum-dnia:open-pane': () => CentrumDniaStore.openPane(),
      'centrum-dnia:close-pane': () => CentrumDniaStore.closePane(),
      'centrum-dnia:refresh': () => CentrumDniaStore.refresh(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'centrum-dnia:toggle',
      label: 'Centrum dnia / Today pane (toggle)',
      section: 'View',
      keywords: ['today', 'dzień', 'dzis', 'centrum', 'pane', 'sidebar', 'my day'],
      shortcut: ['⌘', '⇧', 'D'],
      handler: () => CentrumDniaStore.togglePane(),
    });
    palette.register({
      id: 'centrum-dnia:refresh',
      label: 'Odśwież Centrum dnia / Refresh Today pane',
      section: 'View',
      keywords: ['refresh', 'odśwież', 'today'],
      handler: () => CentrumDniaStore.refresh(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.centrumDnia = {
    Store: CentrumDniaStore,
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('centrum-dnia:toggle');
    palette.unregister('centrum-dnia:refresh');
  }
  if ((window as any).AppEnv?.centrumDnia) {
    delete (window as any).AppEnv.centrumDnia;
  }
}
