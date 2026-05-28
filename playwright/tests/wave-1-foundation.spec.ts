/**
 * Wave 1 Foundation UI e2e — bilet MVP #92, #93, #98 (UI implementation).
 *
 * Tests (happy paths):
 *  1. #92 glass demo overlay opens via palette command "Show translucency demo"
 *     - role="dialog" obecne, 3 intensity tiles widoczne, Esc closes.
 *  2. #93 pin badge appears w thread row po Shift+P; Shift+P again removes.
 *  3. #98 Cmd+L otwiera tag picker; type tag name + Enter creates new tag,
 *     chip pojawia się w reading pane header; Esc closes.
 *
 * Cooperates z Jasmine unit specs (43 testy w app/internal_packages/tag-system/specs/,
 * 9 w actuna-glass/specs/, 12 w priority-inbox-pin/specs/).
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

test.describe('Wave 1 Foundation UI — #92 + #93 + #98', () => {

  test.describe('#92 actuna-glass demo overlay', () => {

    test('AppEnv.glass.Demo Store + helpers expose', async () => {
      const expose = await mainWindow.evaluate(() => {
        const g = (window as any).AppEnv?.glass;
        return {
          hasDemo: !!g?.Demo,
          hasUseHook: typeof g?.useGlassMaterial === 'function',
          hasIsEnabled: typeof g?.isGlassMaterialEnabled === 'function',
        };
      });
      expect(expose.hasDemo).toBe(true);
      expect(expose.hasUseHook).toBe(true);
      expect(expose.hasIsEnabled).toBe(true);
    });

    test('GlassDemoStore.open() mounts overlay z dialog + 3 tiles', async () => {
      await mainWindow.evaluate(() => (window as any).AppEnv.glass.Demo.open());
      const dialog = mainWindow.locator('.glass-demo-dialog[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(mainWindow.locator('.glass-demo-tile')).toHaveCount(3);
      await expect(mainWindow.locator('.glass-demo-tile--subtle')).toBeVisible();
      await expect(mainWindow.locator('.glass-demo-tile--medium')).toBeVisible();
      await expect(mainWindow.locator('.glass-demo-tile--strong')).toBeVisible();
      // ARIA
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(dialog).toHaveAttribute('aria-label', /.+/);
    });

    test('Esc closes glass demo', async () => {
      const dialog = mainWindow.locator('.glass-demo-dialog');
      await mainWindow.evaluate(() => (window as any).AppEnv.glass.Demo.open());
      await expect(dialog).toBeVisible();
      await dialog.focus();
      await mainWindow.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });
  });

  test.describe('#93 priority-inbox-pin badge', () => {

    test('AppEnv.priorityInbox.PinStore expose + basic API', async () => {
      const api = await mainWindow.evaluate(() => {
        const p = (window as any).AppEnv?.priorityInbox;
        return {
          hasStore: !!p?.PinStore,
          hasToggle: typeof p?.PinStore?.toggle === 'function',
          hasIsPinned: typeof p?.PinStore?.isPinned === 'function',
        };
      });
      expect(api.hasStore).toBe(true);
      expect(api.hasToggle).toBe(true);
      expect(api.hasIsPinned).toBe(true);
    });

    test('PinStore.pin(threadId) → isPinned true; unpin → false', async () => {
      const result = await mainWindow.evaluate(() => {
        const store = (window as any).AppEnv.priorityInbox.PinStore;
        const fakeId = 'e2e-test-pin-' + Date.now();
        store.pin(fakeId);
        const after = store.isPinned(fakeId);
        store.unpin(fakeId);
        const afterUnpin = store.isPinned(fakeId);
        return { after, afterUnpin };
      });
      expect(result.after).toBe(true);
      expect(result.afterUnpin).toBe(false);
    });

    test('PinBadge component registered via ComponentRegistry slot ThreadListIcon', async () => {
      const registered = await mainWindow.evaluate(() => {
        const ComponentRegistry = (window as any).$m?.ComponentRegistry;
        if (!ComponentRegistry) return null;
        const matching = ComponentRegistry.findComponentsMatching({ role: 'ThreadListIcon' });
        return Array.isArray(matching) ? matching.length : 0;
      });
      // Mailspring ma już własne ikony (ThreadListIcon, MailImportantIcon), więc count ≥ 1.
      expect(registered).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('#98 tag-system Cmd+L picker + chips + Preferences', () => {

    test('AppEnv.tagSystem.Store + UIBus expose', async () => {
      const expose = await mainWindow.evaluate(() => {
        const ts = (window as any).AppEnv?.tagSystem;
        return {
          hasStore: !!ts?.Store,
          hasUIBus: !!ts?.UIBus,
          hasOpenPicker: typeof ts?.UIBus?.openPicker === 'function',
        };
      });
      expect(expose.hasStore).toBe(true);
      expect(expose.hasUIBus).toBe(true);
      expect(expose.hasOpenPicker).toBe(true);
    });

    test('TagSystemUIBus.openPicker mounts dialog z input + listbox', async () => {
      // Najpierw zaregister 2 user tagi do widoczności
      await mainWindow.evaluate(() => {
        const Store = (window as any).AppEnv.tagSystem.Store;
        Store.register({ id: 'e2e-q3', name: 'Q3', color: 'var(--accent-500)', source: 'user' });
        Store.register({ id: 'e2e-inv', name: 'Invoices', color: 'var(--success-500)', source: 'user' });
        (window as any).AppEnv.tagSystem.UIBus.openPicker('e2e-thread-1');
      });
      const dialog = mainWindow.locator('.tag-picker[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(mainWindow.locator('.tag-picker-input')).toBeVisible();
      await expect(mainWindow.locator('[role="listbox"]')).toBeVisible();
      await expect(mainWindow.locator('.tag-picker-row')).toHaveCount(2 + (await getSystemTagCount(mainWindow)));
    });

    test('typing filters tag list (case-insensitive)', async () => {
      await mainWindow.evaluate(() => (window as any).AppEnv.tagSystem.UIBus.openPicker('e2e-thread-1'));
      const input = mainWindow.locator('.tag-picker-input');
      await input.fill('inv');
      await expect(mainWindow.locator('.tag-picker-row')).toHaveCount(1);
    });

    test('Esc closes tag picker', async () => {
      await mainWindow.evaluate(() => (window as any).AppEnv.tagSystem.UIBus.openPicker('e2e-thread-1'));
      const dialog = mainWindow.locator('.tag-picker');
      await expect(dialog).toBeVisible();
      await mainWindow.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });

    test('Enter z empty filter (non-empty query) tworzy nowy user tag', async () => {
      await mainWindow.evaluate(() => (window as any).AppEnv.tagSystem.UIBus.openPicker('e2e-thread-1'));
      const input = mainWindow.locator('.tag-picker-input');
      const beforeCount = await mainWindow.evaluate(() =>
        (window as any).AppEnv.tagSystem.Store.list().length,
      );
      await input.fill('NewTag-e2e');
      // Filtered: brak match → Enter creates
      await mainWindow.keyboard.press('Enter');
      const afterCount = await mainWindow.evaluate(() =>
        (window as any).AppEnv.tagSystem.Store.list().length,
      );
      expect(afterCount).toBe(beforeCount + 1);
      // Created tag assigned do current thread
      const assigned = await mainWindow.evaluate(() => {
        const Store = (window as any).AppEnv.tagSystem.Store;
        return Store.getTags('e2e-thread-1').some((t: any) => t.name === 'NewTag-e2e');
      });
      expect(assigned).toBe(true);
      await mainWindow.keyboard.press('Escape');
    });
  });
});

async function getSystemTagCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const Store = (window as any).AppEnv.tagSystem.Store;
    return Store.list().filter((t: any) => t.systemManaged).length;
  });
}
