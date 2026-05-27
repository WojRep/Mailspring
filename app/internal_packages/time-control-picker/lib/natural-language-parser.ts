/**
 * Natural language date+time parser dla Bilet MVP #90.
 *
 * Obsługa PL+EN. Mockup: design/mockups/07-snooze-picker.html sekcja "Or type".
 *
 * Wzór:
 *   "tomorrow 9am" → Date(jutro 09:00)
 *   "in 3 days" / "za 3 dni" → Date(now + 3d)
 *   "next monday 14:00" / "następny poniedziałek 14:00"
 *   "this weekend" / "ten weekend" → najbliższa sobota 09:00
 *   "in 2 hours" / "za 2 godziny"
 *
 * Returns null gdy nie da się sparsować — caller fallback do explicit picker.
 *
 * Brak external dependency (chrono-node niezawarte) — własna lightweight
 * implementacja oparta o regex + tabele.
 */

export interface ParseResult {
  date: Date;
  /** Confidence 0..1 — 1.0 dla exact pattern match, 0.5 dla heurystyki. */
  confidence: number;
  /** Human-readable description (np. "jutro 9:00 CET"). */
  description: string;
  /** Original input. */
  source: string;
}

const PL_WEEKDAYS = {
  niedziela: 0, poniedzialek: 1, poniedziałek: 1, wtorek: 2,
  środa: 3, sroda: 3, czwartek: 4, piątek: 5, piatek: 5, sobota: 6,
};
const EN_WEEKDAYS = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Normalize input — lowercase, no diacritics. */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse "HH:MM" or "HHam"/"HHpm" → {hour, minute}, lub null. */
function parseTime(s: string): { hour: number; minute: number } | null {
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const m = parseInt(m24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m };
  }
  const m12 = s.match(/^(\d{1,2})\s*(am|pm)$/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const meridiem = m12[2];
    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) return { hour: h, minute: 0 };
  }
  return null;
}

/** Find time clause in tokens — returns {hour, minute, removeTokens} */
function extractTime(tokens: string[]): { hour: number; minute: number; rest: string[] } {
  let hour = 9, minute = 0;
  const rest: string[] = [];
  let foundTime = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // Try "HH:MM" / "HHam"/"HHpm" forms
    const parsed = parseTime(t);
    if (parsed && !foundTime) {
      hour = parsed.hour;
      minute = parsed.minute;
      foundTime = true;
      continue;
    }
    // Try "9" + "am" pattern (separate tokens)
    if (!foundTime && /^\d{1,2}$/.test(t)) {
      const next = tokens[i + 1];
      if (next === 'am' || next === 'pm') {
        const parsed2 = parseTime(`${t}${next}`);
        if (parsed2) {
          hour = parsed2.hour;
          minute = parsed2.minute;
          foundTime = true;
          i++; // skip next
          continue;
        }
      }
    }
    // Polish-style time keywords
    if (!foundTime && (t === 'rano' || t === 'morning')) {
      hour = 9; minute = 0; foundTime = true; continue;
    }
    if (!foundTime && (t === 'wieczorem' || t === 'wieczor' || t === 'evening')) {
      hour = 18; minute = 0; foundTime = true; continue;
    }
    if (!foundTime && (t === 'południe' || t === 'poludnie' || t === 'noon')) {
      hour = 12; minute = 0; foundTime = true; continue;
    }
    rest.push(t);
  }
  return { hour, minute, rest };
}

