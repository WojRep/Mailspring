/**
 * Snooze quick-preset resolvers — bilet MVP #104.
 *
 * Resolve preset z aktualnym Date (lub injected w testach) na Unix ms.
 *
 * Konwencje (overridable w future Preferences):
 *  - "Later today"      → +3h (cap przy 22:00).
 *  - "Tomorrow morning" → jutro 09:00.
 *  - "Tomorrow evening" → jutro 18:00.
 *  - "This weekend"     → najbliższa sobota 09:00.
 *  - "Next week"        → najbliższy poniedziałek 09:00.
 *  - "Next month"       → pierwszy poniedziałek następnego miesiąca 09:00.
 *  - "Someday"          → +30 dni 09:00 (placeholder do manual review).
 */

export type SnoozePreset =
  | 'later_today'
  | 'tomorrow_morning'
  | 'tomorrow_evening'
  | 'this_weekend'
  | 'next_week'
  | 'next_month'
  | 'someday';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function atHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Find next weekday (1=Monday...7=Sunday matching JS Date 1=Mon...0=Sun). */
function nextWeekday(base: Date, jsDayOfWeek: number): Date {
  const d = new Date(base);
  const cur = d.getDay(); // 0=Sun..6=Sat
  let diff = jsDayOfWeek - cur;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

export function resolvePreset(preset: SnoozePreset, now: Date = new Date()): number {
  switch (preset) {
    case 'later_today': {
      const candidate = new Date(now.getTime() + 3 * HOUR_MS);
      const cap = atHour(now, 22, 0);
      // Jeśli later-today wykracza poza 22:00 dziś → przejdź na tomorrow morning fallback
      if (candidate.getTime() > cap.getTime() || now.getHours() >= 22) {
        return atHour(new Date(now.getTime() + DAY_MS), 9, 0).getTime();
      }
      return candidate.getTime();
    }
    case 'tomorrow_morning':
      return atHour(new Date(now.getTime() + DAY_MS), 9, 0).getTime();
    case 'tomorrow_evening':
      return atHour(new Date(now.getTime() + DAY_MS), 18, 0).getTime();
    case 'this_weekend': {
      // Saturday = 6
      const sat = nextWeekday(now, 6);
      return atHour(sat, 9, 0).getTime();
    }
    case 'next_week': {
      // Monday = 1
      const mon = nextWeekday(now, 1);
      return atHour(mon, 9, 0).getTime();
    }
    case 'next_month': {
      // First Monday of next month
      const first = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0, 0);
      while (first.getDay() !== 1) first.setDate(first.getDate() + 1);
      return first.getTime();
    }
    case 'someday':
      return atHour(new Date(now.getTime() + 30 * DAY_MS), 9, 0).getTime();
  }
}

export const PRESET_LABELS_PL: Record<SnoozePreset, string> = {
  later_today: 'Później dziś',
  tomorrow_morning: 'Jutro rano',
  tomorrow_evening: 'Jutro wieczorem',
  this_weekend: 'Ten weekend',
  next_week: 'Następny tydzień',
  next_month: 'Następny miesiąc',
  someday: 'Kiedyś',
};

export const PRESET_LABELS_EN: Record<SnoozePreset, string> = {
  later_today: 'Later today',
  tomorrow_morning: 'Tomorrow morning',
  tomorrow_evening: 'Tomorrow evening',
  this_weekend: 'This weekend',
  next_week: 'Next week',
  next_month: 'Next month',
  someday: 'Someday',
};
