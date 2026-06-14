import { test, expect, ElectronApplication } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

/**
 * #197/#198 — the classify-proposal store (propose → accept → apply) is exposed
 * by the plugin (AppEnv.actunaAI.classifyProposalStore) and works in the REAL
 * bundled plugin. This validates the wiring the sidebar accept-card relies on,
 * deterministically (no mail fixture / focused thread needed — that visual path
 * is exercised by the unit tests + the sidebar render logic).
 */

let electronApp: ElectronApplication;
let configDir: string;

/** Run JS in the default renderer and return its value (null on failure). */
async function probe(app: ElectronApplication, js: string): Promise<any> {
  return app.evaluate(({ BrowserWindow }, code) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.getURL().includes('windowType%22%3A%22default')) continue;
      return win.webContents.executeJavaScript(code).catch(() => null);
    }
    return null;
  }, js);
}

test.beforeAll(async () => {
  ({ electronApp, configDir } = await launchApp({ installAIPlugin: true }));
  // The plugin activates ~2.5s after the window opens; it then exposes the store.
  await expect
    .poll(
      () =>
        probe(
          electronApp,
          `!!(window.AppEnv && AppEnv.actunaAI && AppEnv.actunaAI.classifyProposalStore)`,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test('classify-proposal store is exposed + functional in the deployed plugin (#197/#198)', async () => {
  const result = await probe(
    electronApp,
    `(function () {
       var s = AppEnv.actunaAI.classifyProposalStore;
       s.add({ id: 'e2e', threadId: 'TX', priority: 'high', tags: ['faktura'] });
       var pend = s.pendingForThread('TX');
       var first = pend[0] || {};
       // Snapshot BEFORE accept() — accept mutates the item object in place.
       var snap = {
         n: pend.length,
         priority: first.priority,
         tag: (first.tags || [])[0],
         status: first.status,
       };
       s.accept('e2e');
       snap.pendingAfterAccept = s.pendingForThread('TX').length;
       return snap;
     })()`,
  );
  expect(result).toEqual({
    n: 1,
    priority: 'high',
    tag: 'faktura',
    status: 'pending',
    pendingAfterAccept: 0,
  });
});
