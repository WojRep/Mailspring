import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  launchApp,
  closeApp,
  openPreferences,
  switchPreferencesTab,
} from '../helpers';

/**
 * Ticket #223 (+ #144 verification) — actuna-ai plugin loaded into the app on
 * the Rust engine, and the PRO-tier gated Preferences section.
 *
 * The plugin (with the bundled Rust engine binary) is installed into the e2e
 * config's packages/ dir before launch. In the default BASIC tier (no PRO
 * license) the "PRO features" Preferences section must render disabled
 * (`.actuna-ai-pro-locked`) with a "PRO" badge (#144).
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
  }));
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test('actuna-ai plugin activates and registers the ActunaAI preferences tab', async () => {
  // The plugin is not syncInit → package-manager activates it ~2.5s after the
  // window opens (setTimeout in activatePackages). Poll until it registers.
  await expect
    .poll(() => preferenceTabIds(electronApp), { timeout: 15_000 })
    .toContain('ActunaAI');
});

test('Preferences → Actuna AI: PRO section is gated (locked + PRO badge) in BASIC tier', async () => {
  await openPreferences(electronApp, mainWindow);
  await switchPreferencesTab(electronApp, mainWindow, 'ActunaAI');

  // The Actuna AI preferences pane mounted.
  await mainWindow
    .locator('.actuna-ai-preferences')
    .waitFor({ state: 'attached', timeout: 10_000 });

  // BASIC tier → the PRO features section is locked (grayed) with a PRO badge.
  await expect(mainWindow.locator('.actuna-ai-pro-locked').first()).toBeVisible();
  await expect(
    mainWindow.locator('.actuna-ai-pro-badge').first()
  ).toContainText('PRO');
});

test('Actuna AI engine health resolves through the bundled Rust engine (cutover #141)', async () => {
  await openPreferences(electronApp, mainWindow);
  await switchPreferencesTab(electronApp, mainWindow, 'ActunaAI');
  await mainWindow
    .locator('.actuna-ai-preferences')
    .waitFor({ state: 'attached', timeout: 10_000 });

  // Re-trigger the health check deterministically (also runs on mount).
  await mainWindow.getByRole('button', { name: 'Check engine' }).click();

  // The bundled Rust engine (engine/actuna-runtime-<os>-<arch>) answers health
  // via the plugin's engine-client → HealthResponse rendered with engine_version.
  const health = mainWindow.locator('.actuna-ai-health');
  await expect(health).toBeVisible({ timeout: 15_000 });
  await expect(health).toContainText('Engine version');
  await expect(health).toContainText('0.1.0');
});

test('Actuna AI: activating a forged license key is rejected (fail-closed #147)', async () => {
  await openPreferences(electronApp, mainWindow);
  await switchPreferencesTab(electronApp, mainWindow, 'ActunaAI');
  await mainWindow
    .locator('.actuna-ai-preferences')
    .waitFor({ state: 'attached', timeout: 10_000 });

  // A forged token is rejected by the embedded vendor key → activation error,
  // nothing persisted (the engine verifies before writing license.json).
  await mainWindow.getByPlaceholder('actuna-pro-…').fill('bogus.token');
  await mainWindow.getByRole('button', { name: 'Activate' }).click();

  await expect(mainWindow.locator('.actuna-ai-error').first()).toBeVisible({
    timeout: 15_000,
  });
});
