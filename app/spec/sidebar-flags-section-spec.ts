/**
 * RED tests (TDD) — sekcja „Flagi / Flags" w panelu bocznym.
 * Każdy kolor flagi Apple = klikalny filtr w swoim kolorze (rozróżnia kolory).
 * tagsSection NIE pokazuje tagów flag (source 'flag').
 */

import SidebarStore from '../internal_packages/account-sidebar/lib/sidebar-store';
import { TagStore } from '../internal_packages/tag-system/lib/tag-store';

describe('SidebarStore — flagsSection (kolory flag Apple)', () => {
  beforeEach(() => {
    TagStore._reset();
    TagStore.init();
  });
  afterEach(() => TagStore._reset());

  it('listuje obecne kolory flag z właściwym kolorem, licznikiem i perspektywą', () => {
    TagStore.syncFlagColorFromThread({
      id: 't1',
      customKeywords: ['$MailFlagBit2'],
      starred: true,
    }); // blue
    TagStore.syncFlagColorFromThread({
      id: 't2',
      customKeywords: ['$MailFlagBit2'],
      starred: true,
    }); // blue
    TagStore.syncFlagColorFromThread({
      id: 't3',
      customKeywords: ['$MailFlagBit0'],
      starred: true,
    }); // orange

    const section = (SidebarStore as any).flagsSection();
    expect(section.title.toLowerCase()).toMatch(/flag/);
    const blue = section.items.find((i: any) => i.id === 'tag-flag_4');
    expect(blue).toBeDefined();
    expect(blue.color).toBe('var(--flag-blue)');
    expect(blue.count).toBe(2);
    expect(blue.perspective.constructor.name).toBe('ThreadIdListPerspective');
    expect(typeof blue.onSelect).toBe('function');
    const orange = section.items.find((i: any) => i.id === 'tag-flag_1');
    expect(orange.color).toBe('var(--flag-orange)');
    expect(orange.count).toBe(1);
  });

  it('jest zwijalna', () => {
    const section = (SidebarStore as any).flagsSection();
    expect(typeof section.onCollapseToggled).toBe('function');
    expect(typeof section.collapsed).toBe('boolean');
  });

  it('tagsSection NIE pokazuje tagów kolorów flag', () => {
    TagStore.syncFlagColorFromThread({
      id: 't1',
      customKeywords: ['$MailFlagBit2'],
      starred: true,
    });
    const tags = (SidebarStore as any).tagsSection();
    expect(tags.items.find((i: any) => i.id === 'tag-flag_4')).toBeUndefined();
  });
});
