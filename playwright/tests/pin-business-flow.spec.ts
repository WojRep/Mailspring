/**
 * E2E — biznesowy flow pinu (user 2026-05-31: "testy e2e, które będą pilnowały
 * biznesowy flow dla pin").
 *
 * Pilnuje semantyki biznesowej, nie tylko szwów technicznych:
 *   - na starcie wątek NIE jest ani przypięty, ani "focused",
 *   - po PRZYPIĘCIU staje się przypięty ORAZ automatycznie "focused"
 *     (reguła: pinned ⊆ focused — klasyfikator zalicza przypięte do ważnych),
 *   - po ODPIĘCIU znika z obu.
 *
 * Uwaga: pełny przepływ wizualny (na górze skrzynki, w folderze Pinned, badge
 * 📌, sync $Pinned na serwer) wymaga prawdziwych/zasianych wątków — pokrywa to
 * osobny realny e2e na koncie sffsw323@actuna.pl. Tu pilnujemy reguł biznesowych
 * na poziomie logiki w działającej aplikacji.
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

test.describe('Pin — business flow (pinned ⊆ focused)', () => {
  test('pin → marked pinned AND focused; unpin → cleared from both', async () => {
    // Poll for the priority-inbox plugin (exposes PinStore + classifyThread).
    let r: any = { ok: false };
    for (let i = 0; i < 25; i++) {
      r = await executeInRenderer(
        electronApp,
        `(function(){
          var api = window.AppEnv && window.AppEnv.priorityInbox;
          var PinStore = api && api.PinStore;
          var classify = api && api.classifyThread;
          if (!PinStore || typeof classify !== 'function') return { ok:false };

          var id = 'biz-flow-thread';
          var isFocused = function(){ return classify({ id: id }) === 'priority'; };

          PinStore.unpin(id);
          var start = { pinned: PinStore.isPinned(id), focused: isFocused() };

          PinStore.pin(id);
          var afterPin = { pinned: PinStore.isPinned(id), focused: isFocused() };

          PinStore.unpin(id);
          var afterUnpin = { pinned: PinStore.isPinned(id), focused: isFocused() };

          return { ok:true, start: start, afterPin: afterPin, afterUnpin: afterUnpin };
        })()`,
      );
      if (r.ok) break;
      await mainWindow.waitForTimeout(200);
    }

    expect(r.ok).toBe(true);

    // 1. start — neither
    expect(r.start.pinned).toBe(false);
    expect(r.start.focused).toBe(false);

    // 2. after pin — pinned AND automatically focused (pinned ⊆ focused)
    expect(r.afterPin.pinned).toBe(true);
    expect(r.afterPin.focused).toBe(true);

    // 3. after unpin — cleared from both
    expect(r.afterUnpin.pinned).toBe(false);
    expect(r.afterUnpin.focused).toBe(false);
  });
});
