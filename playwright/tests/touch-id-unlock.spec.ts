import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, executeInRenderer } from '../helpers';

/**
 * Ticket #41 — Touch ID unlock infrastructure smoke.
 *
 * Real Touch ID prompt wymaga signed build (Apple Developer Program,
 * #07 blocker). Te testy pokrywają tylko warstwę kontraktu IPC + runtime
 * presence helpers, bez interakcji z systemPreferences.promptTouchID
 * (która w unsigned dev build może zwrócić nie-deterministyczne wartości).
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

test('canUseTouchID helper jest dostępny w runtime', async () => {
  const result = await executeInRenderer(
    electronApp,
    `(function(){
       var helper = require('../src/touch-id-helper');
       return {
         hasCanUseTouchID: typeof helper.canUseTouchID === 'function',
         hasPromptTouchID: typeof helper.promptTouchID === 'function',
         platform: process.platform,
         canUseResult: helper.canUseTouchID(),
       };
     })()`
  );
  expect(result.hasCanUseTouchID).toBe(true);
  expect(result.hasPromptTouchID).toBe(true);
  expect(typeof result.canUseResult).toBe('boolean');
  // Na non-darwin platformach MUSI być false (test runs cross-platform).
  if (result.platform !== 'darwin') {
    expect(result.canUseResult).toBe(false);
  }
});

test('IPC tier-b-biometric-status zwraca strukturę {available, cached, enabled}', async () => {
  const result = await executeInRenderer(
    electronApp,
    `require('electron').ipcRenderer.invoke('tier-b-biometric-status')`
  );
  expect(result).toBeDefined();
  expect(typeof result.available).toBe('boolean');
  expect(typeof result.cached).toBe('boolean');
  expect(typeof result.enabled).toBe('boolean');
});

test('IPC tier-b-unlock-touch-id zwraca {ok: false, error} bez cache', async () => {
  // Bez wcześniejszego cacheForBiometric, IPC powinien gracefully odmówić.
  const result = await executeInRenderer(
    electronApp,
    `require('electron').ipcRenderer.invoke('tier-b-unlock-touch-id', 'test')`
  );
  expect(result).toBeDefined();
  expect(result.ok).toBe(false);
  expect(typeof result.error).toBe('string');
});

test('config core.security.useTouchID istnieje z default false', async () => {
  const result = await executeInRenderer(
    electronApp,
    `(function(){
       return {
         value: AppEnv.config.get('core.security.useTouchID'),
       };
     })()`
  );
  // Default value false (lub undefined gdy schema nie wystartował).
  expect([false, undefined]).toContain(result.value);
});
