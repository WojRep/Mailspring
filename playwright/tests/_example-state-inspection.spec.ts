import { test, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp } from '../helpers';

/**
 * Template — Playwright state inspection scaffold.
 *
 * Copy this file to a new name (drop the `_example-` prefix) and adapt
 * when you need to inspect what `window.$m` / WorkspaceStore / DOM look
 * like during a flow. The `_example-` prefix is a convention for
 * non-shipping debug helpers; checked in as a permanent reference.
 *
 * See `playwright/README.md` § "State inspection scaffold" for context.
 *
 * Pattern highlights:
 *   - electronApp.evaluate({ BrowserWindow }, …) walks all windows
 *     and filters by URL substring to find the main window.
 *   - webContents.executeJavaScript runs JS in renderer, bypassing the
 *     window.eval security guard (app/static/index.js:1).
 *   - The IIFE returns a serializable object — DOM nodes don't cross
 *     the IPC boundary, so capture strings / class names / lengths only.
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

test('Inspect $m + WorkspaceStore + Sheet keys (template)', async () => {
  const before = await electronApp.evaluate(async ({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      return win.webContents.executeJavaScript(`(function(){
        var $m = window.$m;
        return {
          hasMm: !!$m,
          hasActions: !!($m && $m.Actions),
          hasWorkspace: !!($m && $m.WorkspaceStore),
          sheetKeys: ($m && $m.WorkspaceStore && $m.WorkspaceStore.Sheet) ? Object.keys($m.WorkspaceStore.Sheet) : [],
          topSheet: ($m && $m.WorkspaceStore) ? ($m.WorkspaceStore.topSheet() && $m.WorkspaceStore.topSheet().id) : null,
          hasPushSheet: !!($m && $m.Actions && $m.Actions.pushSheet),
        };
      })()`);
    }
    return null;
  });
  console.log('BEFORE:', JSON.stringify(before, null, 2));

  await electronApp.evaluate(async ({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      await win.webContents.executeJavaScript(
        `window.$m.Actions.pushSheet(window.$m.WorkspaceStore.Sheet.Preferences);`
      );
    }
  });
  await mainWindow.waitForTimeout(2000);

  const after = await electronApp.evaluate(async ({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      const url = win.webContents.getURL();
      if (!url.includes('windowType%22%3A%22default')) continue;
      return win.webContents.executeJavaScript(`(function(){
        return {
          topSheetId: window.$m.WorkspaceStore.topSheet() && window.$m.WorkspaceStore.topSheet().id,
          hasPrefsCont: !!document.querySelector('.preferences-tab-container'),
          hasFavFolders: !!document.querySelector('.favorite-folders-section'),
          hasPrefRoot: !!document.querySelector('.preferences-root, .container-plugins, .preferences-general'),
          domSelectors: Array.from(document.querySelectorAll('[class*="preferenc" i]')).map(el => el.className).slice(0, 10),
          sheets: Array.from(document.querySelectorAll('[class*="sheet" i]')).map(el => el.className).slice(0, 5),
          bodyChildClasses: Array.from(document.body.children).map(c => c.className || c.tagName),
        };
      })()`);
    }
    return null;
  });
  console.log('AFTER:', JSON.stringify(after, null, 2));
});
