import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, openPreferences, switchPreferencesTab } from '../helpers';

/**
 * #145+ — license email binding + 7-day liveness, end-to-end in the plugin UI.
 *
 * Launches with a PRO license BOUND to the test account email (sffsw323@actuna.pl),
 * which the synthetic e2e config provisions as a LIVE account (syncState='ok',
 * authedAt=now). The plugin must therefore UNLOCK the PRO section (binding +
 * liveness both pass) and surface the bound email as "PRO active".
 *
 * The negative paths (email not configured → locked; stale > 7 days → suspended)
 * are covered by the plugin unit tests (license-binding.test.mjs).
 */

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

/** Read the registered Preferences tab ids from the main window. */
async function preferenceTabIds(
  app: ElectronApplication
): Promise<string[] | null> {
  return app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      return win.webContents
        .executeJavaScript(
          `(function(){
             var store = require('actunamail-exports').PreferencesUIStore;
             var tabs = store && store.tabs ? store.tabs() : [];
             return tabs.map(function(t){ return t.tabId; });
           })();`
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
  // The plugin is not syncInit → it registers its tab ~2.5s after the window
  // opens. Switching to an unregistered tab leaves preferences with a null tab
  // (preferences-root → ConfigPropContainer.cloneElement(null) crash), so wait.
  await expect
    .poll(() => preferenceTabIds(electronApp), { timeout: 15_000 })
    .toContain('ActunaAI');
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test('PRO unlocks when the licensed email is a configured, live account (#145+)', async () => {
  await openPreferences(electronApp, mainWindow);
  await switchPreferencesTab(electronApp, mainWindow, 'ActunaAI');
  await mainWindow
    .locator('.actuna-ai-preferences')
    .waitFor({ state: 'attached', timeout: 10_000 });

  // Binding + liveness pass → the PRO section is UNLOCKED: the provider manager
  // renders (it only shows when entitled) and no section is locked.
  await expect(mainWindow.locator('.actuna-ai-providers')).toBeVisible({
    timeout: 15_000,
  });
  await expect(mainWindow.locator('.actuna-ai-pro-locked')).toHaveCount(0);
});

test('engine health shows the bound email as PRO active (#145+)', async () => {
  await openPreferences(electronApp, mainWindow);
  await switchPreferencesTab(electronApp, mainWindow, 'ActunaAI');
  await mainWindow
    .locator('.actuna-ai-preferences')
    .waitFor({ state: 'attached', timeout: 10_000 });
  await mainWindow.getByRole('button', { name: 'Check engine' }).click();

  const health = mainWindow.locator('.actuna-ai-health');
  await expect(health).toBeVisible({ timeout: 15_000 });
  await expect(health).toContainText('Licensed to');
  await expect(health).toContainText('sffsw323@actuna.pl');
  await expect(health).toContainText('PRO active');
});
