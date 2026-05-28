/**
 * Wave 1 Foundation UI e2e — bilet MVP #92, #93, #98 (UI implementation).
 *
 * DOM-only strategy z native Electron input injection (industry best practice
 * dla Atom-style custom keymap apps gdy window.eval jest blocked):
 *
 *  - Renderer eval (window.eval) ZABLOKOWANY przez app/static/index.js:2
 *    (security hardening) — `mainWindow.evaluate()` rzuca.
 *  - Browser keyboard events (`mainWindow.keyboard.press`) NIE triggera Atom
 *    keymap manager (potwierdzone empirycznie + komentarz w
 *    command-palette.spec.ts:84).
 *  - ROZWIĄZANIE: `electronApp.evaluate(...)` runs w MAIN process (Node side)
 *    który NIE ma window.eval block. Z main process injekcja native input
 *    events przez `webContents.sendInputEvent({type, keyCode, modifiers})` —
 *    Atom keymap matcher otrzymuje dokładnie takie same eventy jak z fizycznej
 *    klawiatury. Standard Electron API używany przez Spectron, Cypress
 *    Electron, VS Code test harness.
 *
 *  - DOM assertions (locator + toBeVisible/toHaveAttribute/toHaveText)
 *    nadal pure DOM — bez state introspection (to pokrywa Jasmine).
 *  - Security: production renderer eval pozostaje zablokowany. Main process
 *    eval w testach to standard Playwright Electron API, niedostępne w prod.
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

// === Helpers (native Electron input injection) ==============================

/**
 * Inject keyboard shortcut do focused renderer window. Używa main-process
 * webContents.sendInputEvent — Atom keymap matcher otrzymuje normalny keydown.
 * Zero renderer eval; bypassuje window.eval security block.
 */
async function pressShortcut(
  app: ElectronApplication,
  key: string,
  modifiers: string[] = [],
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, { key, modifiers }) => {
    const wins = BrowserWindow.getAllWindows().filter((w: any) => !w.isDestroyed() && w.isVisible());
    const target = wins.find((w: any) => w.webContents && !w.webContents.isDestroyed());
    if (!target) throw new Error('No visible window found for input injection');
    target.webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
    target.webContents.sendInputEvent({ type: 'char', keyCode: key, modifiers });
    target.webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
  }, { key, modifiers });
}

async function openPalette(): Promise<void> {
  await pressShortcut(electronApp, 'k', ['cmd']);
  await expect(mainWindow.locator('.command-palette[role="dialog"]')).toBeVisible({ timeout: 3000 });
}

async function closePalette(): Promise<void> {
  await pressShortcut(electronApp, 'Escape');
  await expect(mainWindow.locator('.command-palette')).toBeHidden({ timeout: 2000 });
}

async function executeCommand(query: string): Promise<void> {
  await openPalette();
  await mainWindow.locator('.command-palette-input').fill(query);
  await mainWindow.waitForTimeout(150);
  await pressShortcut(electronApp, 'Return');
}

// === Tests ===================================================================

