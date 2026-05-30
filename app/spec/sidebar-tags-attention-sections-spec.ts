/**
 * RED tests (TDD #1) — SidebarStore tagsSection() + attentionLayersSection()
 * integrations per plan v1.0 mockup design/mockups/01-app-shell.html.
 *
 * Per user mandate 2026-05-30:
 *   "100% pokrycia testai e2e"
 *   "metodologia pracy agile z tdd i ddd"
 *
 * Integracje:
 *  - tagsSection() — #98 TagStore (user tags only, system tags ignored as oddzielne)
 *  - attentionLayersSection() — #93 PriorityInbox (Focused / Pinned) + #104 Snooze (Snoozed)
 */

import SidebarStore from '../internal_packages/account-sidebar/lib/sidebar-store';

describe('SidebarStore — Tags + Attention Layers sections (plan v1.0)', () => {
  describe('tagsSection() — #98 integration', () => {
    it('exposes tagsSection() method', () => {
      expect(typeof (SidebarStore as any).tagsSection).toBe('function');
    });

    it('returns ISidebarSection z title containing "tag"', () => {
      const section = (SidebarStore as any).tagsSection();
      expect(section).toBeDefined();
      expect(typeof section.title).toBe('string');
      expect(section.title.toLowerCase()).toContain('tag');
      expect(Array.isArray(section.items)).toBe(true);
    });

    it('items array reflects user tags from TagStore.list() (system tags filtered out)', () => {
      const tagMod = require('../internal_packages/tag-system/lib/tag-store');
      const TagStore = tagMod.TagStore;
      // Reset by clearing all user tags + reinitializing
      const all = TagStore.list();
      for (const t of all) {
        if (!t.systemManaged) TagStore.delete(t.id);
      }
      // Register 2 user tags
      TagStore.register({
        id: 'utag-pricing',
        name: 'Pricing',
        color: '#3b6bdb',
        source: 'user',
      });
      TagStore.register({
        id: 'utag-q1',
        name: 'Q1-2026',
        color: '#27ae60',
        source: 'user',
      });
      const section = (SidebarStore as any).tagsSection();
      const names = section.items.map((i: any) => i.name);
      expect(names).toContain('Pricing');
      expect(names).toContain('Q1-2026');
    });
  });

  describe('attentionLayersSection() — #93 + #104 integration', () => {
    it('exposes attentionLayersSection() method', () => {
      expect(typeof (SidebarStore as any).attentionLayersSection).toBe('function');
    });

    it('returns ISidebarSection z title (Attention Layers / Focus / Focused etc.)', () => {
      const section = (SidebarStore as any).attentionLayersSection();
      expect(section).toBeDefined();
      expect(typeof section.title).toBe('string');
      expect(section.title.toLowerCase()).toMatch(/attention|focus|priorit|uwag/);
      expect(Array.isArray(section.items)).toBe(true);
    });

    it('items contain Focused (Priority Inbox), Pinned, Snoozed entries', () => {
      const section = (SidebarStore as any).attentionLayersSection();
      const names = section.items.map((i: any) => (i.name || '').toLowerCase());
      // At minimum 3 items: priority / pin / snooze
      expect(section.items.length).toBeGreaterThan(2);
      const hasPriority = names.some((n: string) => /focus|priorit|skup/.test(n));
      const hasPin = names.some((n: string) => /pin|przyp/.test(n));
      const hasSnooze = names.some((n: string) => /snooz|odło/.test(n));
      expect(hasPriority).toBe(true);
      expect(hasPin).toBe(true);
      expect(hasSnooze).toBe(true);
    });
  });
});
