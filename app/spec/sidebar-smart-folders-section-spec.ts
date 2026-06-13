/**
 * RED test (TDD step #1) — SidebarStore.smartFoldersSection() integration z #99.
 *
 * Wymóg (per plan v1.0 mockup design/mockups/01-app-shell.html linia 123:
 * `<div class="sidebar-section">Smart Folders</div>`): sidebar musi zawierać
 * sekcję "Smart Folders" listującą user-created smart folders z
 * SmartFolderStore (#99 backend). Każdy folder = sidebar item z name + count.
 *
 * Cycle:
 *  - RED: ten spec failuje bo SidebarStore nie ma smartFoldersSection() metody
 *  - GREEN: dodać metodę która agreguje SmartFolderStore.list() na ISidebarSection
 *  - REFACTOR: extract section builder gdy duplikacja z other sections
 *
 * Per user mandate 2026-05-30:
 *  "kontynuuj wszystkie punkty po kolei, automatycznie z wykorzystaniem podejscia TDD"
 *  "100% pokrycia testami e2e"
 *  "metodologia pracy agile z tdd i ddd"
 */

import SidebarStore from '../internal_packages/account-sidebar/lib/sidebar-store';

describe('SidebarStore — Smart Folders section integration (plan v1.0 mockup 01-app-shell.html)', () => {
  it('exposes smartFoldersSection() method', () => {
    expect(typeof (SidebarStore as any).smartFoldersSection).toBe('function');
  });

  it('smartFoldersSection() returns ISidebarSection z title + items array', () => {
    const section = (SidebarStore as any).smartFoldersSection();
    expect(section).toBeDefined();
    expect(typeof section.title).toBe('string');
    expect(section.title).toMatch(/smart folder/i);
    expect(Array.isArray(section.items)).toBe(true);
  });

  it('smartFoldersSection() reflektuje SmartFolderStore.list() — gdy 0 folderów → 0 items', () => {
    // Reset SmartFolderStore via Store._reset if available
    const sfMod = require('../internal_packages/smart-folder/lib/smart-folder-store');
    const Store = sfMod.SmartFolderStore;
    Store._reset();
    Store.init();
    const section = (SidebarStore as any).smartFoldersSection();
    expect(section.items.length).toBe(0);
  });

  it('smartFoldersSection() reflektuje SmartFolderStore.list() — gdy 2 foldery → 2 items', () => {
    const sfMod = require('../internal_packages/smart-folder/lib/smart-folder-store');
    const Store = sfMod.SmartFolderStore;
    Store._reset();
    Store.init();
    Store.create({ name: 'Klient X', match: 'all', rules: [] });
    Store.create({ name: 'Newsletter', match: 'any', rules: [] });
    const section = (SidebarStore as any).smartFoldersSection();
    expect(section.items.length).toBe(2);
    // Alphabetical sorting (zgodnie z SmartFolderStore.list())
    const names = section.items.map((i: any) => i.name);
    expect(names).toContain('Klient X');
    expect(names).toContain('Newsletter');
  });

  // Porządkowanie panelu: sekcja Smart Folders zwijalna (jak Tagi).
  it('jest zwijalna — onCollapseToggled (function) + collapsed (boolean)', () => {
    const section = (SidebarStore as any).smartFoldersSection();
    expect(typeof section.onCollapseToggled).toBe('function');
    expect(typeof section.collapsed).toBe('boolean');
  });

  it('collapsed odzwierciedla AppEnv.savedState.sidebarKeysCollapsed["Smart Folders"]', () => {
    AppEnv.savedState.sidebarKeysCollapsed['Smart Folders'] = true;
    expect((SidebarStore as any).smartFoldersSection().collapsed).toBe(true);
    delete AppEnv.savedState.sidebarKeysCollapsed['Smart Folders'];
  });
});

// Punkt 3 użytkownika: regułowy filtr w panelu. Pozycje Smart Folders były
// martwe (bez perspective/onSelect). Teraz każda = klikalny widok filtrowany
// regułami (snapshot ThreadIdListPerspective — wzorzec jak Tagi/Snoozed).
describe('SidebarStore — Smart Folders jako klikalny filtr regułowy (punkt 3)', () => {
  let Store: any;

  beforeEach(() => {
    const sfMod = require('../internal_packages/smart-folder/lib/smart-folder-store');
    Store = sfMod.SmartFolderStore;
    Store._reset();
    Store.init();
  });

  afterEach(() => {
    Store._reset();
  });

  it('pozycja niesie ThreadIdListPerspective (placeholder) + onSelect', () => {
    Store.create({ name: 'Klient X', match: 'all', rules: [] });
    const section = (SidebarStore as any).smartFoldersSection();
    const item = section.items[0];
    expect(item.perspective).toBeDefined();
    expect(item.perspective.constructor.name).toBe('ThreadIdListPerspective');
    expect(typeof item.onSelect).toBe('function');
  });

  it('klik filtruje okno wątków regułami i dispatchuje focusMailboxPerspective z dopasowanymi id', () => {
    Store.create({
      name: 'Od Jana',
      match: 'all',
      rules: [{ field: 'from', op: 'contains', value: 'jan@' }],
    });
    const exp = require('actunamail-exports');
    const { Actions, DatabaseStore } = exp;
    const sampleThreads = [
      { id: 'tA', subject: 'Hej', participants: [{ email: 'jan@firma.pl' }] },
      { id: 'tB', subject: 'Inne', participants: [{ email: 'ola@firma.pl' }] },
    ];
    spyOn(DatabaseStore, 'findAll').andReturn({
      limit: () => ({
        then: (cb: any) => {
          cb(sampleThreads);
          return Promise.resolve();
        },
      }),
    });
    spyOn(Actions, 'focusMailboxPerspective');

    const section = (SidebarStore as any).smartFoldersSection();
    const item = section.items[0];
    item.onSelect(item);

    expect(Actions.focusMailboxPerspective).toHaveBeenCalled();
    const persp = (Actions.focusMailboxPerspective as any).mostRecentCall.args[0];
    expect(persp.constructor.name).toBe('ThreadIdListPerspective');
    expect(persp.toJSON().threadIds).toEqual(['tA']);
  });
});
