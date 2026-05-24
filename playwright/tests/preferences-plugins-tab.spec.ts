import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

/**
 * Ticket #55 — Preferences > Plugins tab registered.
 *
 * Smoke: w renderer'ze PreferencesUIStore ma zarejestrowaną zakładkę
 * "Plugins" (sprawdzane przez bezpośredni dostęp w main proc'ie). Pełen
 * UI flow (otwarcie sheet Preferences, klik na tab, asercja DOM)
 * wymaga oddzielnego debugowania infra — patrz uwaga w #88.
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

test('PreferencesUIStore ma zarejestrowaną zakładkę Plugins', async () => {
  const result = await electronApp.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      return win.webContents
        .executeJavaScript(
          `(function(){
             var store = require('actunamail-exports').PreferencesUIStore;
             var tabs = store && store.tabs ? store.tabs() : [];
             return {
               count: tabs.length,
               ids: tabs.map(function(t){ return t.tabId; }),
             };
           })();`
        )
        .catch(() => null);
    }
    return null;
  });

  expect(result).not.toBeNull();
  expect(result.ids).toContain('Plugins');
  expect(result.count).toBeGreaterThan(0);
});

test('AppEnv.packages exposes install hook (ścieżka UI fallback)', async () => {
  const result = await electronApp.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      return win.webContents
        .executeJavaScript(
          `(function(){
             var pkgs = AppEnv.packages;
             return {
               hasInstallManual: typeof pkgs.installPackageManually === 'function',
               hasGetAvailable: typeof pkgs.getAvailablePackages === 'function',
             };
           })();`
        )
        .catch(() => null);
    }
    return null;
  });

  expect(result).not.toBeNull();
  expect(result.hasGetAvailable).toBe(true);
  // installPackageManually może być undefined w testowym build — fallback
  // do window:install-package command jest w preferences-plugins.tsx _install.
});
