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
import { PinStore } from '../internal_packages/priority-inbox-pin/lib/pin-store';
import { SnoozeStore } from '../internal_packages/snooze/lib/snooze-store';

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

  // Bugfix: the three Attention Layers rows were inert (no onSelect, no
  // perspective) so clicking them did nothing. Each row must now open a
  // filtered virtual-folder view (ThreadIdListPerspective) of the relevant
  // threads, exactly like a real folder dispatches focusMailboxPerspective.
  describe('attentionLayersSection() — clickable filtered views (bugfix)', () => {
    beforeEach(() => {
      PinStore._reset();
      PinStore.init();
      SnoozeStore._reset();
      SnoozeStore.init();
    });
    afterEach(() => {
      PinStore._reset();
      SnoozeStore._reset();
    });

    const byId = (section: any, id: string) => section.items.find((i: any) => i.id === id);

    it('every attention item exposes an onSelect handler', () => {
      const section = (SidebarStore as any).attentionLayersSection();
      expect(section.items.length).toBeGreaterThan(2);
      for (const item of section.items) {
        expect(typeof item.onSelect).toBe('function');
      }
    });

    it('Focused = FocusedMailboxPerspective (auto-detected), Pinned = PinnedMailboxPerspective', () => {
      const section = (SidebarStore as any).attentionLayersSection();
      const focused = byId(section, 'attention-focused');
      const pinned = byId(section, 'attention-pinned');
      // Both query the synced model (cross-device), not a localStorage list.
      // Focused = pinned ∪ starred ∪ rules/AI; Pinned = only pinned (a subset).
      expect(focused.perspective.constructor.name).toBe('FocusedMailboxPerspective');
      expect(pinned.perspective.constructor.name).toBe('PinnedMailboxPerspective');
      expect(pinned.perspective.pinned).toBe(true);
    });

    it('Snoozed carries a ThreadIdListPerspective matching SnoozeStore.list()', () => {
      SnoozeStore.snoozeUntil('thread-x', Date.now() + 3600000);
      SnoozeStore.snoozeUntil('thread-y', Date.now() + 7200000);
      const section = (SidebarStore as any).attentionLayersSection();
      const snoozed = byId(section, 'attention-snoozed');
      expect(snoozed.perspective.constructor.name).toBe('ThreadIdListPerspective');
      const expected = SnoozeStore.list()
        .map((e: any) => e.threadId)
        .sort();
      expect(snoozed.perspective.toJSON().threadIds.slice().sort()).toEqual(expected);
    });

    it('clicking an item dispatches focusMailboxPerspective with its perspective', () => {
      const { Actions } = require('actunamail-exports');
      spyOn(Actions, 'focusMailboxPerspective');
      const section = (SidebarStore as any).attentionLayersSection();
      const item = section.items[0];
      item.onSelect(item);
      expect(Actions.focusMailboxPerspective).toHaveBeenCalledWith(item.perspective);
    });

    it('count badge reflects store count, not unread', () => {
      PinStore.pin('t1');
      PinStore.pin('t2');
      PinStore.pin('t3');
      const section = (SidebarStore as any).attentionLayersSection();
      expect(byId(section, 'attention-pinned').count).toBe(3);
    });
  });
});
