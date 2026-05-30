/**
 * Follow-up plugin entry — bilet MVP #106.
 *
 * activate():
 *   1. FollowUpStore.init().
 *   2. Bind Cmd+Shift+W → Waiting sidebar, Cmd+Shift+R → remind current.
 *   3. Cmd+K palette commands.
 *   4. Expose AppEnv.followUp API.
 */

import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import FollowUpWaitingPanel from './follow-up-waiting-panel';
import {
  FollowUpStore,
  DETECTION_THRESHOLD_DEFAULT_DAYS,
  DETECTION_THRESHOLD_MIN_DAYS,
  DETECTION_THRESHOLD_MAX_DAYS,
} from './follow-up-store';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  FollowUpStore.init();

  // Mount Waiting panel w MessageListHeaders slot (lub RootSidebar locked).
  // Plan v1.0 #106 + mockup 18-follow-up-waiting.html.
  ComponentRegistry.register(FollowUpWaitingPanel, {
    location: WorkspaceStore.Location.RootSidebar,
  });

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'follow-up:open-waiting-sidebar': () => openWaiting(),
      'follow-up:remind-current': () => remindCurrent(),
      'follow-up:run-detection-now': () => runDetectionNow(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'follow-up:waiting',
      label: 'Pokaż listę "Czekam na odpowiedź" / Show Waiting list',
      section: 'View',
      keywords: ['waiting', 'czekam', 'follow-up', 'pending', 'oczekujące'],
      shortcut: ['⌘', '⇧', 'W'],
      handler: () => openWaiting(),
    });
    palette.register({
      id: 'follow-up:remind',
      label: 'Dodaj przypomnienie do tego wątku / Set reminder',
      section: 'Mail',
      keywords: ['reminder', 'przypomnienie', 'follow-up'],
      shortcut: ['⌘', '⇧', 'R'],
      handler: () => remindCurrent(),
    });
    palette.register({
      id: 'follow-up:detect',
      label: 'Uruchom detekcję follow-up teraz',
      section: 'Mail',
      keywords: ['detection', 'sweep', 'follow-up', 'background'],
      handler: () => runDetectionNow(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.followUp = {
    Store: FollowUpStore,
    constants: {
      DETECTION_THRESHOLD_DEFAULT_DAYS,
      DETECTION_THRESHOLD_MIN_DAYS,
      DETECTION_THRESHOLD_MAX_DAYS,
    },
  };
}

export function deactivate() {
  ComponentRegistry.unregister(FollowUpWaitingPanel);
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    ['follow-up:waiting', 'follow-up:remind', 'follow-up:detect'].forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.followUp) {
    delete (window as any).AppEnv.followUp;
  }
}

function openWaiting(): void {
  console.info('[follow-up] open Waiting sidebar — list active entries');
}

function remindCurrent(): void {
  console.info('[follow-up] set manual reminder for current thread (composer or thread view)');
}

function runDetectionNow(): void {
  console.info('[follow-up] manual detection trigger — scheduler #91 runs daily');
}

export type { WaitingEntry, WaitingStatus, DetectionInput, DetectionResult, FollowUpSettings } from './follow-up-store';