export function parseNaturalLanguage(input: string): ParseResult | null {
  if (!input || !input.trim()) return null;
  const norm = normalize(input);
  const tokens = norm.split(' ');
  const now = new Date();

  // Pattern 1: "za N dni" / "in N days" / "in N hours/minutes"
  // (works regardless of token order)
  for (let i = 0; i < tokens.length - 2; i++) {
    const t = tokens[i];
    const t1 = tokens[i + 1];
    const t2 = tokens[i + 2];
    const isRel = (t === 'za' || t === 'in');
    const num = parseInt(t1, 10);
    if (isRel && !isNaN(num)) {
      const unit = t2.replace(/[,.]/, '');
      if (unit === 'dni' || unit === 'days' || unit === 'day') {
        const d = new Date(now);
        d.setDate(d.getDate() + num);
        d.setHours(9, 0, 0, 0);
        return {
          date: d,
          confidence: 0.95,
          description: describe(d),
          source: input,
        };
      }
      if (unit === 'godzin' || unit === 'godziny' || unit === 'godzine' || unit === 'godzin,' || unit === 'hours' || unit === 'hour') {
        const d = new Date(now.getTime() + num * 60 * 60 * 1000);
        return {
          date: d,
          confidence: 0.95,
          description: describe(d),
          source: input,
        };
      }
      if (unit === 'minut' || unit === 'minuty' || unit === 'minutes' || unit === 'minute' || unit === 'min') {
        const d = new Date(now.getTime() + num * 60 * 1000);
        return {
          date: d,
          confidence: 0.95,
          description: describe(d),
          source: input,
        };
      }
      if (unit === 'tygodni' || unit === 'tygodnia' || unit === 'tygodnie' || unit === 'weeks' || unit === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() + num * 7);
        d.setHours(9, 0, 0, 0);
        return {
          date: d,
          confidence: 0.95,
          description: describe(d),
          source: input,
        };
      }
    }
  }

  // Pattern 2: "tomorrow [time]" / "jutro [time]"
  if (tokens.includes('tomorrow') || tokens.includes('jutro')) {
    const others = tokens.filter(t => t !== 'tomorrow' && t !== 'jutro');
    const { hour, minute } = extractTime(others);
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(hour, minute, 0, 0);
    return {
      date: d,
      confidence: 0.95,
      description: describe(d),
      source: input,
    };
  }

  // Pattern 3: "today [time]" / "dzisiaj [time]" / "dziś [time]"
  if (tokens.includes('today') || tokens.includes('dzisiaj') || tokens.includes('dzis')) {
    const others = tokens.filter(t => t !== 'today' && t !== 'dzisiaj' && t !== 'dzis');
    const { hour, minute } = extractTime(others);
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) {
      // Past time — interpret as "next occurrence"
      d.setDate(d.getDate() + 1);
    }
    return {
      date: d,
      confidence: 0.95,
      description: describe(d),
      source: input,
    };
  }

  // Pattern 4: "next [weekday] [time]" / "następny [dzień tygodnia] [time]"
  // czy single weekday name → najbliższy
  const weekdays = { ...PL_WEEKDAYS, ...EN_WEEKDAYS } as { [k: string]: number };
  for (const t of tokens) {
    if (weekdays[t] !== undefined) {
      const targetDay = weekdays[t];
      const others = tokens.filter(x => x !== t && x !== 'next' && x !== 'nastepny' && x !== 'następny');
      const { hour, minute } = extractTime(others);
      const d = new Date(now);
      let daysAhead = (targetDay - d.getDay() + 7) % 7;
      if (daysAhead === 0) daysAhead = 7; // next week if same day
      d.setDate(d.getDate() + daysAhead);
      d.setHours(hour, minute, 0, 0);
      return {
        date: d,
        confidence: 0.9,
        description: describe(d),
        source: input,
      };
    }
  }

  // Pattern 5: "this weekend" / "ten weekend" → najbliższa sobota 09:00
  if (norm.includes('weekend')) {
    const d = new Date(now);
    const daysToSaturday = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToSaturday);
    d.setHours(9, 0, 0, 0);
    return {
      date: d,
      confidence: 0.85,
      description: describe(d),
      source: input,
    };
  }

  // Pattern 6: "next week" / "następny tydzień" → poniedziałek rano
  if (norm.includes('next week') || norm.includes('nastepny tydzien') || norm.includes('następny tydzień')) {
    const d = new Date(now);
    const daysToMonday = (1 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToMonday);
    d.setHours(9, 0, 0, 0);
    return {
      date: d,
      confidence: 0.9,
      description: describe(d),
      source: input,
    };
  }

  return null;
}

/** Human description of date in user's locale. */
function describe(d: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  } catch (e) {
    return d.toISOString();
  }
}
