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
});
