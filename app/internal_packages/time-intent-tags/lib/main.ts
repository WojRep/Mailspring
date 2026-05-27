/**
 * Time-Intent Tags plugin entry — bilet MVP #96.
 *
 * activate():
 *   1. TimeIntentStore.init() — restore assignments + maybe rollover.
 *   2. Bind keymap (T / U / A / X).
 *   3. Cmd+K palette commands.
 *   4. Expose AppEnv.timeIntent.
 */

import { TimeIntentStore, TimeIntent, SYSTEM_TAGS, TAG_TODAY, TAG_UPCOMING, TAG_ANYTIME } from './time-intent-store';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  TimeIntentStore.init();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'time-intent-tags:set-today': () => withFocused(tid => TimeIntentStore.set(tid, 'today')),
      'time-intent-tags:set-upcoming': () => withFocused(tid => TimeIntentStore.set(tid, 'upcoming')),
      'time-intent-tags:set-anytime': () => withFocused(tid => TimeIntentStore.set(tid, 'anytime')),
      'time-intent-tags:clear': () => withFocused(tid => TimeIntentStore.clear(tid)),
      'time-intent-tags:rollover-now': () => TimeIntentStore.rolloverNow(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'time-intent:today',
      label: 'Oznacz jako Today / Mark Today',
      section: 'Mail',
      keywords: ['today', 'dzis', 'pilne'],
      shortcut: ['T'],
      handler: () => withFocused(tid => TimeIntentStore.set(tid, 'today')),
    });
    palette.register({
      id: 'time-intent:upcoming',
      label: 'Oznacz jako Upcoming / Mark Upcoming',
      section: 'Mail',
      keywords: ['upcoming', 'zaplanowane', 'później'],
      shortcut: ['U'],
      handler: () => withFocused(tid => TimeIntentStore.set(tid, 'upcoming')),
    });
    palette.register({
      id: 'time-intent:anytime',
      label: 'Oznacz jako Anytime / Mark Anytime',
      section: 'Mail',
      keywords: ['anytime', 'kiedykolwiek', 'backlog', 'no urgency'],
      shortcut: ['A'],
      handler: () => withFocused(tid => TimeIntentStore.set(tid, 'anytime')),
    });
    palette.register({
      id: 'time-intent:clear',
      label: 'Usuń oznaczenie time-intent / Clear intent',
      section: 'Mail',
      keywords: ['clear', 'usun', 'reset'],
      shortcut: ['X'],
      handler: () => withFocused(tid => TimeIntentStore.clear(tid)),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.timeIntent = {
    Store: TimeIntentStore,
    SYSTEM_TAGS,
    TAG_TODAY,
    TAG_UPCOMING,
    TAG_ANYTIME,
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('time-intent:today');
    palette.unregister('time-intent:upcoming');
    palette.unregister('time-intent:anytime');
    palette.unregister('time-intent:clear');
  }
  if ((window as any).AppEnv?.timeIntent) {
    delete (window as any).AppEnv.timeIntent;
  }
}

function withFocused(cb: (threadId: string) => void): void {
  try {
    const focused = (window as any).$m?.FocusedContentStore?.focused?.('thread');
    if (focused?.id) cb(focused.id);
  } catch (e) { /* no focus */ }
}

export type { TimeIntent };
