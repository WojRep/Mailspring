/**
 * Threading-tree plugin entry — bilet MVP #97.
 *
 * activate():
 *   1. Register `core.mail.threadingTree` config schema (default ON dla
 *      [OSTATNI] badge w timeline view, off-by-default popout).
 *   2. Bind keymap mod+t → open popout.
 *   3. Cmd+K palette commands.
 *   4. Expose AppEnv.threading API z buildThreadTree + navigateMessage etc.
 *
 * UI popout window React component odłożony — wymaga rendererowej infra
 * (BrowserWindow opening w main process), backend algorithm gotowy.
 */

import {
  buildThreadTree,
  flattenTree,
  navigateMessage,
  navigateKonar,
  normalizeSubject,
  MessageNode,
  ThreadTree,
  ThreadTreeNode,
} from './konar-algorithm';

const FLAG_TREE_KEY = 'core.mail.threadingTree';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  if ((window as any).AppEnv?.config?.setSchema) {
    (window as any).AppEnv.config.setSchema(FLAG_TREE_KEY, {
      type: 'boolean',
      default: true,
      title: 'Threading hybryda (drzewo + linia czasu)',
      description: '[OSTATNI] badge w reading pane + Cmd+T otwiera popout drzewa konarów.',
    });
  }

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'threading-tree:open-popout': () => openPopoutCurrent(),
      'threading-tree:close-popout': () => closePopout(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'threading:open-popout',
      label: 'Pokaż drzewo konarów / Show thread tree',
      section: 'Mail',
      keywords: ['threading', 'tree', 'drzewo', 'konar', 'popout', 'thread'],
      shortcut: ['⌘', 'T'],
      handler: () => openPopoutCurrent(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.threading = {
    buildThreadTree,
    flattenTree,
    navigateMessage,
    navigateKonar,
    normalizeSubject,
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) palette.unregister('threading:open-popout');
  if ((window as any).AppEnv?.threading) {
    delete (window as any).AppEnv.threading;
  }
}

// === Popout placeholder ===
// UI React component dla popout window odłożony — wymaga BrowserWindow
// opening w main process + thread data marshalling. Backend algorithm
// jest gotowy, integration w osobnym sprintu.

function openPopoutCurrent(): void {
  // Pull current thread + messages z $m.FocusedContentStore + MessageStore.
  // Build tree, otwórz popout BrowserWindow z data.
  // Placeholder log:
  try {
    const thread = (window as any).$m?.FocusedContentStore?.focused?.('thread');
    if (!thread?.id) {
      console.info('[threading-tree] no thread focused');
      return;
    }
    console.info('[threading-tree] open popout for thread:', thread.id);
    // TODO: BrowserWindow.open + tree builder integration
  } catch (e) {
    console.warn('[threading-tree] popout open failed:', e);
  }
}

function closePopout(): void {
  // TODO: close BrowserWindow gdy implementowane
}

export type { MessageNode, ThreadTree, ThreadTreeNode };
