/**
 * E2E — Centrum dnia "Maile dnia" (decyzja 46 follow-up, user 2026-05-31:
 * "tutaj też nic nie działa ... nic nie można kliknąć").
 *
 * Dowodzi, że sekcja "Maile dnia" NIE jest już pustym szkieletem: po otwarciu
 * panelu ma obszar treści (lista dzisiejszych maili albo stan pusty) i daje się
 * zwijać/rozwijać. (Kalendarz/Zadania zostają puste — czekają na #31/#32.)
 */
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, executeInRenderer } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test.describe('Centrum dnia — Maile dnia', () => {
  test('opening the pane shows a Mails section WITH a content area (not an empty shell)', async () => {
    // Open the pane via the exposed store; poll for plugin activation.
    let opened = false;
    for (let i = 0; i < 25; i++) {
      const r = await executeInRenderer(
        electronApp,
        `(function(){
          var api = window.AppEnv && window.AppEnv.centrumDnia;
          if (!api || !api.Store) return { ok:false };
          api.Store.openPane();
          return { ok:true, open: api.Store.isPaneOpen() };
        })()`,
      );
      if (r.ok && r.open) {
        opened = true;
        break;
      }
      await mainWindow.waitForTimeout(200);
    }
    expect(opened).toBe(true);

    await expect(mainWindow.locator('.centrum-dnia-pane')).toBeVisible();

    // The Mails section renders a content area (empty-state or rows) — the thing
    // that did NOT exist before (section was just a header).
    const mailsContent = mainWindow.locator(
      '.centrum-dnia-section--mails .centrum-dnia-section-content'
    );
    await expect(mailsContent).toBeVisible();

    await mainWindow.screenshot({ path: 'playwright/test-results/centrum-dnia-mails.png' });
  });

  test('the Mails section header collapses and expands its content', async () => {
    const toggle = mainWindow.locator(
      '.centrum-dnia-section--mails .centrum-dnia-section-toggle'
    );
    const content = mainWindow.locator(
      '.centrum-dnia-section--mails .centrum-dnia-section-content'
    );
    await expect(toggle).toBeVisible();
    await expect(content).toBeVisible();

    await toggle.click();
    await mainWindow.waitForTimeout(300);
    await expect(content).toHaveCount(0); // collapsed

    await toggle.click();
    await mainWindow.waitForTimeout(300);
    await expect(content).toBeVisible(); // expanded
  });
});
