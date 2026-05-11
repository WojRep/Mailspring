import { localized, localizedReactFragment, isRTL } from '../src/intl';

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

    it('handles reordered placeholders (%2$@ before %1$@)', () => {
      // PL/DE/ES translations frequently reorder placeholders relative
      // to the English source. The fix ensures that subs[N-1] stays
      // correct regardless of textual position.
      const result = localizedReactFragment('%2$@ comes before %1$@', 'alpha', 'beta');
      const flat = JSON.stringify(result);
      // "beta" (sub #2) appears before "alpha" (sub #1) in the rendered output
      const betaIdx = flat.indexOf('beta');
      const alphaIdx = flat.indexOf('alpha');
      expect(betaIdx).toBeGreaterThan(-1);
      expect(alphaIdx).toBeGreaterThan(-1);
      expect(betaIdx).toBeLessThan(alphaIdx);
    });

    it('falls through to %@ positional substitution when no %N$@ present', () => {
      const result = localizedReactFragment('%@ and %@', 'one', 'two');
      const flat = JSON.stringify(result);
      const oneIdx = flat.indexOf('one');
      const twoIdx = flat.indexOf('two');
      expect(oneIdx).toBeGreaterThan(-1);
      expect(twoIdx).toBeGreaterThan(-1);
      expect(oneIdx).toBeLessThan(twoIdx);
    });
  });

  describe('localized() edge cases', () => {
    it('returns input unchanged when no placeholders present', () => {
      expect(localized('Plain text without substitutions')).toBe(
        'Plain text without substitutions'
      );
    });

    it('handles empty subs array', () => {
      expect(localized('Hello world')).toBe('Hello world');
    });

    it('handles more subs than placeholders (extras ignored)', () => {
      // The function uses %@ replace with subs[i++]; extras don't crash.
      const result = localized('Just one: %@', 'first', 'second-ignored');
      expect(result).toContain('first');
      // The "second-ignored" sub is not consumed because translated has
      // only one %@ — behaviour is "use as many subs as placeholders".
    });

    it('handles fewer subs than placeholders (undefined inserted)', () => {
      const result = localized('%@ and %@', 'only-one');
      // Second placeholder gets undefined → stringified as "undefined"
      expect(result).toContain('only-one');
      expect(result).toContain('undefined');
    });
  });

  describe('isRTL detection', () => {
    it('is a boolean exported from intl module', () => {
      expect(typeof isRTL).toBe('boolean');
    });

    it('defaults to false in spec environment (no RTL locale init)', () => {
      // Without initializeLocalization() being called with an RTL lang,
      // isRTL stays at its default (false).
      expect(isRTL).toBe(false);
    });

    // Note: testing the toggle to true requires invoking
    // initializeLocalization({configDirPath: ...}) with a fixture
    // config.json that selects an RTL language (he, ar, fa, etc.).
    // That's an integration test surface, deferred to a future
    // dedicated locale-switch spec.
  });
});
