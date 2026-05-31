/**
 * RED spec — thread-list context menu items dla Wave 3-8 features.
 *
 * User-reported gap (verbatim 2026-05-31): "dlaczego nie ma tych opcji w
 * menu kontekstowym pod prawym przyciskiem?"
 *
 * Wcześniej context menu miało TYLKO: Reply, Forward, Archive, Trash,
 * Mark Read/Unread, Star, Copy permalink. BRAK:
 * - Pin / Unpin (#93)
 * - Snooze submenu (#104)
 * - Add tag (#98)
 * - Time intent Today/Upcoming/Anytime (#96)
 *
 * Ten spec waliduje że ThreadListContextMenu.menuItemTemplate() ZAWIERA
 * Wave 3-8 items.
 */

import ThreadListContextMenu from '../internal_packages/thread-list/lib/thread-list-context-menu';

describe('ThreadListContextMenu — Wave 3-8 items (regression 2026-05-31)', () => {
  let menu: any;

  beforeEach(() => {
    menu = new ThreadListContextMenu({ threadIds: ['t1'], accountIds: ['a1'] });
  });

  it('pinItem() istnieje i zwraca template z label "Pin" lub "Unpin"', () => {
    expect(typeof (menu as any).pinItem).toBe('function');
    const tmpl = (menu as any).pinItem();
    expect(tmpl).toBeDefined();
    expect(tmpl && tmpl.label).toBeTruthy();
    expect(tmpl.label.toLowerCase()).toMatch(/pin|przypnij|odepnij/);
  });

  it('snoozeItem() istnieje i zwraca template z submenu', () => {
    expect(typeof (menu as any).snoozeItem).toBe('function');
    const tmpl = (menu as any).snoozeItem();
    expect(tmpl).toBeDefined();
    expect(tmpl.label.toLowerCase()).toMatch(/snooze|odłóż/);
    expect(tmpl.submenu).toBeDefined();
    expect(Array.isArray(tmpl.submenu)).toBe(true);
    expect(tmpl.submenu.length).toBeGreaterThan(0);
  });

  it('addTagItem() istnieje i zwraca template otwierający picker', () => {
    expect(typeof (menu as any).addTagItem).toBe('function');
    const tmpl = (menu as any).addTagItem();
    expect(tmpl).toBeDefined();
    expect(tmpl.label.toLowerCase()).toMatch(/tag|etykiet/);
    expect(typeof tmpl.click).toBe('function');
  });

  it('timeIntentItem() istnieje z submenu Today/Upcoming/Anytime', () => {
    expect(typeof (menu as any).timeIntentItem).toBe('function');
    const tmpl = (menu as any).timeIntentItem();
    expect(tmpl).toBeDefined();
    expect(tmpl.submenu).toBeDefined();
    expect(tmpl.submenu.length).toBe(3);
    const labels = tmpl.submenu.map((s: any) => s.label.toLowerCase());
    expect(labels.some((l: string) => /today|dzisiaj/.test(l))).toBe(true);
    expect(labels.some((l: string) => /upcoming|nadcho|zaplan/.test(l))).toBe(true);
    expect(labels.some((l: string) => /anytime|kiedy/.test(l))).toBe(true);
  });
});
