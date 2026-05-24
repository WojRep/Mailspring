import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

/**
 * Ticket #47 Tier A — Preferences > General > Attachments musi pokazywać
 * dropdown "Default save location for attachments" z 4 opcjami.
 *
 * Test sprawdza UI-level kontrakt:
 *   - po otwarciu Preferences > General widoczna sekcja Attachments
 *   - dropdown defaultSaveTarget istnieje
 *   - dropdown zawiera 4 opcje (downloads / documents / lastUsed / askEveryTime)
 *   - default selected: askEveryTime (zachowanie wsteczne)
 */

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test('Preferences > General > Attachments — dropdown defaultSaveTarget istnieje', async () => {
  // Otwórz Preferences przez main menu (cross-platform)
  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    function find(items: Electron.MenuItem[], cmd: string): Electron.MenuItem | null {
      for (const item of items) {
        if ((item as any).commandId !== undefined && (item as any).command === cmd) return item;
        if (item.submenu) {
          const f = find(item.submenu.items, cmd);
          if (f) return f;
        }
      }
      return null;
    }
    const items = menu?.items || [];
    // Fallback: walk menu and click anything with label including 'Preferences'
    function walk(list: Electron.MenuItem[]): Electron.MenuItem | null {
      for (const i of list) {
        if (i.label && /preferences|ustawienia/i.test(i.label)) return i;
        if (i.submenu) {
          const r = walk(i.submenu.items);
          if (r) return r;
        }
      }
      return null;
    }
    const pref = walk(items);
    pref?.click();
    return null;
  });

  // Czekaj aż okno preferencji wyświetli sekcję General
  const generalSection = mainWindow
    .locator('.preferences-tab-section, #select-list, [data-tab-id="General"]')
    .first();
  await generalSection.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});

  // Najszybsza asercja: select#core\.attachments\.defaultSaveTarget istnieje
  const selectLocator = mainWindow.locator('select#core\\.attachments\\.defaultSaveTarget');
  await expect(selectLocator).toBeAttached({ timeout: 10000 });

  // Sprawdź że ma 4 opcje z odpowiednimi wartościami
  const options = await selectLocator.locator('option').all();
  const values = await Promise.all(options.map((o) => o.getAttribute('value')));
  expect(values.sort()).toEqual(['askEveryTime', 'documents', 'downloads', 'lastUsed']);

  // Default value powinno być askEveryTime
  const currentValue = await selectLocator.inputValue();
  expect(currentValue).toBe('askEveryTime');
});