test.describe('Wave 1 Foundation UI — #92 + #93 + #98 (DOM + native input)', () => {

  // ─── #89 regression — Cmd+K palette ───────────────────────────────────────

  test('Cmd+K opens command palette (regression #89)', async () => {
    await openPalette();
    await expect(mainWindow.locator('.command-palette')).toHaveAttribute('aria-modal', 'true');
    await expect(mainWindow.locator('.command-palette-input')).toBeVisible();
    await closePalette();
  });

  // ─── #92 glass demo overlay ───────────────────────────────────────────────

  test('#92 — glass demo overlay opens via Cmd+K "translucency"', async () => {
    await executeCommand('translucency');

    const dialog = mainWindow.locator('.glass-demo-dialog[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-label', /.+/);

    await pressShortcut(electronApp, 'Escape');
    await expect(dialog).toBeHidden({ timeout: 2000 });
  });

  test('#92 — renders 3 intensity tiles (subtle/medium/strong)', async () => {
    await executeCommand('translucency');
    await expect(mainWindow.locator('.glass-demo-dialog')).toBeVisible();

    await expect(mainWindow.locator('.glass-demo-tile')).toHaveCount(3);
    await expect(mainWindow.locator('.glass-demo-tile--subtle')).toBeVisible();
    await expect(mainWindow.locator('.glass-demo-tile--medium')).toBeVisible();
    await expect(mainWindow.locator('.glass-demo-tile--strong')).toBeVisible();

    await pressShortcut(electronApp, 'Escape');
    await expect(mainWindow.locator('.glass-demo-dialog')).toBeHidden();
  });

  test('#92 — translucency checkbox jest interactive', async () => {
    await executeCommand('translucency');
    await expect(mainWindow.locator('.glass-demo-dialog')).toBeVisible();

    const checkbox = mainWindow.locator('.glass-demo-toggle input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeEnabled();

    await pressShortcut(electronApp, 'Escape');
    await expect(mainWindow.locator('.glass-demo-dialog')).toBeHidden();
  });

  test('#92 — close button ma aria-label + closes dialog', async () => {
    await executeCommand('translucency');
    const dialog = mainWindow.locator('.glass-demo-dialog');
    await expect(dialog).toBeVisible();

    const closeBtn = mainWindow.locator('.glass-demo-close');
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toHaveAttribute('aria-label', /.+/);
    await closeBtn.click();
    await expect(dialog).toBeHidden({ timeout: 2000 });
  });

  test('#92 — backdrop click closes dialog', async () => {
    await executeCommand('translucency');
    const dialog = mainWindow.locator('.glass-demo-dialog');
    await expect(dialog).toBeVisible();

    const backdrop = mainWindow.locator('.glass-demo-backdrop');
    await backdrop.click({ position: { x: 10, y: 10 } });
    await expect(dialog).toBeHidden({ timeout: 2000 });
  });

  // ─── #98 tag system — palette discoverability ─────────────────────────────

  test('#98 — "Otwórz tag picker" command obecny w Cmd+K', async () => {
    await openPalette();
    await mainWindow.locator('.command-palette-input').fill('tag picker');
    await mainWindow.waitForTimeout(150);

    const items = mainWindow.locator('.command-palette-item');
    expect(await items.count()).toBeGreaterThan(0);
    const firstText = await items.first().textContent();
    expect(firstText?.toLowerCase()).toContain('tag picker');

    await closePalette();
  });

  test('#98 — "Zarządzaj tagami" command obecny w Cmd+K', async () => {
    await openPalette();
    await mainWindow.locator('.command-palette-input').fill('Zarządzaj tagami');
    await mainWindow.waitForTimeout(150);

    const items = mainWindow.locator('.command-palette-item');
    expect(await items.count()).toBeGreaterThan(0);
    const firstText = await items.first().textContent();
    expect(firstText?.toLowerCase()).toMatch(/manage tags|zarządzaj tagami/);

    await closePalette();
  });

  // ─── #93 pin — palette discoverability ────────────────────────────────────

  test('#93 — "Pin / Unpin focused thread" command obecny w Cmd+K', async () => {
    await openPalette();
    await mainWindow.locator('.command-palette-input').fill('Pin');
    await mainWindow.waitForTimeout(150);

    const items = mainWindow.locator('.command-palette-item');
    expect(await items.count()).toBeGreaterThan(0);
    const allTexts = await items.allTextContents();
    const hasPin = allTexts.some(t => /pin\b/i.test(t));
    expect(hasPin).toBe(true);

    await closePalette();
  });

  test('#93 — "Toggle Priority Inbox mode" command obecny w Cmd+K', async () => {
    await openPalette();
    await mainWindow.locator('.command-palette-input').fill('Priority Inbox');
    await mainWindow.waitForTimeout(150);

    const items = mainWindow.locator('.command-palette-item');
    expect(await items.count()).toBeGreaterThan(0);
    const firstText = await items.first().textContent();
    expect(firstText?.toLowerCase()).toContain('priority inbox');

    await closePalette();
  });

  // ─── #92 — discoverability via keyword search ─────────────────────────────

  test('#92 — palette command discoverable po "glass" lub "translucent"', async () => {
    for (const query of ['glass', 'translucent']) {
      await openPalette();
      await mainWindow.locator('.command-palette-input').fill(query);
      await mainWindow.waitForTimeout(150);

      const items = mainWindow.locator('.command-palette-item');
      expect(await items.count()).toBeGreaterThan(0);

      await closePalette();
    }
  });
});
