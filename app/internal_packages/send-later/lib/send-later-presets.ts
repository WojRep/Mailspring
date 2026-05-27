/**
 * Send Later preset resolvers — bilet MVP #105.
 *
 * Reuse logiki preset z #104, ale tailored do Send Later (composer flow):
 *  - in_1h               → +1h.
 *  - tomorrow_9am        → jutro 09:00.
 *  - next_monday_morning → najbliższy poniedziałek 09:00.
 *  - custom              → user-picked via #90 time-control-picker.
 */

import { SendLaterPreset } from './send-later-store';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function atHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextWeekday(base: Date, jsDayOfWeek: number): Date {
  const d = new Date(base);
  const cur = d.getDay();
  let diff = jsDayOfWeek - cur;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function resolveSendLaterPreset(preset: Exclude<SendLaterPreset, 'custom'>, now: Date = new Date()): number {
  switch (preset) {
    case 'in_1h':
      return now.getTime() + HOUR_MS;
    case 'tomorrow_9am':
      return atHour(new Date(now.getTime() + DAY_MS), 9, 0).getTime();
    case 'next_monday_morning': {
      const mon = nextWeekday(now, 1);
      return atHour(mon, 9, 0).getTime();
    }
  }
}

export const SEND_LATER_LABELS_PL: Record<SendLaterPreset, string> = {
  in_1h: 'Za 1 godzinę',
  tomorrow_9am: 'Jutro 9:00',
  next_monday_morning: 'Następny poniedziałek rano',
  custom: 'Wybierz datę i czas…',
};

export const SEND_LATER_LABELS_EN: Record<SendLaterPreset, string> = {
  in_1h: 'In 1 hour',
  tomorrow_9am: 'Tomorrow 9am',
  next_monday_morning: 'Next Monday morning',
  custom: 'Pick date and time…',
};
