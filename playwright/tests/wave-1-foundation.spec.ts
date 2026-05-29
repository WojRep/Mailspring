/**
 * Wave 1 Foundation UI e2e — bilet MVP #92, #93, #98 (UI implementation).
 *
 * Test strategy (industry best practice dla Atom-style custom keymap Electron
 * apps z window.eval security block):
 *
 *  - Renderer page.evaluate / window.eval ZABLOKOWANE przez app/static/index.js:2
 *    (security hardening) — `mainWindow.evaluate(() => ...)` rzuca.
 *  - Browser keyboard events (`mainWindow.keyboard.press('Meta+K')`) NIE
 *    triggera Atom keymap manager reliably (CDP Input.dispatchKeyEvent nie
 *    przechodzi przez mousetrap document listener — potwierdzone empirycznie +
 *    komentarz w command-palette.spec.ts:84).
 *  - ROZWIĄZANIE: `executeInRenderer(electronApp, code)` w helpers.ts używa
 *    `webContents.executeJavaScript()` z MAIN procesu — to bypassuje renderer
 *    window.eval block (Electron API niedostępne w prod). Komendy palette i
 *    direct DOM clicks na items zastępują keyboard-based shortcut dispatch.
 *  - Keymap registration (mod+k → command-palette:toggle) sprawdzona osobno
 *    przez introspekcję keymap manager bindings — to coverage dla regression
 *    #89 keybinding gate bez podatności na CDP keyboard delivery flake.
 *  - DOM assertions (locator + toBeVisible/toHaveAttribute/toHaveText)
 *    pure DOM — bez state introspection (to pokrywa Jasmine unit suite).
 *  - Security: production renderer eval pozostaje zablokowany. Main process
 *    eval w testach to standard Playwright Electron API.
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, executeInRenderer } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
  // Non-syncInit plugins activate via a 2.5s setTimeout in
  // PackageManager.activatePackages — wait long enough for all our Wave 1
  // packages (command-palette, tag-system, priority-inbox-pin, actuna-glass)
  // to register their keymaps + commands + components.
  await mainWindow.waitForTimeout(4000);
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
  // Dispatch command directly via AppEnv.commands. Playwright's CDP keyboard
  // injection nie zawsze trafia w mousetrap (Atom-style keymap manager listens
  // na document keydown, ale CDP keyDown nie ma natural focus flow). Industry
  // pattern dla Electron + Atom keymap apps: dispatch command bezpośrednio.
  // Keymap registration coverage: see osobny "keymap registration" test poniżej.
  await executeInRenderer(electronApp, `window.AppEnv.commands.dispatch('command-palette:toggle');`);
  await expect(mainWindow.locator('.command-palette[role="dialog"]')).toBeVisible({ timeout: 3000 });
}

async function closePalette(): Promise<void> {
  await mainWindow.keyboard.press('Escape');
  await expect(mainWindow.locator('.command-palette')).toBeHidden({ timeout: 2000 });
}

/**
 * Open palette, type query (so filtering UX is exercised), then execute the
 * top-ranked match by clicking it (deterministic — bypasses CDP keyboard
 * Enter event which doesn't always reach React onKeyDown reliably in
 * Electron renderer).
 */
async function executeCommand(query: string): Promise<void> {
  await openPalette();
  await mainWindow.locator('.command-palette-input').fill(query);
  await mainWindow.waitForTimeout(200);
  const firstItem = mainWindow.locator('.command-palette-item').first();
  await expect(firstItem).toBeVisible({ timeout: 2000 });
  await firstItem.click();
}

// === Tests ===================================================================

test.describe('Wave 1 Foundation UI — #92 + #93 + #98 (DOM + native input)', () => {

  // ─── #89 regression — palette + keymap registration ──────────────────────

  test('command-palette:toggle opens dialog with focus + aria (regression #89)', async () => {
    await openPalette();
    await expect(mainWindow.locator('.command-palette')).toHaveAttribute('aria-modal', 'true');
    await expect(mainWindow.locator('.command-palette-input')).toBeVisible();
    await closePalette();
  });

  test('Cmd+K keymap binding registered for command-palette:toggle (regression #89)', async () => {
    // Verifies mod+k → command-palette:toggle binding is loaded into the keymap
    // manager. (Actual keyDown injection via CDP nie trafia mousetrap reliably —
    // patrz openPalette() helper comment. Tu tylko sprawdzamy registration, co i
    // tak jest tym co user widzi: keystroke z OS keyboard przejdzie przez
    // mousetrap normalnie poza CDP.)
    const bindings = await executeInRenderer(
      electronApp,
      `JSON.stringify(window.AppEnv.keymaps.getBindingsForCommand('command-palette:toggle'))`
    );
    expect(JSON.parse(bindings)).toContain('mod+k');
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
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // NOTE: allTextContents() runs through page.evaluate → window.eval (blocked
    // by ActunaMail security hardening). Iterate manually via textContent().
    let hasPin = false;
    for (let i = 0; i < count; i++) {
      const t = await items.nth(i).textContent();
      if (t && /pin\b/i.test(t)) { hasPin = true; break; }
    }
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
