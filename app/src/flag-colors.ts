// Kolorowe flagi Apple Mail — pojedyncze źródło prawdy.
//
// Apple Mail koduje KOLOR flagi trzema słowami kluczowymi IMAP
// $MailFlagBit0/1/2 (3 bity → wartość 0..6 → 7 kolorów), zawsze razem z
// systemową flagą \Flagged (u nas: thread.starred). Standard:
// IETF draft-eggert-mailflagcolors-00 (Bit0 = LSB):
//   0 Red, 1 Orange, 2 Yellow, 3 Green, 4 Blue, 5 Purple, 6 Grey.
//
// Decyzja usera: IETF jako domyślny, tabela value→kolor KONFIGUROWALNA
// (korekta po kalibracji z realnym Apple Mail) — patrz setFlagColorOrder().
// Kolory tokenów odwzorowują paletę Apple 1:1 (--flag-* w tokens.less).

export interface FlagColor {
  value: number; // 0..6
  key: string;
  nameKey: string; // klucz do localized()
  token: string; // var(--flag-*)
}

export const MAIL_FLAG_BITS = ['$MailFlagBit0', '$MailFlagBit1', '$MailFlagBit2'];

export const FLAG_COLORS: FlagColor[] = [
  { value: 0, key: 'red', nameKey: 'Red', token: 'var(--flag-red)' },
  { value: 1, key: 'orange', nameKey: 'Orange', token: 'var(--flag-orange)' },
  { value: 2, key: 'yellow', nameKey: 'Yellow', token: 'var(--flag-yellow)' },
  { value: 3, key: 'green', nameKey: 'Green', token: 'var(--flag-green)' },
  { value: 4, key: 'blue', nameKey: 'Blue', token: 'var(--flag-blue)' },
  { value: 5, key: 'purple', nameKey: 'Purple', token: 'var(--flag-purple)' },
  { value: 6, key: 'grey', nameKey: 'Grey', token: 'var(--flag-grey)' },
];

const BY_KEY: Record<string, FlagColor> = FLAG_COLORS.reduce(
  (acc, c) => {
    acc[c.key] = c;
    return acc;
  },
  {} as Record<string, FlagColor>
);

// Opcjonalny override value→key (indeks = wartość bitów 0..6). Ustawiany z
// configu (core.flags.colorOrder) przez tag-system, by skorygować mapowanie po
// kalibracji bez zmiany kodu. null = domyślne IETF.
let _override: string[] | null = null;

export function setFlagColorOrder(order: string[] | null): void {
  _override = Array.isArray(order) && order.length === 7 ? order.slice() : null;
}

function clampValue(value: number): number {
  const v = Math.trunc(value);
  if (Number.isNaN(v) || v < 0) return 0;
  return v > 6 ? 0 : v; // wartość 7 nieużywana → czerwona domyślna
}

/**
 * Dekoduje kolor flagi z keywordów + starred. Zwraca 0..6 albo null.
 * DECYZJA USERA (1:1 Apple): gwiazdka (\Flagged) BEZ bitów = wartość 0 = CZERWONA
 * (bo Apple koduje czerwoną flagę jako \Flagged bez bitów). Czyli każda gwiazdka
 * ActunaMail = czerwona flaga. Brak \Flagged → null. Wartość 7 (3 bity) nieużywana.
 */
export function flagColorValue(
  customKeywords: string[] | null | undefined,
  starred: boolean
): number | null {
  if (!starred) return null; // kolor wymaga \Flagged
  const kws = Array.isArray(customKeywords) ? customKeywords : [];
  const b0 = kws.includes('$MailFlagBit0') ? 1 : 0;
  const b1 = kws.includes('$MailFlagBit1') ? 1 : 0;
  const b2 = kws.includes('$MailFlagBit2') ? 1 : 0;
  const bits = b0 | (b1 << 1) | (b2 << 2);
  if (bits > 6) return null; // 7 nieużywane
  return bits; // 0 = czerwona (gwiazdka), 1..6 kolory
}

/** Koduje wartość koloru na bity do ustawienia/usunięcia (\Flagged osobno). */
export function keywordsForFlagColor(value: number): { add: string[]; remove: string[] } {
  const v = clampValue(value);
  const add: string[] = [];
  const remove: string[] = [];
  (v & 1 ? add : remove).push('$MailFlagBit0');
  (v & 2 ? add : remove).push('$MailFlagBit1');
  (v & 4 ? add : remove).push('$MailFlagBit2');
  return { add, remove };
}

export function flagColorFor(value: number): FlagColor | null {
  const v = clampValue(value);
  if (_override) {
    return BY_KEY[_override[v]] || null;
  }
  return FLAG_COLORS.find((c) => c.value === v) || null;
}

export function flagColorToken(value: number): string | null {
  const c = flagColorFor(value);
  return c ? c.token : null;
}

export function flagColorNameKey(value: number): string | null {
  const c = flagColorFor(value);
  return c ? c.nameKey : null;
}

export function flagTagId(value: number): string {
  return `flag_${clampValue(value)}`;
}

// Mapowanie kolor flagi → kwadrant Eisenhowera wg WYTYCZNYCH usera (ISO 3864/RAG):
// red→Q1 (Zrób teraz), blue→Q2 (Zaplanuj), yellow→Q3 (Deleguj), green→Q4 (Odłóż),
// orange→Q3 (ryzyko pośrednie z żółtym), grey→Q4, purple→Q2 (konwencja, bez standardu).
// Reference: memory reference_iso3864_eisenhower_colors. Wyłączalne: core.flags.mapToPriority.
export const DEFAULT_FLAG_QUADRANT: Record<number, string | null> = {
  0: 'prio_q1', // red — Zrób teraz (pilne+ważne)
  1: 'prio_q3', // orange — Deleguj (pilne, nieważne)
  2: 'prio_q3', // yellow — Deleguj
  3: 'prio_q4', // green — Odłóż (nieważne, niepilne)
  4: 'prio_q2', // blue — Zaplanuj (ważne, niepilne)
  5: 'prio_q2', // purple — Zaplanuj (konwencja)
  6: 'prio_q4', // grey — Odłóż (konwencja)
};

export function flagColorToQuadrant(value: number): string | null {
  const v = clampValue(value);
  return v in DEFAULT_FLAG_QUADRANT ? DEFAULT_FLAG_QUADRANT[v] : null;
}

// Klucz akcji (localized) wg kwadrantu — znaczenie flagi (WCAG: tekst + kolor).
const QUADRANT_ACTION: Record<string, string> = {
  prio_q1: 'Do now',
  prio_q2: 'Schedule',
  prio_q3: 'Delegate',
  prio_q4: 'Defer',
};

export function flagMeaningKey(value: number): string | null {
  const q = flagColorToQuadrant(value);
  return q ? QUADRANT_ACTION[q] || null : null;
}
