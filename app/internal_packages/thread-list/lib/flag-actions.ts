// Akcje kolorowych flag Apple Mail — ustaw/wymaż kolor na wątkach.
// Kolor = bity $MailFlagBit* (ChangeKeywordsTask) + \Flagged = starred
// (ChangeStarredTask). Cross-device przez sync engine (IMAP keywords).

import { Actions, ChangeKeywordsTask, ChangeStarredTask } from 'actunamail-exports';
import { keywordsForFlagColor, MAIL_FLAG_BITS } from '../../../src/flag-colors';

// queueTasks([...]) (nie dwa queueTask) → jeden blok undo: cofnięcie kolorowej
// flagi jest atomowe (bity + \Flagged razem). Przegląd: dwa osobne queueTask
// tworzyły dwa bloki undo (rozjazd stanu po jednym cofnięciu).

/** Ustaw kolor flagi (value 0..6) na wątkach: właściwe bity + \Flagged. */
export function setFlagColor(threads: any[], value: number): void {
  if (!threads || !threads.length) return;
  const { add, remove } = keywordsForFlagColor(value);
  Actions.queueTasks([
    new ChangeKeywordsTask({ threads, keywordsToAdd: add, keywordsToRemove: remove }),
    new ChangeStarredTask({ threads, starred: true }),
  ]);
}

/** Wymaż flagę: usuń wszystkie bity koloru + zdejmij \Flagged. */
export function clearFlag(threads: any[]): void {
  if (!threads || !threads.length) return;
  Actions.queueTasks([
    new ChangeKeywordsTask({
      threads,
      keywordsToAdd: [],
      keywordsToRemove: MAIL_FLAG_BITS.slice(),
    }),
    new ChangeStarredTask({ threads, starred: false }),
  ]);
}
