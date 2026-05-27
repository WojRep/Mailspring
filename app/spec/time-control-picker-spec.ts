/**
 * Bilet MVP #90 — Time-control picker unit tests.
 *
 * Skupia się na parser: PL+EN, edge cases, confidence.
 */

import { parseNaturalLanguage } from '../internal_packages/time-control-picker/lib/natural-language-parser';

describe('Time-control picker — bilet MVP #90', () => {

  describe('natural language parser', () => {
    it('returns null for empty input', () => {
      expect(parseNaturalLanguage('')).toBeNull();
      expect(parseNaturalLanguage('   ')).toBeNull();
    });

    it('returns null for garbage input', () => {
      expect(parseNaturalLanguage('xyzzy plover frobnicate')).toBeNull();
    });

    it('parses "tomorrow 9am" → next day 09:00', () => {
      const result = parseNaturalLanguage('tomorrow 9am');
      expect(result).not.toBeNull();
      const d = result!.date;
      expect(d.getHours()).toBe(9);
      expect(d.getMinutes()).toBe(0);
      // jutro vs dziś
      const today = new Date();
      expect(d.getDate()).toBe((today.getDate() + 1) % 32 || 1);
    });

    it('parses "jutro 14:00" → next day 14:00 (PL)', () => {
      const result = parseNaturalLanguage('jutro 14:00');
      expect(result).not.toBeNull();
      expect(result!.date.getHours()).toBe(14);
    });

    it('parses "in 3 days" → +3 days at 09:00', () => {
      const result = parseNaturalLanguage('in 3 days');
      expect(result).not.toBeNull();
      const diff = result!.date.getTime() - Date.now();
      // ~3 days ± few hours (zależy od czasu uruchomienia)
      const hoursDiff = diff / (60 * 60 * 1000);
      expect(hoursDiff).toBeGreaterThan(48); // > 2 dni
      expect(hoursDiff).toBeLessThan(96); // < 4 dni
    });

    it('parses "za 3 dni" → +3 days (PL)', () => {
      const result = parseNaturalLanguage('za 3 dni');
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.9);
    });

    it('parses "in 2 hours" → +2h', () => {
      const result = parseNaturalLanguage('in 2 hours');
      expect(result).not.toBeNull();
      const diff = result!.date.getTime() - Date.now();
      const hoursDiff = diff / (60 * 60 * 1000);
      expect(hoursDiff).toBeGreaterThan(1.9);
      expect(hoursDiff).toBeLessThan(2.1);
    });

    it('parses "za 30 minut" → +30 min (PL)', () => {
      const result = parseNaturalLanguage('za 30 minut');
      expect(result).not.toBeNull();
      const diff = result!.date.getTime() - Date.now();
      const minDiff = diff / (60 * 1000);
      expect(minDiff).toBeGreaterThan(29);
      expect(minDiff).toBeLessThan(31);
    });

    it('parses "next monday" → najbliższy poniedziałek', () => {
      const result = parseNaturalLanguage('next monday');
      expect(result).not.toBeNull();
      expect(result!.date.getDay()).toBe(1); // Monday
    });

    it('parses "poniedziałek 14:00" → następny pn 14:00 (PL)', () => {
      const result = parseNaturalLanguage('poniedziałek 14:00');
      expect(result).not.toBeNull();
      expect(result!.date.getDay()).toBe(1);
      expect(result!.date.getHours()).toBe(14);
    });

    it('parses "this weekend" → najbliższa sobota 09:00', () => {
      const result = parseNaturalLanguage('this weekend');
      expect(result).not.toBeNull();
      expect(result!.date.getDay()).toBe(6); // Saturday
      expect(result!.date.getHours()).toBe(9);
    });

    it('parses "next week" → poniedziałek następny', () => {
      const result = parseNaturalLanguage('next week');
      expect(result).not.toBeNull();
      expect(result!.date.getDay()).toBe(1);
    });

    it('handles "tomorrow morning" (no specific time)', () => {
      const result = parseNaturalLanguage('tomorrow morning');
      expect(result).not.toBeNull();
      expect(result!.date.getHours()).toBe(9);
    });

    it('handles "jutro wieczorem" (PL evening)', () => {
      const result = parseNaturalLanguage('jutro wieczorem');
      expect(result).not.toBeNull();
      expect(result!.date.getHours()).toBe(18);
    });

    it('confidence is 0.95 for exact patterns', () => {
      const result = parseNaturalLanguage('tomorrow 9am');
      expect(result!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('description is non-empty', () => {
      const result = parseNaturalLanguage('jutro 14:00');
      expect(result!.description.length).toBeGreaterThan(0);
    });

    it('source preserves original input', () => {
      const input = 'in 5 days';
      const result = parseNaturalLanguage(input);
      expect(result!.source).toBe(input);
    });
  });
});
