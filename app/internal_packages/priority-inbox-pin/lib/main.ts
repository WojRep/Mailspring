/**
 * Priority Inbox + Pin plugin entry — bilet MVP #93.
 *
 * activate():
 *   1. PinStore.init() — load persisted pins z localStorage.
 *   2. Register config schema `core.workspace.priorityInbox` (default OFF — opt-in).
 *   3. Bind keyboard shortcuts (Shift+P toggle pin, override commands).
 *   4. Register Cmd+K palette commands.
 *   5. Expose `AppEnv.priorityInbox` public API.
 */

import { PinStore } from './pin-store';
import { classifyThread, bucketThreads, PriorityBucket, ThreadSnapshot } from './priority-classifier';

const FLAG_KEY = 'core.workspace.priorityInbox';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  PinStore.init();

  // Config schema
  if ((window as any).AppEnv?.config?.setSchema) {
    (window as any).AppEnv.config.setSchema(FLAG_KEY, {
      type: 'boolean',
      default: false,
      title: 'Priority Inbox (2-bucket split)',
      description: 'Dzieli skrzynkę na "Priority" (pin + VIP + regular correspondents) i "Other". Manifest §1 — uwaga jako waluta. Default OFF — opt-in.',
    });
  }

  // Bind shortcuts
  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'priority-inbox-pin:toggle-pin': () => {
        const focused = getFocusedThreadId();
        if (focused) PinStore.toggle(focused);
      },
      'priority-inbox-pin:pin-thread': () => {
        const focused = getFocusedThreadId();
        if (focused) PinStore.pin(focused);
      },
      'priority-inbox-pin:unpin-thread': () => {
        const focused = getFocusedThreadId();
        if (focused) PinStore.unpin(focused);
      },
    });
  }

  // Cmd+K palette commands integration
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'priority:pin-thread',
      label: 'Pin / Unpin focused thread',
      section: 'Mail',
      keywords: ['pin', 'top', 'przyklej', 'priority'],
      shortcut: ['⇧', 'P'],
      handler: () => {
        const focused = getFocusedThreadId();
        if (focused) PinStore.toggle(focused);
      },
    });
    palette.register({
      id: 'priority:toggle-mode',
      label: 'Toggle Priority Inbox mode',
      section: 'View',
      keywords: ['priority', 'inbox', '2-bucket', 'split'],
      handler: () => {
        const cur = (window as any).AppEnv?.config?.get?.(FLAG_KEY) ?? false;
        (window as any).AppEnv?.config?.set?.(FLAG_KEY, !cur);
      },
    });
  }

  // Public API
  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.priorityInbox = {
    PinStore,
    classifyThread,
    bucketThreads,
    isEnabled: () => !!(window as any).AppEnv?.config?.get?.(FLAG_KEY),
    FLAG_KEY,
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('priority:pin-thread');
    palette.unregister('priority:toggle-mode');
  }
  if ((window as any).AppEnv?.priorityInbox) {
    delete (window as any).AppEnv.priorityInbox;
  }
}

/** Helper — get currently focused thread id z Mailspring's FocusedContentStore. */
function getFocusedThreadId(): string | null {
  try {
    const stores = (window as any).AppEnv?.savedState || {};
    const focusedThread = (window as any).$m?.FocusedContentStore?.focused?.('thread');
    if (focusedThread?.id) return focusedThread.id;
  } catch (e) {
    // no thread focused
  }
  return null;
}

// Re-export public types
export type { PriorityBucket, ThreadSnapshot };
