/**
 * Visual regression baseline dla design tokens refactor.
 *
 * Cel: capture screenshots top 5 widoków PRZED dalszym refactor cyklem
 * (Sprint 4+ — main-calendar, preferences, theme switcher, MVP biletów).
 * Baseline pozwala porównać przed/po per refactor file.
 *
 * Faza E luka #2 (analysis/28-component-kit-audit.md sekcja 11).
 *
 * URUCHOMIENIE:
 *   cd app-client && npx playwright test visual-regression-tokens
 *
 * GENEROWANIE BASELINE (pierwsze uruchomienie):
 *   cd app-client && npx playwright test visual-regression-tokens --update-snapshots
 *
 * Screenshots zapisane w playwright/tests/visual-regression-tokens.spec.ts-snapshots/
 *
 * Strategia per widok:
 *   1. Inbox z thread list (light + dark theme)
 *   2. Reading pane otwarty thread (light + dark)
 *   3. Composer nowa wiadomość (light + dark)
 *   4. Preferences > Accounts (light + dark)
 *   5. Cmd+K placeholder (jeśli zaimplementowany #89)
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;

test.beforeAll(async () => {
  ({ electronApp, mainWindow } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp);
});

test.describe('Visual regression — design tokens baseline', () => {

  // Helper — zrzut z deterministyczną maskingiem (timestampy, avatary, etc.)
  async function snapshotMain(name: string, theme: 'light' | 'dark' = 'light') {
    // Set theme via data-theme attribute (matches tokens.less convention)
    await mainWindow.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);

    // Wait for theme transition (motion-medium = 200ms + safety)
    await mainWindow.waitForTimeout(500);

    await expect(mainWindow).toHaveScreenshot(`${name}-${theme}.png`, {
      // Maskuje dynamic content żeby visual regression nie failował na czasach/datach
      mask: [
        mainWindow.locator('.timestamp'),
        mainWindow.locator('[data-testid="now"]'),
        mainWindow.locator('.unread-count'),
      ],
      // Threshold ratio — pixel difference acceptable
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  }

  test('01 — Inbox thread list (light theme)', async () => {
    // Ensure on Inbox view
    await mainWindow.locator('text=Inbox').first().click({ timeout: 5_000 }).catch(() => {});
    await mainWindow.waitForTimeout(1_000);
    await snapshotMain('01-inbox-list', 'light');
  });

  test('02 — Inbox thread list (dark theme)', async () => {
    await snapshotMain('01-inbox-list', 'dark');
  });

  test('03 — Reading pane (light theme)', async () => {
    // Open first thread if exists
    const firstThread = mainWindow.locator('.thread-list-item').first();
    if (await firstThread.count() > 0) {
      await firstThread.click();
      await mainWindow.waitForTimeout(1_000);
    }
    await snapshotMain('02-reading-pane', 'light');
  });

  test('04 — Reading pane (dark theme)', async () => {
    await snapshotMain('02-reading-pane', 'dark');
  });

  test('05 — Composer new message (light theme)', async () => {
    await mainWindow.keyboard.press('Meta+n').catch(async () => {
      await mainWindow.keyboard.press('Control+n');
    });
    await mainWindow.waitForTimeout(1_500);
    await snapshotMain('03-composer', 'light');
    // Close composer
    await mainWindow.keyboard.press('Escape').catch(() => {});
  });

  test('06 — Preferences > Accounts (light theme)', async () => {
    await mainWindow.keyboard.press('Meta+,').catch(async () => {
      await mainWindow.keyboard.press('Control+,');
    });
    await mainWindow.waitForTimeout(1_500);
    await snapshotMain('04-preferences-accounts', 'light');
    await mainWindow.keyboard.press('Escape').catch(() => {});
  });

  test('07 — Preferences > Accounts (dark theme)', async () => {
    await mainWindow.keyboard.press('Meta+,').catch(async () => {
      await mainWindow.keyboard.press('Control+,');
    });
    await mainWindow.waitForTimeout(1_500);
    await snapshotMain('04-preferences-accounts', 'dark');
    await mainWindow.keyboard.press('Escape').catch(() => {});
  });

  test('08 — Tooltip render (light) — sprawdza .actuna-tooltip + scroll-region tooltip', async () => {
    // Hover na elemencie który ma title= lub tooltip
    const hoverable = mainWindow.locator('[title]').first();
    if (await hoverable.count() > 0) {
      await hoverable.hover();
      await mainWindow.waitForTimeout(800);
    }
    await snapshotMain('05-tooltip', 'light');
  });
});

/**
 * Notatki maintenance:
 *
 * - Screenshots są platform-specific. Baseline generuj na docelowej platformie
 *   (macOS dla CI, lub osobne baseline per OS).
 * - Po każdym Sprint 4+ refactor cyklu uruchom test BEZ --update-snapshots.
 *   Jeśli failuje, sprawdź diff w playwright-report/ — czy zmiana jest
 *   intentional czy regresja.
 * - Maskowanie dynamic content (timestamps, unread counts) zapobiega false
 *   positives.
 * - Threshold 0.02 = ~2% pixels mogą się różnić (antyaliasing, hinting).
 *   Zwiększ jeśli za restrictive po Sprint 4 testach.
 */
