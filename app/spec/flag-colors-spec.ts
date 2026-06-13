/**
 * RED tests (TDD) — moduł flag-colors: dekodowanie/kodowanie kolorów flag Apple
 * Mail z słów kluczowych IMAP $MailFlagBit0/1/2 (3 bity → kolor).
 *
 * Standard: IETF draft-eggert-mailflagcolors-00 (Bit0=LSB):
 *   0 Red, 1 Orange, 2 Yellow, 3 Green, 4 Blue, 5 Purple, 6 Grey.
 * Decyzja usera: IETF jako domyślny, tabela konfigurowalna (korekta po kalibracji).
 */

import {
  FLAG_COLORS,
  MAIL_FLAG_BITS,
  flagColorValue,
  keywordsForFlagColor,
  flagColorFor,
  flagColorToken,
  flagColorNameKey,
  flagTagId,
  flagMeaningKey,
  setFlagColorOrder,
} from '../src/flag-colors';

describe('flag-colors — tabela', () => {
  it('7 kolorów (value 0..6) z tokenami --flag-*', () => {
    expect(FLAG_COLORS.length).toBe(7);
    expect(FLAG_COLORS.map((c) => c.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const c of FLAG_COLORS) {
      expect(c.token).toMatch(/^var\(--flag-/);
      expect(typeof c.nameKey).toBe('string');
    }
  });

  it('domyślne mapowanie IETF value→key', () => {
    const keys = FLAG_COLORS.map((c) => c.key);
    expect(keys).toEqual(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey']);
  });

  it('MAIL_FLAG_BITS to trzy keywordy Apple', () => {
    expect(MAIL_FLAG_BITS).toEqual(['$MailFlagBit0', '$MailFlagBit1', '$MailFlagBit2']);
  });
});

describe('flag-colors — dekodowanie (flagColorValue)', () => {
  it('brak flagi (nie starred, brak bitów) → null', () => {
    expect(flagColorValue([], false)).toBe(null);
    expect(flagColorValue(['$Pinned'], false)).toBe(null);
  });

  it('starred bez bitów → 0 (gwiazdka = czerwona flaga, 1:1 Apple)', () => {
    expect(flagColorValue([], true)).toBe(0);
  });

  it('Bit0=LSB: kombinacje → wartość 0..6', () => {
    expect(flagColorValue(['$MailFlagBit0'], true)).toBe(1); // orange
    expect(flagColorValue(['$MailFlagBit1'], true)).toBe(2); // yellow
    expect(flagColorValue(['$MailFlagBit0', '$MailFlagBit1'], true)).toBe(3); // green
    expect(flagColorValue(['$MailFlagBit2'], true)).toBe(4); // blue
    expect(flagColorValue(['$MailFlagBit0', '$MailFlagBit2'], true)).toBe(5); // purple
    expect(flagColorValue(['$MailFlagBit1', '$MailFlagBit2'], true)).toBe(6); // grey
  });

  it('bity bez starred → null (kolor wymaga \\Flagged)', () => {
    expect(flagColorValue(['$MailFlagBit2'], false)).toBe(null);
  });
});

describe('flag-colors — kodowanie (keywordsForFlagColor)', () => {
  it('blue (4) → dodaj Bit2, usuń Bit0/Bit1', () => {
    const { add, remove } = keywordsForFlagColor(4);
    expect(add).toEqual(['$MailFlagBit2']);
    expect(remove.slice().sort()).toEqual(['$MailFlagBit0', '$MailFlagBit1']);
  });

  it('red (0) → usuń wszystkie bity', () => {
    const { add, remove } = keywordsForFlagColor(0);
    expect(add).toEqual([]);
    expect(remove.slice().sort()).toEqual(['$MailFlagBit0', '$MailFlagBit1', '$MailFlagBit2']);
  });

  it('purple (5) → dodaj Bit0+Bit2, usuń Bit1', () => {
    const { add, remove } = keywordsForFlagColor(5);
    expect(add.slice().sort()).toEqual(['$MailFlagBit0', '$MailFlagBit2']);
    expect(remove).toEqual(['$MailFlagBit1']);
  });
});

describe('flag-colors — helpery', () => {
  it('flagColorFor / token / nameKey / tagId', () => {
    expect(flagColorFor(4)!.key).toBe('blue');
    expect(flagColorToken(4)).toBe('var(--flag-blue)');
    expect(flagColorNameKey(0)).toBe('Red');
    expect(flagTagId(4)).toBe('flag_4');
  });

  it('flagMeaningKey — akcja wg kwadrantu (znaczenie)', () => {
    expect(flagMeaningKey(0)).toBe('Do now'); // red → Q1
    expect(flagMeaningKey(4)).toBe('Schedule'); // blue → Q2
    expect(flagMeaningKey(2)).toBe('Delegate'); // yellow → Q3
    expect(flagMeaningKey(3)).toBe('Defer'); // green → Q4
  });
});

describe('flag-colors — konfigurowalne mapowanie (korekta po kalibracji)', () => {
  afterEach(() => setFlagColorOrder(null));

  it('override value→key zmienia kolor (np. Bit0 sam = blue zamiast orange)', () => {
    // Hipoteza ze zrzutu usera: sam Bit0 = Niebieski. Override pozwala to poprawić.
    setFlagColorOrder(['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'grey']);
    expect(flagColorFor(1)!.key).toBe('blue');
    expect(flagColorToken(1)).toBe('var(--flag-blue)');
  });

  it('reset override → wraca IETF', () => {
    setFlagColorOrder(['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'grey']);
    setFlagColorOrder(null);
    expect(flagColorFor(1)!.key).toBe('orange');
  });
});
