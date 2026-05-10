import { localized, localizedReactFragment } from '../src/intl';

// Sprint 5 ticket 11: stub spec for intl.ts. The localizedReactFragment
// placeholder math (subs[match[1] - 1]) was a bug fix — earlier code did
// subs[match[1] / 1] which divided the captured string by 1 (no-op coercion
// but no zero-indexing adjustment). This spec covers the fix.
//
// More comprehensive coverage (RTL detection, locale switching, %@ vs %N$@
// fallback paths) is tracked in a follow-up TDD ticket.

describe('intl', () => {
  describe('localized', () => {
    it('returns the input string unchanged when no translation is loaded', () => {
      // Without initializeLocalization() called, localizations map is empty,
      // so localized(en) falls back to en directly.
      expect(localized('Hello')).toBe('Hello');
    });

    it('substitutes %@ placeholders in order', () => {
      expect(localized('%@ + %@', 'one', 'two')).toBe('one + two');
    });

    it('substitutes %N$@ numbered placeholders', () => {
      // The translated form may contain %1$@ %2$@ for reordering; this test
      // pins the substitution math.
      expect(localized('%1$@ then %2$@', 'first', 'second')).toBe('first then second');
    });
  });

  describe('localizedReactFragment placeholder math', () => {
    // Regression guard for the intl.ts:252 fix.
    // Before the fix:  parts.push(subs[match[1] / 1])
    //   match[1] is the captured numeric string (e.g. "1"), divided by 1 it
    //   is still "1" (string coerced to number) and indexes subs[1] —
    //   off-by-one, returns the wrong placeholder value.
    // After the fix:   parts.push(subs[match[1] - 1])
    //   "1" - 1 === 0, indexes subs[0] which is the first sub — correct.

    it('maps %1$@ to the first sub (zero-indexed)', () => {
      const result = localizedReactFragment('%1$@ wins', 'alpha');
      // localizedReactFragment returns a React fragment (array of strings/elements).
      // Smoke check: stringification should contain "alpha" and "wins" but
      // NOT the placeholder.
      const flat = JSON.stringify(result);
      expect(flat).toContain('alpha');
      expect(flat).toContain('wins');
      expect(flat).not.toContain('%1$@');
    });

    it('maps %2$@ to the second sub', () => {
      const result = localizedReactFragment('%1$@ before %2$@', 'first', 'second');
      const flat = JSON.stringify(result);
      expect(flat).toContain('first');
      expect(flat).toContain('second');
      expect(flat).not.toContain('%1$@');
      expect(flat).not.toContain('%2$@');
    });
  });
});
