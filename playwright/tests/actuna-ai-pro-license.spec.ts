import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  openPreferences,
  switchPreferencesTab,
} from '../helpers';

/**
 * #145 unblock + #155 PRO path. The engine runs with a dev-signed PRO license
 * (XDG_CONFIG_HOME → temp actuna-engine/license.json), so the tier is PRO:
 * the gated "PRO features" section unlocks and shows the provider manager.
 */

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

async function preferenceTabIds(app: ElectronApplication): Promise<string[] | null> {
  return app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.getURL().includes('windowType%22%3A%22default')) continue;
      return win.webContents
        .executeJavaScript(
          `(function(){var s=require('actunamail-exports').PreferencesUIStore;var t=s&&s.tabs?s.tabs():[];return t.map(function(x){return x.tabId;});})();`
        )
        .catch(() => null);
    }
    return null;
  });
}

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp({
    installAIPlugin: true,
    proLicense: true,
  }));
  // The plugin activates ~2.5s after the window opens — wait before driving UI.
  await expect
    .poll(() => preferenceTabIds(electronApp), { timeout: 15_000 })
    .toContain('ActunaAI');
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test('dev PRO license activates → engine health reports valid + pro (#145 unblock)', async () => {
  await openPreferences(electronApp, mainWindow);
  await switchPreferencesTab(electronApp, mainWindow, 'ActunaAI');
  await mainWindow
    .locator('.actuna-ai-preferences')
    .waitFor({ state: 'attached', timeout: 10_000 });

  await mainWindow.getByRole('button', { name: 'Check engine' }).click();
  const health = mainWindow.locator('.actuna-ai-health');
  await expect(health).toBeVisible({ timeout: 15_000 });
  await expect(health).toContainText('valid');
  await expect(health).toContainText('pro');
});

test('PRO tier unlocks the provider manager (locked teaser gone)', async () => {
  await openPreferences(electronApp, mainWindow);
  await switchPreferencesTab(electronApp, mainWindow, 'ActunaAI');
  await mainWindow
    .locator('.actuna-ai-preferences')
    .waitFor({ state: 'attached', timeout: 10_000 });

  // PRO → provider manager rendered, the BASIC locked teaser absent.
  await expect(mainWindow.locator('.actuna-ai-providers')).toBeVisible({
    timeout: 10_000,
  });
  await expect(mainWindow.locator('.actuna-ai-pro-locked')).toHaveCount(0);
});
