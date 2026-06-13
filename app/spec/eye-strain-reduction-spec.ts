/**
 * RED tests (TDD) — tryb redukcji zmęczenia oczu (ciepła nakładka, regulowana).
 *
 * Wymagania użytkownika (verbatim): "specjalny przycisk redukujący / tuningujący
 * kolory męczące oczy. Wszystko zgodnie z WCAG oraz zaleceniami okulistów."
 * Decyzje: regulowane poziomy (off/low/high) + nakładka ciepłego filtra.
 *
 * Cykl: RED tu (brak modułu eye-strain + brak klucza config) → GREEN: dodać
 * app/src/eye-strain.ts + klucz core.appearance.eyeStrainReduction.
 */

import configSchema from '../src/config-schema';
import {
  EYE_STRAIN_LEVELS,
  eyeStrainFilterForLevel,
  buildEyeStrainCSS,
  applyEyeStrainStylesheet,
  eyeStrainTransformRgb,
  EYE_STRAIN_SOURCE_PATH,
} from '../src/eye-strain';

// WCAG 2.1 relative luminance + contrast ratio (test-local, niezależna od produkcji).
function relLum([r, g, b]: number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(a: number[], b: number[]): number {
  const la = relLum(a);
  const lb = relLum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (h: string): number[] => {
  const n = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};

describe('Eye-strain reduction — config schema', () => {
  it('exposes core.appearance.eyeStrainReduction (enum off/low/high, default off)', () => {
    const node = (configSchema as any).core.properties.appearance.properties.eyeStrainReduction;
    expect(node).toBeDefined();
    expect(node.type).toBe('string');
    expect(node.default).toBe('off');
    expect(node.enum.slice().sort()).toEqual(['high', 'low', 'off']);
  });
});

describe('Eye-strain reduction — filter params', () => {
  it('off → empty filter, no CSS', () => {
    expect(eyeStrainFilterForLevel('off')).toBe('');
    expect(buildEyeStrainCSS('off')).toBe('');
  });

  it('low/high → warm sepia + brightness < 1 (redukcja światła niebieskiego + glare)', () => {
    for (const level of ['low', 'high'] as const) {
      const f = eyeStrainFilterForLevel(level);
      expect(f).toMatch(/sepia\(/);
      expect(f).toMatch(/brightness\(/);
      // brightness mnożnik < 1 (ścina jaskrawą biel), ale nie za nisko
      expect(EYE_STRAIN_LEVELS[level].brightness).toBeLessThan(1);
      expect(EYE_STRAIN_LEVELS[level].brightness).toBeGreaterThan(0.85);
      // high cieplejszy niż low
    }
    expect(EYE_STRAIN_LEVELS.high.sepia).toBeGreaterThan(EYE_STRAIN_LEVELS.low.sepia);
  });

  it('buildEyeStrainCSS: @media screen + html filter (root → fixed nie pływa; bez tinta w druku)', () => {
    const css = buildEyeStrainCSS('low');
    expect(css).toMatch(/@media\s+screen/); // nie aplikuj filtra przy druku
    expect(css).toMatch(/html\s*\{/);
    expect(css).toMatch(/filter:/);
  });
});

describe('Eye-strain reduction — stylesheet inject/dispose (mirror applySystemAccent)', () => {
  let fakeDisposable: any;
  let styles: any;
  beforeEach(() => {
    fakeDisposable = { dispose: jasmine.createSpy('dispose') };
    styles = { addStyleSheet: jasmine.createSpy('addStyleSheet').andReturn(fakeDisposable) };
  });

  it('off → nie wstrzykuje, zwraca null, disposuje poprzedni', () => {
    const prev = { dispose: jasmine.createSpy('prevDispose') };
    const out = applyEyeStrainStylesheet(styles, 'off', prev);
    expect(prev.dispose).toHaveBeenCalled();
    expect(styles.addStyleSheet).not.toHaveBeenCalled();
    expect(out).toBe(null);
  });

  it('low → wstrzykuje arkusz z sourcePath + zwraca Disposable', () => {
    const out = applyEyeStrainStylesheet(styles, 'low', null);
    expect(styles.addStyleSheet).toHaveBeenCalled();
    const [css, opts] = styles.addStyleSheet.mostRecentCall.args;
    expect(css).toMatch(/filter:/);
    expect(opts.sourcePath).toBe(EYE_STRAIN_SOURCE_PATH);
    expect(out).toBe(fakeDisposable);
  });

  it('zmiana poziomu low→high disposuje poprzedni i wstrzykuje nowy', () => {
    const out1 = applyEyeStrainStylesheet(styles, 'low', null);
    const out2 = applyEyeStrainStylesheet(styles, 'high', out1);
    expect(fakeDisposable.dispose).toHaveBeenCalled();
    expect(styles.addStyleSheet.calls.length).toBe(2);
    expect(out2).toBe(fakeDisposable);
  });
});

describe('Eye-strain reduction — WCAG AA zachowany po nałożeniu filtra', () => {
  // Reprezentatywne pary tekst/tło, AA w bazie. Po transformacji filtra (ta sama
  // dla fg i bg) kontrast MUSI zostać ≥ 4.5:1 (WCAG 1.4.3 AA, normalny tekst).
  const pairs = [
    { name: 'light primary', fg: '#2C3038', bg: '#FFFFFF' }, // neutral-80 / neutral-00
    { name: 'light secondary', fg: '#5C6470', bg: '#FFFFFF' }, // neutral-60 / white
    { name: 'dark primary (tokens)', fg: '#DDE0E5', bg: '#0B0D10' }, // neutral-80 / neutral-00 dark
    { name: 'dark legacy (ui-dark)', fg: '#EEEEEE', bg: '#212121' },
  ];

  for (const level of ['low', 'high'] as const) {
    for (const p of pairs) {
      it(`${level} / ${p.name}: kontrast ≥ 4.5:1`, () => {
        const fg = eyeStrainTransformRgb(hex(p.fg), level);
        const bg = eyeStrainTransformRgb(hex(p.bg), level);
        expect(contrastRatio(fg, bg)).toBeGreaterThan(4.5);
      });
    }
  }
});

describe('Eye-strain reduction — filtr NIE pogarsza kontrastu (preservation invariant)', () => {
  // Niezmiennik (przegląd adversarialny): filtr aplikowany TAK SAMO do tekstu i
  // tła zachowuje ratio kontrastu — także dla par, które w bazie są PONIŻEJ AA
  // (np. tekst wyciszony --neutral-40, success). Feature nie tworzy nowych
  // naruszeń WCAG; istniejące tokeny sub-AA to osobny dług design-systemu.
  const allPairs = [
    { name: 'light primary', fg: '#2C3038', bg: '#FFFFFF' },
    { name: 'light secondary', fg: '#5C6470', bg: '#FFFFFF' },
    { name: 'light link', fg: '#2E72C7', bg: '#FFFFFF' }, // baza ~4.83:1
    { name: 'light success (baza < AA)', fg: '#2D8B5F', bg: '#FFFFFF' }, // baza ~4.23:1
    { name: 'light danger', fg: '#C13B3B', bg: '#FFFFFF' },
    { name: 'light muted (baza << AA)', fg: '#9CA3AE', bg: '#FFFFFF' }, // baza ~2.54:1
    { name: 'dark primary', fg: '#DDE0E5', bg: '#0B0D10' },
    { name: 'dark muted (baza < AA)', fg: '#5C6470', bg: '#0B0D10' }, // baza ~3.25:1
  ];

  for (const level of ['low', 'high'] as const) {
    for (const p of allPairs) {
      it(`${level} / ${p.name}: ratio po filtrze ≥ 95% bazowego`, () => {
        const base = contrastRatio(hex(p.fg), hex(p.bg));
        const after = contrastRatio(
          eyeStrainTransformRgb(hex(p.fg), level),
          eyeStrainTransformRgb(hex(p.bg), level)
        );
        expect(after).toBeGreaterThan(base * 0.95);
      });
    }
  }
});
