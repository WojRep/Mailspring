/**
 * Tag system plugin entry — bilet MVP #98.
 *
 * activate():
 *   1. TagStore.init().
 *   2. Auto-register system tags z innych pluginów gdy aktywne:
 *      - time-intent-tags (#96): Today/Upcoming/Anytime
 *      - priority-inbox-pin (#93): __system_priority/__system_other (manual overrides)
 *   3. Mount UI: TagPicker overlay + TagChips reading-pane slot + PreferencesTags tab.
 *   4. Bind keymap mod+l → open picker (dispatches do TagSystemUIBus).
 *   5. Cmd+K palette commands.
 *   6. Expose AppEnv.tagSystem API (Store + UIBus).
 */

import { ComponentRegistry, WorkspaceStore, PreferencesUIStore } from 'actunamail-exports';
import { TagStore, Tag } from './tag-store';
import { TagSystemUIBus } from './tag-system-ui-bus';
import TagPicker from './tag-picker';
import TagChips from './tag-chips';
import TagChipsCompact from './tag-chips-compact';
import TagToolbarButton from './tag-toolbar-button';

const { localized } = require('actunamail-exports');
import PreferencesTags from './preferences-tags';

let shortcutDisposable: { dispose(): void } | null = null;
let preferencesTabRegistered = false;
let dbUnlisten: (() => void) | null = null;

export function activate() {
  TagStore.init();
  registerSystemTags();

  // #120: odtwórz aktywny preset priorytetów (re-rejestracja tagów presetu).
  try {
    require('./priority-preset-store').PriorityPresetStore.init();
  } catch (e) { /* preset store unavailable */ }

  // #117: inbound sync — delty Thread z silnika C++ niosą customKeywords
  // (keywordy IMAP); reconcile przypisań per thread (serwer = źródło prawdy).
  try {
    const { DatabaseStore } = require('actunamail-exports');
    if (DatabaseStore && typeof DatabaseStore.listen === 'function') {
      dbUnlisten = DatabaseStore.listen((change: any) => {
        if (!change || change.objectClass !== 'Thread' || !Array.isArray(change.objects)) return;
        for (const t of change.objects) {
          try { TagStore.syncFromThread(t); } catch (e) { /* pojedyncza delta nie wywraca reszty */ }
        }
      });
    }
  } catch (e) {
    /* exports unavailable (test/node context) */
  }

  // Mount overlays.
  ComponentRegistry.register(TagPicker, { location: WorkspaceStore.Sheet.Global.Footer });
  ComponentRegistry.register(TagChips, { role: 'MessageList:Header' });
  // #118: kompaktowe chipy w wierszach listy wątków — slot wewnątrz
  // MailLabelSet (wide c3 + narrow), obok etykiet Gmail.
  ComponentRegistry.register(TagChipsCompact, { role: 'Thread:MailLabel' });
  // Inline button "Dodaj tag" w thread toolbar — discoverable affordance
  // bez znajomości Cmd+L shortcut. Address user-reported gap 2026-05-30.
  ComponentRegistry.register(TagToolbarButton, { role: 'ThreadActionsToolbarButton' });

  // Preferences tab — używamy real Mailspring API: TabItem instance z
  // componentClassFn (lazy require) per preferences/lib/main.tsx pattern.
  // WRONG pattern (plain object z `component:`) renderuje undefined → biały
  // ekran (zgłoszone 2026-05-30 user: "ustawienia Tagi nadal biały ekran").
  try {
    if (PreferencesUIStore && PreferencesUIStore.TabItem && typeof PreferencesUIStore.registerPreferencesTab === 'function') {
      PreferencesUIStore.registerPreferencesTab(
        new PreferencesUIStore.TabItem({
          tabId: 'Tags',
          displayName: localized('Tags'),
          componentClassFn: () => PreferencesTags,
          order: 9,
        })
      );
      preferencesTabRegistered = true;
    }
  } catch (e) {
    console.warn('[tag-system] Preferences tab registration failed:', e);
  }

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'tag-system:open-picker': () => openPicker(),
      'tag-system:close-picker': () => closePicker(),
      // #120: priorytety na fokusowanym wątku (mod-1..4 / mod-0 clear).
      'priority-tags:set-1': () => setPriorityOnFocused(1),
      'priority-tags:set-2': () => setPriorityOnFocused(2),
      'priority-tags:set-3': () => setPriorityOnFocused(3),
      'priority-tags:set-4': () => setPriorityOnFocused(4),
      'priority-tags:clear': () => clearPriorityOnFocused(),
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
    // #120: komendy priorytetów (Eisenhower / A-B-C).
    for (const n of [1, 2, 3, 4]) {
      palette.register({
        id: `priority-tags:set-${n}`,
        label: `Ustaw priorytet ${n} / Set priority ${n}`,
        section: 'Mail',
        keywords: ['priority', 'priorytet', 'eisenhower', 'abc', String(n)],
        shortcut: ['⌘', String(n)],
        handler: () => setPriorityOnFocused(n),
      });
    }
    palette.register({
      id: 'priority-tags:clear',
      label: 'Wyczyść priorytet / Clear priority',
      section: 'Mail',
      keywords: ['priority', 'priorytet', 'clear', 'wyczyść'],
      shortcut: ['⌘', '0'],
      handler: () => clearPriorityOnFocused(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.tagSystem = {
    Store: TagStore,
    UIBus: TagSystemUIBus,
  };
}

export function deactivate() {
  if (dbUnlisten) {
    dbUnlisten();
    dbUnlisten = null;
  }
  ComponentRegistry.unregister(TagPicker);
  ComponentRegistry.unregister(TagChips);
  ComponentRegistry.unregister(TagChipsCompact);
  ComponentRegistry.unregister(TagToolbarButton);
  if (preferencesTabRegistered) {
    try {
      if (typeof (PreferencesUIStore as any).unregisterPreferencesTab === 'function') {
        (PreferencesUIStore as any).unregisterPreferencesTab('Tags');
      }
    } catch (e) { /* no-op */ }
    preferencesTabRegistered = false;
  }
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
    TagSystemUIBus.openPicker(thread.id);
  } catch (e) { /* no thread */ }
}

function closePicker(): void {
  TagSystemUIBus.closePicker();
}

/** #120: tag priorytetowy o danej randze na fokusowanym wątku (wzorzec withFocused #96). */
function setPriorityOnFocused(rank: number): void {
  try {
    const thread = (window as any).$m?.FocusedContentStore?.focused?.('thread');
    if (!thread?.id) return;
    const { PriorityPresetStore, PRESETS } = require('./priority-preset-store');
    const active = PriorityPresetStore.activePreset();
    if (!active) return;
    const member = PRESETS[active].members.find((m: any) => m.rank === rank);
    if (member) PriorityPresetStore.setPriority(thread.id, member.id);
  } catch (e) { /* no thread / preset inactive */ }
}

function clearPriorityOnFocused(): void {
  try {
    const thread = (window as any).$m?.FocusedContentStore?.focused?.('thread');
    if (!thread?.id) return;
    const { PriorityPresetStore } = require('./priority-preset-store');
    PriorityPresetStore.clearPriority(thread.id);
  } catch (e) { /* no thread */ }
}

function openManager(): void {
  // Open Preferences > Tags tab. Mailspring routing — use Actions if present.
  try {
    const Actions = (window as any).$m?.Actions;
    if (Actions?.switchPreferencesTab) {
      Actions.switchPreferencesTab('Tags');
      return;
    }
    // Fallback — emit UIBus event for any custom listener.
    TagSystemUIBus.openManager();
  } catch (e) {
    TagSystemUIBus.openManager();
  }
}
