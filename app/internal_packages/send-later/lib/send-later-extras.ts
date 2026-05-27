/**
 * Send Later extras — bilet MVP #105.
 *
 * Activation extras na top of istniejącego upstream send-later plugin:
 *  - Cmd+Alt+Enter open picker / Cmd+Alt+Z undo send keymapy.
 *  - Cmd+K palette commands (picker, scheduled folder, presets, undo).
 *  - Init SendLaterStore (Scheduled queue + Undo window + KP soft warning).
 *  - Expose AppEnv.sendLater API.
 *
 * Wywoływane z main.ts activate() (po ComponentRegistry.register calls upstream).
 */

import {
  SendLaterStore,
  UNDO_WINDOW_DEFAULT_SEC,
  UNDO_WINDOW_MIN_SEC,
  UNDO_WINDOW_MAX_SEC,
  WORK_HOURS_START,
  WORK_HOURS_END,
  SendLaterPreset,
} from './send-later-store';
import {
  resolveSendLaterPreset,
  SEND_LATER_LABELS_PL,
  SEND_LATER_LABELS_EN,
} from './send-later-presets';

let shortcutDisposable: { dispose(): void } | null = null;

export function activateExtras(): void {
  SendLaterStore.init();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'send-later:open-picker': () => log('open picker'),
      'send-later:undo-send': () => log('undo send'),
      'send-later:open-scheduled-folder': () => log('open scheduled folder'),
      'send-later:in-1h': () => log('quick schedule in_1h'),
      'send-later:tomorrow-9am': () => log('quick schedule tomorrow_9am'),
      'send-later:next-monday-morning': () => log('quick schedule next_monday_morning'),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'send-later:picker',
      label: 'Wyślij później / Send Later…',
      section: 'Compose',
      keywords: ['send later', 'wyślij później', 'schedule'],
      shortcut: ['⌘', '⌥', '↩'],
      handler: () => log('palette: open picker'),
    });
    palette.register({
      id: 'send-later:undo',
      label: 'Cofnij wysłanie / Undo Send',
      section: 'Compose',
      keywords: ['undo send', 'cofnij'],
      shortcut: ['⌘', '⌥', 'Z'],
      handler: () => log('palette: undo'),
    });
    palette.register({
      id: 'send-later:scheduled',
      label: 'Otwórz folder Scheduled',
      section: 'View',
      keywords: ['scheduled', 'queue', 'folder'],
      handler: () => log('palette: scheduled folder'),
    });
    palette.register({
      id: 'send-later:in-1h',
      label: 'Send Later → Za 1 godzinę / In 1 hour',
      section: 'Compose',
      keywords: ['send', 'later', '1h'],
      handler: () => log('quick: in_1h'),
    });
    palette.register({
      id: 'send-later:tomorrow-9am',
      label: 'Send Later → Jutro 9:00 / Tomorrow 9am',
      section: 'Compose',
      keywords: ['send', 'later', 'tomorrow', 'jutro'],
      handler: () => log('quick: tomorrow_9am'),
    });
    palette.register({
      id: 'send-later:next-monday',
      label: 'Send Later → Następny poniedziałek rano / Next Monday morning',
      section: 'Compose',
      keywords: ['send', 'later', 'monday', 'poniedziałek'],
      handler: () => log('quick: next_monday_morning'),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.sendLater = {
    Store: SendLaterStore,
    Presets: {
      labels_pl: SEND_LATER_LABELS_PL,
      labels_en: SEND_LATER_LABELS_EN,
      resolve: resolveSendLaterPreset,
    },
    constants: {
      UNDO_WINDOW_DEFAULT_SEC,
      UNDO_WINDOW_MIN_SEC,
      UNDO_WINDOW_MAX_SEC,
      WORK_HOURS_START,
      WORK_HOURS_END,
    },
  };
}

export function deactivateExtras(): void {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    [
      'send-later:picker',
      'send-later:undo',
      'send-later:scheduled',
      'send-later:in-1h',
      'send-later:tomorrow-9am',
      'send-later:next-monday',
    ].forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.sendLater) {
    delete (window as any).AppEnv.sendLater;
  }
}

function log(msg: string): void {
  console.info(`[send-later] ${msg}`);
}

export type {
  ScheduledDraft,
  UndoWindowEntry,
  SendLaterServerSupport,
  SendLaterPreset,
  SendLaterSettings,
  FlushResult,
  WakeScheduledResult,
} from './send-later-store';
