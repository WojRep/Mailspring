/**
 * Snooze plugin entry — bilet MVP #104.
 *
 * activate():
 *   1. SnoozeStore.init().
 *   2. Bind Cmd+Shift+H → open picker, Cmd+Shift+U → un-snooze now.
 *   3. Cmd+K palette commands (open picker, snoozed folder, preset commands).
 *   4. Expose AppEnv.snooze API.
 */

import { SnoozeStore } from './snooze-store';
import { SnoozePreset, PRESET_LABELS_PL, PRESET_LABELS_EN, resolvePreset } from './snooze-presets';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  SnoozeStore.init();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'snooze:open-picker': () => openPicker(),
      'snooze:unsnooze-now': () => unsnoozeNow(),
      'snooze:open-snoozed-folder': () => openSnoozedFolder(),
      'snooze:later-today': () => quickSnooze('later_today'),
      'snooze:tomorrow-morning': () => quickSnooze('tomorrow_morning'),
      'snooze:tomorrow-evening': () => quickSnooze('tomorrow_evening'),
      'snooze:this-weekend': () => quickSnooze('this_weekend'),
      'snooze:next-week': () => quickSnooze('next_week'),
      'snooze:next-month': () => quickSnooze('next_month'),
      'snooze:someday': () => quickSnooze('someday'),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'snooze:picker',
      label: 'Snooze… (wybór czasu)',
      section: 'Mail',
      keywords: ['snooze', 'odłóż', 'czas', 'picker'],
      shortcut: ['⌘', '⇧', 'H'],
      handler: () => openPicker(),
    });
    palette.register({
      id: 'snooze:unsnooze',
      label: 'Un-snooze — wróć teraz',
      section: 'Mail',
      keywords: ['unsnooze', 'wróć', 'now'],
      shortcut: ['⌘', '⇧', 'U'],
      handler: () => unsnoozeNow(),
    });
    palette.register({
      id: 'snooze:folder',
      label: 'Otwórz folder Snoozed',
      section: 'View',
      keywords: ['snoozed', 'folder', 'queue'],
      handler: () => openSnoozedFolder(),
    });
    // Preset commands
    const presets: SnoozePreset[] = [
      'later_today', 'tomorrow_morning', 'tomorrow_evening',
      'this_weekend', 'next_week', 'next_month', 'someday',
    ];
    for (const p of presets) {
      palette.register({
        id: `snooze:preset-${p}`,
        label: `Snooze → ${PRESET_LABELS_PL[p]} / ${PRESET_LABELS_EN[p]}`,
        section: 'Mail',
        keywords: ['snooze', p, PRESET_LABELS_PL[p].toLowerCase(), PRESET_LABELS_EN[p].toLowerCase()],
        handler: () => quickSnooze(p),
      });
    }
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.snooze = {
    Store: SnoozeStore,
    Presets: {
      labels_pl: PRESET_LABELS_PL,
      labels_en: PRESET_LABELS_EN,
      resolve: resolvePreset,
    },
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    ['snooze:picker', 'snooze:unsnooze', 'snooze:folder'].forEach(id => palette.unregister(id));
    const presets: SnoozePreset[] = [
      'later_today', 'tomorrow_morning', 'tomorrow_evening',
      'this_weekend', 'next_week', 'next_month', 'someday',
    ];
    for (const p of presets) palette.unregister(`snooze:preset-${p}`);
  }
  if ((window as any).AppEnv?.snooze) {
    delete (window as any).AppEnv.snooze;
  }
}

function openPicker(): void {
  console.info('[snooze] open snooze picker — reuse #90 shared time-control picker');
  // TODO React modal — reuse #90 picker z 7 preset buttons + custom date/time
}

function unsnoozeNow(): void {
  console.info('[snooze] un-snooze current thread');
  // TODO: pull current threadId → SnoozeStore.unsnooze(tid) → dispatch task to move from Snoozed folder
}

function openSnoozedFolder(): void {
  console.info('[snooze] open Snoozed folder view');
  // TODO React queue list z "Wraca [date]" per mail
}

function quickSnooze(preset: SnoozePreset): void {
  console.info('[snooze] quick snooze preset:', preset);
  // TODO: pull current threadId → SnoozeStore.snoozeByPreset(tid, preset)
}

export type { SnoozeEntry, SnoozeServerSupport, WakeResult } from './snooze-store';
export type { SnoozePreset } from './snooze-presets';
