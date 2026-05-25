import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

/**
 * Ticket #43d — long-tail Tooltip migrations e2e.
 *
 * Smoke check że Tooltip facade jest dostępny w renderer'ze i że
 * zmigrowane komponenty (ContactDetailToolbar, button-dropdown,
 * mail-important-icon) wciąż się ładują bez crash po refactorze.
 *
 * Full hover lifecycle pokryty przez tooltip.spec.ts (43b regression).
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

test('Tooltip facade jest exportowany przez actunamail-component-kit', async () => {
  const result = await electronApp.evaluate(async ({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      return win.webContents
        .executeJavaScript(
          `(function(){
             var kit = require('actunamail-component-kit');
             return {
               hasTooltip: typeof kit.Tooltip === 'function' || typeof kit.Tooltip === 'object',
             };
           })();`
        )
        .catch(() => null);
    }
    return null;
  });

  expect(result).not.toBeNull();
  expect(result.hasTooltip).toBe(true);
});

test('Main window renderuje się po #43d migration (button-dropdown smoke)', async () => {
  // SendActionButton używa ButtonDropdown w stopce compose'a.
  // Jeśli refactor ButtonDropdown wpłynął negatywnie, composer/draft list
  // bywałby crashed. Asercja: workspace renderuje normalnie.
  await expect(mainWindow.locator('.account-sidebar')).toBeVisible();
  await expect(mainWindow.locator('.thread-search-bar')).toBeVisible();
});
