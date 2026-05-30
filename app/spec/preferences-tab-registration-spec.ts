/**
 * Preferences tab registration contract — bilet MVP #98 + TDD (2026-05-30).
 *
 * Why: 2026-05-30 user złapał manually że Preferences > Tags = biały ekran
 * w prod build. Root cause: tag-system/lib/main.ts:35 przesłał plain object
 * `{tabId, displayName, component: PreferencesTags, ...}` zamiast wymagany
 * `new PreferencesUIStore.TabItem({tabId, displayName, componentClassFn:
 * () => PreferencesTags})`. Plain object nie ma `.componentClassFn` →
 * PreferencesRoot renderuje undefined → biały ekran. To bug który TDD by
 * złapało PRZED prod ship — ten spec jest red test (post-hoc, ale dodany
 * jako gate dla future regressions).
 *
 * Per user mandate "Nie stosujesz podejścia: Test-driven development.
 * To obowiązkowe !!!" (2026-05-30) — każda nowa Preferences tab MUSI
 * być sprawdzana przez ten spec.
 */

import { PreferencesUIStore } from 'actunamail-exports';

describe('Preferences tab registration contract — TDD regression #98', () => {
  it('PreferencesUIStore exposes TabItem constructor', () => {
    expect(typeof (PreferencesUIStore as any).TabItem).toBe('function');
  });

  it('PreferencesUIStore.registerPreferencesTab is callable', () => {
    expect(typeof (PreferencesUIStore as any).registerPreferencesTab).toBe('function');
  });

  it('TabItem instance has tabId + displayName + componentClassFn', () => {
    const dummyComponent = function DummyTab() { return null; };
    const tab = new (PreferencesUIStore as any).TabItem({
      tabId: 'TestTab',
      displayName: 'Test Tab',
      componentClassFn: () => dummyComponent,
      order: 999,
    });
    expect(tab.tabId).toBe('TestTab');
    expect(tab.displayName).toBe('Test Tab');
    expect(typeof tab.componentClassFn).toBe('function');
    expect(tab.componentClassFn()).toBe(dummyComponent);
  });

  describe('tag-system plugin registers Tags tab correctly', () => {
    it('tag-system main.ts uses TabItem instance + componentClassFn (NOT plain object)', () => {
      // Source inspection — gdy regression wprowadzi plain `component:` zamiast
      // `componentClassFn:`, ten test fail.
      const fs = require('fs');
      const path = require('path');
      const mainPath = path.join(
        __dirname,
        '..',
        'internal_packages',
        'tag-system',
        'lib',
        'main.ts'
      );
      const src = fs.readFileSync(mainPath, 'utf-8');
      // Must use TabItem constructor pattern
      expect(src).toContain('new PreferencesUIStore.TabItem(');
      expect(src).toContain('componentClassFn:');
      expect(src).toContain('tabId: \'Tags\'');
      // Must NOT use the broken plain object pattern.
      expect(src).not.toMatch(/registerPreferencesTab\s*\(\s*\{[^}]*component:\s*PreferencesTags/);
    });

    it('tag-system PreferencesTags component is importable', () => {
      // Defensive: gdy regression usunie eksport, ten test fail.
      const PreferencesTags = require('../internal_packages/tag-system/lib/preferences-tags').default;
      expect(typeof PreferencesTags).toBe('function');
      expect(PreferencesTags.displayName).toBe('PreferencesTags');
    });
  });
});
