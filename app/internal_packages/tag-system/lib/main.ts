/**
 * Tag system plugin entry — bilet MVP #98.
 *
 * activate():
 *   1. TagStore.init().
 *   2. Auto-register system tags z innych pluginów gdy aktywne:
 *      - time-intent-tags (#96): Today/Upcoming/Anytime
 *      - priority-inbox-pin (#93): __system_priority/__system_other (manual overrides)
 *   3. Bind keymap mod+l → open picker.
 *   4. Cmd+K palette commands.
 *   5. Expose AppEnv.tagSystem API.
 */

import { TagStore, Tag } from './tag-store';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  TagStore.init();
  registerSystemTags();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'tag-system:open-picker': () => openPicker(),
      'tag-system:close-picker': () => closePicker(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'tag-system:open-picker',
      label: 'Otwórz tag picker / Open tag picker',
      section: 'Mail',
      keywords: ['tag', 'label', 'etykieta', 'pick'],
      shortcut: ['⌘', 'L'],
      handler: () => openPicker(),
    });
    palette.register({
      id: 'tag-system:open-manager',
      label: 'Zarządzaj tagami / Manage tags',
      section: 'Settings',
      keywords: ['tag', 'manager', 'manage', 'rename', 'merge', 'delete'],
      handler: () => openManager(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.tagSystem = {
    Store: TagStore,
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('tag-system:open-picker');
    palette.unregister('tag-system:open-manager');
  }
  if ((window as any).AppEnv?.tagSystem) {
    delete (window as any).AppEnv.tagSystem;
  }
}

/** Auto-register system tags z innych pluginów. */
function registerSystemTags(): void {
  // Time-intent tags (#96)
  const ti = (window as any).AppEnv?.timeIntent;
  if (ti?.TAG_TODAY) {
    TagStore.registerAll([
      { id: ti.TAG_TODAY, name: 'Today', color: 'var(--danger-500)', source: 'system', systemManaged: true, description: '#96 time-intent: do dzisiaj' },
      { id: ti.TAG_UPCOMING, name: 'Upcoming', color: 'var(--warning-500)', source: 'system', systemManaged: true, description: '#96 time-intent: zaplanowane' },
      { id: ti.TAG_ANYTIME, name: 'Anytime', color: 'var(--success-500)', source: 'system', systemManaged: true, description: '#96 time-intent: brak urgency' },
    ]);
  }
  // Priority overrides (#93)
  TagStore.registerAll([
    { id: '__system_priority', name: 'Priority (override)', color: 'var(--accent-500)', source: 'system', systemManaged: true, description: '#93 manual Priority Inbox override' },
    { id: '__system_other', name: 'Other (override)', color: 'var(--text-muted)', source: 'system', systemManaged: true, description: '#93 manual demote to Other' },
  ]);
}

function openPicker(): void {
  try {
    const thread = (window as any).$m?.FocusedContentStore?.focused?.('thread');
    if (!thread?.id) return;
    console.info('[tag-system] open picker for thread:', thread.id);
    // TODO UI integration — picker modal w osobnym sprintu
    // Mockup: design/mockups/04-tag-picker.html
  } catch (e) { /* no thread */ }
}

function closePicker(): void {
  // TODO
}

function openManager(): void {
  console.info('[tag-system] open Tag Manager (Preferences > Tags)');
  // TODO dispatch do Preferences pane
}
