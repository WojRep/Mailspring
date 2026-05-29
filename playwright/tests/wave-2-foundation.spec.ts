/**
 * Wave 2 Foundation UI e2e — bilet MVP #104 (Snooze picker UI).
 *
 * Test strategy: per Wave 1 pattern — executeInRenderer dispatch (window.eval
 * blocked), keymap registration introspection, DOM assertions.
 *
 * Pokrycie #104:
 *  - SnoozePicker dialog opens via AppEnv.snooze.UIBus.openPicker dispatch.
 *  - role="dialog" + aria-modal + aria-label.
 *  - 7 preset buttons rendered.
 *  - Preset click wywołuje SnoozeStore.snoozeByPreset + dialog closes.
 *  - Custom datetime toggle reveals input.
 *  - Escape closes dialog.
 *  - Cmd+Shift+H keymap binding registered (regression dla #104).
 *  - Cmd+K palette command 'snooze:picker' obecny.
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, executeInRenderer } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
  // Non-syncInit plugins activate via 2.5s setTimeout w PackageManager.
  await mainWindow.waitForTimeout(4000);
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

async function openSnoozePicker(threadId: string | null = 'e2e-thread-1'): Promise<void> {
  // Open picker via UIBus dispatch — NIE używamy _reset (clears listeners,
  // breaks React subscription mid-test). Unsnooze prior state na threadId
  // żeby test był deterministic.
  await executeInRenderer(
    electronApp,
    `(function(){
       var tid = ${JSON.stringify(threadId)};
       if (tid && window.AppEnv.snooze.Store.isSnoozed(tid)) {
         window.AppEnv.snooze.Store.unsnooze(tid);
       }
       window.AppEnv.snooze.UIBus.openPicker(tid);
       return true;
     })()`
  );
  await expect(mainWindow.locator('.snooze-picker[role="dialog"]')).toBeVisible({ timeout: 3000 });
}

async function closeSnoozePicker(): Promise<void> {
  await executeInRenderer(electronApp, `window.AppEnv.snooze.UIBus.closePicker();`);
  await expect(mainWindow.locator('.snooze-picker')).toBeHidden({ timeout: 2000 });
}

test.describe('Wave 2 Foundation UI — #104 SnoozePicker', () => {
  test('#104 — SnoozePicker dialog opens z aria-modal + aria-label', async () => {
    await openSnoozePicker();
    const dialog = mainWindow.locator('.snooze-picker[role="dialog"]');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-label', /snooze/i);
    await closeSnoozePicker();
  });

  test('#104 — renderuje 7 preset buttons', async () => {
    await openSnoozePicker();
    await expect(mainWindow.locator('.snooze-preset-btn')).toHaveCount(7);
    // Sprawdź obecność charakterystycznych labels (PL+EN combined)
    await expect(mainWindow.locator('[data-preset="tomorrow_morning"]')).toBeVisible();
    await expect(mainWindow.locator('[data-preset="next_week"]')).toBeVisible();
    await expect(mainWindow.locator('[data-preset="someday"]')).toBeVisible();
    await closeSnoozePicker();
  });

  test('#104 — click preset wywołuje SnoozeStore.snoozeByPreset + closes dialog', async () => {
    await openSnoozePicker('e2e-thread-preset');
    await mainWindow.locator('[data-preset="tomorrow_morning"]').click();
    await expect(mainWindow.locator('.snooze-picker')).toBeHidden({ timeout: 2000 });
    const isSnoozed = await executeInRenderer(
      electronApp,
      `window.AppEnv.snooze.Store.isSnoozed('e2e-thread-preset')`
    );
    expect(isSnoozed).toBe(true);
  });

  test('#104 — custom datetime toggle reveals input', async () => {
    await openSnoozePicker();
    const input = mainWindow.locator('.snooze-picker-custom-input');
    await expect(input).toHaveCount(0);
    await mainWindow.locator('.snooze-picker-custom-toggle').click();
    await expect(input).toBeVisible();
    await closeSnoozePicker();
  });

  test('#104 — close button (×) zamyka dialog', async () => {
    await openSnoozePicker();
    await mainWindow.locator('.snooze-picker-close').click();
    await expect(mainWindow.locator('.snooze-picker')).toBeHidden({ timeout: 2000 });
  });

  test('#104 — Escape key zamyka dialog', async () => {
    await openSnoozePicker();
    // CDP keyDown na dialog (focused via tabIndex={-1} + componentDidUpdate
    // setTimeout focus) — Escape handler na komponent React onKeyDown,
    // nie polega na mousetrap dispatch (działa cleanly w Playwright).
    await mainWindow.locator('.snooze-picker').focus();
    await mainWindow.keyboard.press('Escape');
    await expect(mainWindow.locator('.snooze-picker')).toBeHidden({ timeout: 2000 });
  });

  test('#104 — Cmd+Shift+H keymap binding zarejestrowany (regression)', async () => {
    const bindings = await executeInRenderer(
      electronApp,
      `JSON.stringify(window.AppEnv.keymaps.getBindingsForCommand('snooze:open-picker'))`
    );
    expect(JSON.parse(bindings)).toContain('mod+shift+h');
  });

  test('#104 — Cmd+Shift+U un-snooze keymap binding zarejestrowany', async () => {
    const bindings = await executeInRenderer(
      electronApp,
      `JSON.stringify(window.AppEnv.keymaps.getBindingsForCommand('snooze:unsnooze-now'))`
    );
    expect(JSON.parse(bindings)).toContain('mod+shift+u');
  });

  test('#104 — Cmd+K palette command "snooze" jest discoverable', async () => {
    // Open command palette + search po "snooze".
    await executeInRenderer(electronApp, `window.AppEnv.commands.dispatch('command-palette:toggle');`);
    await expect(mainWindow.locator('.command-palette[role="dialog"]')).toBeVisible({ timeout: 3000 });
    await mainWindow.locator('.command-palette-input').fill('snooze');
    await mainWindow.waitForTimeout(200);
    const items = mainWindow.locator('.command-palette-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // Powinien zawierać główny picker command + un-snooze + preset commands.
    const firstText = await items.first().textContent();
    expect(firstText?.toLowerCase()).toContain('snooze');
    await mainWindow.keyboard.press('Escape');
    await expect(mainWindow.locator('.command-palette')).toBeHidden({ timeout: 2000 });
  });
});
