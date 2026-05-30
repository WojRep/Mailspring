/**
 * Bilet MVP #92 — actuna-glass unit tests.
 *
 * Note: useGlassMaterial hook test wymaga DOM env (Jasmine w Mailspring runs
 * w Chromium z full DOM). Pełne hook testing odłożone na Playwright e2e.
 * Tutaj testujemy isGlassMaterialEnabled (sync function) + flag wiring.
 */

import { isGlassMaterialEnabled } from '../internal_packages/actuna-glass/lib/use-glass-material';

describe('actuna-glass — bilet MVP #92', () => {

  describe('isGlassMaterialEnabled', () => {
    let originalConfig: any;
    let mockConfig: any;

    beforeEach(() => {
      // ŚWIADOMY zakaz: NIE zamieniać window.AppEnv globalnie — kolejne
      // specs renderują komponenty wymagające AppEnv.commands / packages /
      // keymaps i pollution cascade-failuje setki testów.
      originalConfig = (window as any).AppEnv?.config;
      mockConfig = { _values: {} as { [k: string]: any } };
      mockConfig.get = (key: string) => mockConfig._values[key];
      mockConfig.set = (key: string, val: any) => { mockConfig._values[key] = val; };
      if ((window as any).AppEnv) {
        (window as any).AppEnv.config = mockConfig;
      } else {
        (window as any).AppEnv = { config: mockConfig };
      }
    });

    afterEach(() => {
      if ((window as any).AppEnv && originalConfig !== undefined) {
        (window as any).AppEnv.config = originalConfig;
      }
    });

    it('returns false when flag is unset (default OFF)', () => {
      expect(isGlassMaterialEnabled()).toBe(false);
    });

    it('returns false when flag is explicit false', () => {
      mockConfig.set('core.appearance.translucentSurfaces', false);
      expect(isGlassMaterialEnabled()).toBe(false);
    });

    it('returns true when force=true regardless of flag', () => {
      mockConfig.set('core.appearance.translucentSurfaces', false);
      expect(isGlassMaterialEnabled(true)).toBe(true);
    });

    it('returns false when matchMedia not available', () => {
      const originalMatchMedia = window.matchMedia;
      (window as any).matchMedia = undefined;
      mockConfig.set('core.appearance.translucentSurfaces', true);
      expect(isGlassMaterialEnabled()).toBe(false);
      (window as any).matchMedia = originalMatchMedia;
    });

    it('respects prefers-reduced-transparency', () => {
      mockConfig.set('core.appearance.translucentSurfaces', true);
      const originalMatchMedia = window.matchMedia;
      // Mock matchMedia returning matches=true dla reduced-transparency
      (window as any).matchMedia = (query: string) => ({
        matches: query.includes('reduced-transparency'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      });
      expect(isGlassMaterialEnabled()).toBe(false);
      (window as any).matchMedia = originalMatchMedia;
    });

    it('respects prefers-contrast: more', () => {
      mockConfig.set('core.appearance.translucentSurfaces', true);
      const originalMatchMedia = window.matchMedia;
      (window as any).matchMedia = (query: string) => ({
        matches: query.includes('contrast: more'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      });
      expect(isGlassMaterialEnabled()).toBe(false);
      (window as any).matchMedia = originalMatchMedia;
    });

    it('returns true when flag on + no system overrides', () => {
      mockConfig.set('core.appearance.translucentSurfaces', true);
      const originalMatchMedia = window.matchMedia;
      (window as any).matchMedia = () => ({
        matches: false,
        media: '',
        addEventListener: () => {},
        removeEventListener: () => {},
      });
      expect(isGlassMaterialEnabled()).toBe(true);
      (window as any).matchMedia = originalMatchMedia;
    });
  });
});
