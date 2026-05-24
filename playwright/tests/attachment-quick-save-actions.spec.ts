import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, openPreferences, switchPreferencesTab, closePreferences } from '../helpers';

/**
 * Ticket #88 — Quick-save dropdown w widoku załącznika + Preferences
 * FavoriteFoldersSection.
 *
 * Test pokrywa:
 *   1. Runtime presence of Actions/Store handlers (smoke).
 *   2. Preferences > General > FavoriteFoldersSection renders (re-enabled
 *      po dodaniu openPreferences helper — wcześniej deferred bo
 *      menu click + IPC open-preferences były flaky w fresh-launch.
 *      Teraz pushSheet bezpośrednio przez window.$m.Actions w renderer).
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

test('AttachmentStore obsługuje akcje fetchAndSaveFileTo + fetchAndSaveAllFilesTo', async () => {
  // Weryfikacja przez DOM-side asercję: bootstrap window-bootstrap.ts
  // rejestruje store'y, więc po starcie app store ma 2 nowe handlery
  // wired przez listenTo. Sprawdzamy obecność funkcji w prototypie.
  const result = await electronApp.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      return win.webContents
        .executeJavaScript(
          `(function(){
             var s = require('actunamail-exports').AttachmentStore;
             return {
               hasFetchAndSaveFileTo: typeof s._fetchAndSaveFileTo === 'function',
               hasFetchAndSaveAllFilesTo: typeof s._fetchAndSaveAllFilesTo === 'function',
               hasResolveTarget: typeof s._resolvedTargetSaveDir === 'function',
             };
           })();`
        )
        .catch(() => null);
    }
    return null;
  });

  expect(result).not.toBeNull();
  expect(result.hasFetchAndSaveFileTo).toBe(true);
  expect(result.hasFetchAndSaveAllFilesTo).toBe(true);
  expect(result.hasResolveTarget).toBe(true);
});

test('Actions.fetchAndSaveFileTo + fetchAndSaveAllFilesTo są exportowane', async () => {
  const result = await electronApp.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      return win.webContents
        .executeJavaScript(
          `(function(){
             var A = require('actunamail-exports').Actions;
             return {
               hasFetchAndSaveFileTo: typeof A.fetchAndSaveFileTo === 'function',
               hasFetchAndSaveAllFilesTo: typeof A.fetchAndSaveAllFilesTo === 'function',
             };
           })();`
        )
        .catch(() => null);
    }
    return null;
  });

  expect(result).not.toBeNull();
  expect(result.hasFetchAndSaveFileTo).toBe(true);
  expect(result.hasFetchAndSaveAllFilesTo).toBe(true);
});

test('Preferences > General > FavoriteFoldersSection renderuje się', async () => {
  await openPreferences(electronApp, mainWindow);
  await switchPreferencesTab(electronApp, mainWindow, 'General');

  const section = mainWindow.locator('.favorite-folders-section').first();
  await expect(section).toBeAttached({ timeout: 10000 });

  // Przycisk "Add folder…" (entry point)
  const addBtn = section.locator('.favorite-folders-add').first();
  await expect(addBtn).toBeAttached();

  // Empty state przy default config (favoriteFolders: [])
  const emptyHint = section.locator('.favorite-folders-empty').first();
  await expect(emptyHint).toBeAttached();

  await closePreferences(electronApp);
});

