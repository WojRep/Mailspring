import { ElectronApplication, Locator, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Database from 'better-sqlite3';

export const REPO_ROOT = path.resolve(__dirname, '..');
export const APP_ROOT = path.join(REPO_ROOT, 'app');

/**
 * Built actuna-ai plugin package (produced by
 * `node scripts/package-plugin.mjs` in the actunamail-ai submodule).
 */
export const AI_PLUGIN_DIST = path.resolve(
  REPO_ROOT,
  '..',
  'actunamail-ai',
  'dist-plugin',
  'actuna-ai',
);

/**
 * Copy the built actuna-ai plugin into a config dir's `packages/` folder so
 * the app discovers and activates it on launch (#223). Throws with a build
 * hint when the dist package is missing.
 */
export function installAIPlugin(configDir: string): void {
  if (!fs.existsSync(path.join(AI_PLUGIN_DIST, 'package.json'))) {
    throw new Error(
      `actuna-ai plugin not built at ${AI_PLUGIN_DIST}. ` +
        `Run \`node scripts/package-plugin.mjs\` in actunamail-ai/ first.`
    );
  }
  const dest = path.join(configDir, 'packages', 'actuna-ai');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(AI_PLUGIN_DIST, dest, { recursive: true });
}

/**
 * A PRO license token signed by the DEV vendor key (#145 unblock; same fixture as
 * the Rust test). Valid only against the dev build's embedded key. exp = 2100.
 */
const DEV_PRO_TOKEN =
  'eyJ0aWVyIjoicHJvIiwiZXhwIjo0MTAyNDQ0ODAwfQ.ZWrPv0x5wGpvY7sIgLxdi-7MsnEJ-0UIb7jS-ZoLWqzgm3LdBR8gdXP1GALe4wk0KNwXP44ARpXIl1-8ZK7uDQ';

/**
 * Create a temp XDG_CONFIG_HOME containing `actuna-engine/license.json` with a dev
 * PRO token, so the engine subprocess reports a valid PRO license (#156/#162 e2e).
 * Returns the XDG dir to pass via env.
 */
export function prepareProEngineConfig(extra?: {
  providers?: unknown;
}): string {
  const xdg = path.join(os.tmpdir(), `actuna-xdg-${Date.now()}`);
  const engDir = path.join(xdg, 'actuna-engine');
  fs.mkdirSync(engDir, { recursive: true });
  fs.writeFileSync(
    path.join(engDir, 'license.json'),
    JSON.stringify({ token: DEV_PRO_TOKEN })
  );
  if (extra?.providers) {
    fs.writeFileSync(
      path.join(engDir, 'providers.json'),
      JSON.stringify(extra.providers)
    );
  }
  return xdg;
}

/**
 * Source config directory with the golden database and encrypted credentials
 * (Foundry376 upstream maintainer's fixture — present TYLKO na ich maszynach).
 * Jeśli FIXTURE_DIR nie istnieje, używamy synthetic fallback config z
 * env-driven test account (patrz prepareTestConfigDir poniżej).
 */
const FIXTURE_DIR = '/Users/bengotow/Library/Application Support/ActunaMail-dev-building-for-playwright';
const FIXTURE_DB = path.join(FIXTURE_DIR, 'edgehill.db');

// ─── Env-driven test account ──────────────────────────────────────────────────
//
// Local-only `.env.test.local` (gitignored) overrides defaults. Format: KEY=value
// per line, # for comments. Hosts (mail.actuna.pl) are publicznie znane MX
// records — safe jako default w fallback config. Tylko PASSWORD jest secret
// (NEVER w repo); pure UI tests działają bez password bo mailsync subprocess
// nie auth'uje się — renderer init używa account jako placeholder dla
// AccountStore.accounts.length > 0 gate.

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const _envFile = loadEnvFile(path.join(__dirname, '.env.test.local'));
function envValue(key: string, fallback: string): string {
  return process.env[key] || _envFile[key] || fallback;
}

export const TEST_ACCOUNT = {
  email: envValue('TEST_ACCOUNT_EMAIL', 'sffsw323@actuna.pl'),
  password: envValue('TEST_ACCOUNT_PASSWORD', ''),
  provider: envValue('TEST_ACCOUNT_PROVIDER', 'imap'),
  imapHost: envValue('TEST_IMAP_HOST', 'mail.actuna.pl'),
  imapPort: parseInt(envValue('TEST_IMAP_PORT', '993'), 10),
  smtpHost: envValue('TEST_SMTP_HOST', 'mail.actuna.pl'),
  smtpPort: parseInt(envValue('TEST_SMTP_PORT', '465'), 10),
};

// ─── Config & Launch ───────────────────────────────────────────────────────

/**
 * Create a config directory with a config.json and a copy of the
 * golden database so the app launches with real data.
 */
export function prepareTestConfigDir(): string {
  const dir = path.join(os.tmpdir(), `actunamail-e2e-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });

  const sourceConfigPath = path.join(FIXTURE_DIR, 'config.json');

  // Copy the entire source config.json, then override specific keys.
  // This preserves the encrypted credentials blob (needed for mailsync
  // task processing) while letting us control workspace mode, keymap, etc.
  // We clear the identity to prevent the "Please sign in" keychain dialog.
  let config: any;
  if (fs.existsSync(sourceConfigPath)) {
    config = JSON.parse(fs.readFileSync(sourceConfigPath, 'utf-8'));
    config['*'].core = {
      ...config['*'].core,
      themes: ['ui-light'],
      disabledPackages: [
        'message-view-on-github',
        'personal-level-indicators',
        'phishing-detection',
        'nylas-private-salesforce',
        'keybase',
        'composer-markdown',
        'composer-scheduler',
        'composer-mail-merge',
      ],
      workspace: { mode: 'split' },
      keymapTemplate: 'Gmail',
    };
    delete config['*'].identity;
  } else {
    config = {
      '*': {
        env: 'production',
        core: {
          themes: ['ui-light'],
          disabledPackages: [
            'message-view-on-github',
            'personal-level-indicators',
            'phishing-detection',
            'nylas-private-salesforce',
            'keybase',
            'composer-markdown',
            'composer-scheduler',
            'composer-mail-merge',
          ],
          workspace: { mode: 'split' },
          keymapTemplate: 'Gmail',
        },
        accounts: [
          {
            id: 'e2e-test-account',
            metadata: [],
            name: 'E2E Test Account',
            provider: TEST_ACCOUNT.provider,
            emailAddress: TEST_ACCOUNT.email,
            settings: {
              imap_host: TEST_ACCOUNT.imapHost,
              imap_port: TEST_ACCOUNT.imapPort,
              imap_username: TEST_ACCOUNT.email,
              imap_security: 'SSL / TLS',
              imap_allow_insecure_ssl: false,
              smtp_host: TEST_ACCOUNT.smtpHost,
              smtp_port: TEST_ACCOUNT.smtpPort,
              smtp_username: TEST_ACCOUNT.email,
              smtp_security: 'SSL / TLS',
              smtp_allow_insecure_ssl: false,
              container_folder: '',
            },
            label: TEST_ACCOUNT.email,
            autoaddress: { type: 'bcc', value: '' },
            aliases: [],
            syncState: 'ok',
            authedAt: Math.floor(Date.now() / 1000),
            color: '',
            __cls: 'Account',
          },
        ],
        accountsVersion: 2,
        containerFolderDefault: '',
      },
    };
  }

  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));

  // Copy the golden database
  if (fs.existsSync(FIXTURE_DB)) {
    fs.copyFileSync(FIXTURE_DB, path.join(dir, 'actunamail.db'));
  }

  return dir;
}

function isMainWindow(page: Page): boolean {
  try {
    const url = new URL(page.url());
    const loadSettings = url.searchParams.get('loadSettings');
    if (!loadSettings) return false;
    const settings = JSON.parse(decodeURIComponent(loadSettings));
    return settings.windowType === 'default';
  } catch {
    return false;
  }
}

export async function waitForMainWindow(
  electronApp: ElectronApplication,
  timeoutMs = 30_000
): Promise<Page> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const page of electronApp.windows()) {
      if (isMainWindow(page)) {
        try {
          await page.locator('.item-compose').waitFor({ timeout: 2_000 });
          return page;
        } catch {
          // Still loading
        }
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for main window. ` +
      `Found ${electronApp.windows().length} window(s).`
  );
}

export async function launchApp(
  opts: { installAIPlugin?: boolean; proLicense?: boolean } = {}
): Promise<{
  electronApp: ElectronApplication;
  mainWindow: Page;
  configDir: string;
}> {
  const configDir = prepareTestConfigDir();
  if (opts.installAIPlugin) installAIPlugin(configDir);
  // Redirect the engine's config dir (XDG_CONFIG_HOME) to a temp dir carrying a
  // dev PRO license, so the engine reports tier=pro (unlocks PRO UI / providers).
  const engineEnv: Record<string, string> = {};
  if (opts.proLicense) engineEnv.XDG_CONFIG_HOME = prepareProEngineConfig();
  // Forward renderer console.error + uncaught pageerrors do test stdout — bardzo
  // pomocne dla diagnozowania plugin activation failures i React crashes.
  const setupDiag = (page: Page, label: string) => {
    page.on('console', m => {
      if (m.type() === 'error') {
        // eslint-disable-next-line no-console
        console.log(`[${label} console.error] ${m.text().slice(0, 300)}`);
      }
    });
    page.on('pageerror', err => {
      // eslint-disable-next-line no-console
      console.log(`[${label} PAGEERROR] ${err.message.slice(0, 300)}`);
    });
  };
  // ELECTRON_RUN_AS_NODE=1 (set by some automation shells, e.g. Claude Code)
  // forces electron to start as plain Node, which then rejects Playwright's
  // injected `--remote-debugging-port=0` / `--inspect=0` flags. Strip it
  // before spawning so the test always launches the full Electron runtime.
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const electronApp = await electron.launch({
    // --lang=en pins the renderer locale to English so assertions on
    // user-facing strings ("Compose new message", "Sync now", …) are
    // deterministic regardless of the host system locale (matches the
    // jasmine `npm test` script setup).
    args: [APP_ROOT, '--enable-logging', '--dev', '--lang=en', '--config-dir-path', configDir],
    env: { ...cleanEnv, PLAYWRIGHT: '1', ...engineEnv },
    timeout: 30_000,
  });

  electronApp.on('window', (page: Page) => {
    setupDiag(page, `win-${electronApp.windows().length}`);
  });
  for (const w of electronApp.windows()) {
    setupDiag(w, 'win-existing');
  }

  const mainWindow = await waitForMainWindow(electronApp);

  // Auto-dismiss native Electron dialogs (sync error, credential issues, etc.)
  // so they don't block the renderer during tests. Must run after the main
  // window is ready to avoid "context destroyed" errors during init.
  try {
    await electronApp.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 0;
      dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
      dialog.showErrorBox = () => {};
    });
  } catch {
    // If main process context isn't available, fall back to no-op
  }

  // Auto-dismiss any JavaScript dialogs (alert, confirm, prompt) that
  // Playwright detects, preventing "No dialog is showing" protocol errors.
  mainWindow.on('dialog', dialog => dialog.dismiss().catch(() => {}));

  return { electronApp, mainWindow, configDir };
}

export async function closeApp(electronApp: ElectronApplication, configDir: string) {
  if (electronApp) {
    await electronApp.close();
    // Wait for OS to fully release the process and singleInstanceLock
    await new Promise(r => setTimeout(r, 3_000));
  }
  if (configDir && fs.existsSync(configDir)) {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}

// ─── Thread List Helpers ───────────────────────────────────────────────────

/** Get all thread list items */
export function threads(page: Page): Locator {
  return page.locator('.thread-list .list-item');
}

/** Click a thread to focus it */
export async function focusThread(page: Page, index = 0) {
  const thread = threads(page).nth(index);
  await thread.click();
  return thread;
}

/** Open a thread in the message list (click + wait for messages) */
export async function openThread(page: Page, index = 0) {
  await focusThread(page, index);
  await page.locator('#message-list').waitFor({ timeout: 5_000 });
}

/** Get the subject text of a thread */
export async function threadSubject(page: Page, index = 0): Promise<string> {
  return (await threads(page).nth(index).locator('.subject').textContent()) || '';
}

/** Check if a thread's star icon shows starred state */
export async function isThreadStarred(page: Page, index = 0): Promise<boolean> {
  const icon = threads(page).nth(index).locator('.thread-icon');
  return (await icon.getAttribute('aria-pressed')) === 'true';
}

// ─── Sidebar Helpers ───────────────────────────────────────────────────────

/** Click a sidebar folder by name */
export async function clickSidebarFolder(page: Page, name: string) {
  await page.locator(`.account-sidebar .item .name:has-text("${name}")`).first().click();
}

// ─── Task Capture Helpers ─────────────────────────────────────────────
// Because the mailsync C++ process may not be running in the test env,
// tasks sent via Actions.queueTask may not reach the database. Instead,
// we intercept them at the Flux action layer in the renderer process.

/**
 * Execute JavaScript in the renderer via the main process's
 * webContents.executeJavaScript(), bypassing ActunaMail's
 * window.eval() security restriction.
 */
export async function executeInRenderer(electronApp: ElectronApplication, code: string): Promise<any> {
  return electronApp.evaluate(async ({ BrowserWindow }, js) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.getURL().includes('windowType%22%3A%22default')) {
        return await win.webContents.executeJavaScript(js);
      }
    }
    throw new Error('Main window not found');
  }, code);
}

// ─── Preferences Helpers ──────────────────────────────────────────────
//
// ActunaMail blocks window.eval() for security (`app/static/index.js:1`),
// so `mainWindow.evaluate(() => ...)` throws. Instead we drive
// preferences via `window.$m` (the global actunamail-exports facade,
// `app/src/global/actunamail-exports.js:7`) executed through
// `webContents.executeJavaScript`, which bypasses the eval guard.
//
// Tests previously tried main-process menu clicks (pref?.click()) or
// raw IPC (webContents.send('open-preferences')); both were flaky in
// fresh-launch state — Preferences sheet sometimes did not push. The
// renderer-side $m.Actions.openPreferences() call is deterministic
// because it directly mutates the WorkspaceStore sheet stack.

/**
 * Open the Preferences sheet in the main window and wait for the
 * Preferences root container to render. Deterministic — does not rely
 * on native menu clicks.
 */
export async function openPreferences(
  electronApp: ElectronApplication,
  mainWindow: Page
): Promise<void> {
  await executeInRenderer(
    electronApp,
    `(function(){
       var $m = window.$m;
       if (!$m || !$m.Actions || !$m.WorkspaceStore) {
         throw new Error('actunamail-exports ($m) not ready');
       }
       if ($m.WorkspaceStore.topSheet() !== $m.WorkspaceStore.Sheet.Preferences) {
         $m.Actions.pushSheet($m.WorkspaceStore.Sheet.Preferences);
       }
       return true;
     })();`
  );
  // Wait for the preferences root in DOM. The "key-commands-region
  // focused preferences-wrap" wrapper mounts when Sheet.Preferences
  // becomes top sheet and the registered PreferencesRoot component
  // renders (see internal_packages/preferences/lib/main.tsx).
  await mainWindow.locator('.preferences-wrap, .container-preference-tabs')
    .first()
    .waitFor({ state: 'attached', timeout: 10000 });
}

/**
 * Switch the active Preferences tab (General / Plugins / Accounts /
 * Storage / Security / etc.) and wait briefly for the tab content to
 * remount. Caller must have already openPreferences()'d.
 */
export async function switchPreferencesTab(
  electronApp: ElectronApplication,
  mainWindow: Page,
  tabId: string
): Promise<void> {
  await executeInRenderer(
    electronApp,
    `window.$m.Actions.switchPreferencesTab(${JSON.stringify(tabId)});`
  );
  await mainWindow.waitForTimeout(150); // allow remount + paint
}

/** Close the Preferences sheet (pop back to root). */
export async function closePreferences(electronApp: ElectronApplication): Promise<void> {
  await executeInRenderer(
    electronApp,
    `(function(){
       var $m = window.$m;
       if ($m && $m.Actions && $m.WorkspaceStore) {
         if ($m.WorkspaceStore.topSheet() === $m.WorkspaceStore.Sheet.Preferences) {
           $m.Actions.popSheet();
         }
       }
       return true;
     })();`
  );
}

/**
 * Install a listener on Actions.queueTask in the renderer to capture
 * tasks as they are created. Uses webContents.executeJavaScript() from
 * the main process to bypass ActunaMail's window.eval() restriction.
 * Task data is stored in a hidden DOM element readable via locators.
 */
export async function installTaskCapture(electronApp: ElectronApplication) {
  await executeInRenderer(electronApp, `
    (function() {
      var el = document.createElement('div');
      el.id = '__test-captured-tasks';
      el.style.display = 'none';
      el.setAttribute('data-tasks', '[]');
      document.body.appendChild(el);

      function captureTask(task) {
        var existing = JSON.parse(el.getAttribute('data-tasks') || '[]');
        existing.push({
          __cls: task.constructor.name,
          id: task.id,
          accountId: task.accountId,
          starred: task.starred,
          unread: task.unread,
          threadIds: task.threadIds,
          path: task.path,
          existingPath: task.existingPath,
          folder: task.folder ? { displayName: task.folder.displayName, role: task.folder.role } : undefined,
          labelsToAdd: task.labelsToAdd ? task.labelsToAdd.map(function(l) { return { displayName: l.displayName, role: l.role }; }) : undefined,
          labelsToRemove: task.labelsToRemove ? task.labelsToRemove.map(function(l) { return { displayName: l.displayName, role: l.role }; }) : undefined,
        });
        el.setAttribute('data-tasks', JSON.stringify(existing));
      }

      window.$m.Actions.queueTask.listen(captureTask);
      window.$m.Actions.queueTasks.listen(function(tasks) {
        if (tasks && tasks.length) { tasks.forEach(captureTask); }
      });
    })();
  `);
}

/** Get all captured tasks from the hidden DOM element */
export async function getCapturedTasks(page: Page): Promise<any[]> {
  const el = page.locator('#__test-captured-tasks');
  const json = await el.getAttribute('data-tasks');
  return JSON.parse(json || '[]');
}

/** Clear captured tasks */
export async function clearCapturedTasks(electronApp: ElectronApplication) {
  await executeInRenderer(
    electronApp,
    `document.getElementById('__test-captured-tasks').setAttribute('data-tasks', '[]')`
  );
}

/**
 * Wait for a captured task matching a predicate.
 * Polls the hidden DOM element's data-tasks attribute.
 */
export async function waitForCapturedTask(
  page: Page,
  matcher: (task: any) => boolean,
  timeoutMs = 10_000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tasks = await getCapturedTasks(page);
    const match = tasks.find(matcher);
    if (match) return match;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

// ─── Native Menu Intercept ────────────────────────────────────────────
// Electron context menus (via @electron/remote Menu) are native OS menus
// that Playwright cannot interact with. @electron/remote uses non-configurable
// getters and per-instance proxy methods, so neither the Menu constructor
// nor Menu.prototype.popup can be patched.
//
// Instead, we intercept the `contextmenu` DOM event in the capturing phase
// and walk the React fiber tree to find the OutlineViewItem component
// instance, then call its callback methods directly.

/**
 * Install the context menu interceptor. Call once per app launch.
 * After this, use triggerMenuAction() before a right-click to auto-trigger
 * a specific menu action (Rename, Delete, New Subfolder, etc.).
 */
export async function installMenuIntercept(electronApp: ElectronApplication) {
  await executeInRenderer(electronApp, `
    (function() {
      window.__menuAutoClick = null;

      document.addEventListener('contextmenu', function(event) {
        var label = window.__menuAutoClick;
        if (!label) return;

        window.__menuAutoClick = null;
        event.stopImmediatePropagation();
        event.preventDefault();

        // Find the closest treeitem
        var treeitem = event.target.closest('[role="treeitem"]');
        if (!treeitem) return;

        // Find the React fiber key
        var key = Object.keys(treeitem).find(function(k) {
          return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$');
        });
        if (!key) return;

        // Walk up the fiber tree to find OutlineViewItem component instance
        var current = treeitem[key];
        while (current) {
          var instance = current.stateNode;
          if (instance && typeof instance._onEdit === 'function') {
            if (label.indexOf('Rename') >= 0 || label.indexOf('rename') >= 0) {
              instance._onEdit();
            } else if (label.indexOf('Delete') >= 0 || label.indexOf('delete') >= 0) {
              instance._onDelete();
            } else if (label.indexOf('Subfolder') >= 0 || label.indexOf('Sublabel') >= 0) {
              instance._onCreateChildTriggered();
            }
            break;
          }
          current = current.return;
        }
      }, true);
    })();
  `);
}

/**
 * Set the menu intercept to auto-trigger a specific action on the next
 * right-click. Must be called BEFORE the right-click.
 *
 * Supported labels: "Rename", "Delete", "Subfolder", "Sublabel"
 */
export async function triggerMenuAction(electronApp: ElectronApplication, labelSubstring: string) {
  await executeInRenderer(
    electronApp,
    `window.__menuAutoClick = ${JSON.stringify(labelSubstring)};`
  );
}

// ─── Search Helpers ───────────────────────────────────────────────────

/** Clear the search bar by clicking the X button, then wait for inbox to reload */
export async function clearSearch(page: Page) {
  const clearBtn = page.locator('.thread-search-bar .search-accessory.clear');
  if ((await clearBtn.count()) > 0) {
    await clearBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(1_000);
}

// ─── Composer Helpers ──────────────────────────────────────────────────────

/** Find a composer across all windows, returns the Page that contains it */
export async function findComposer(
  electronApp: ElectronApplication,
  timeoutMs = 15_000
): Promise<Page | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const page of electronApp.windows()) {
      try {
        const count = await page.locator('.composer-inner-wrap').count();
        if (count > 0) return page;
      } catch {
        // page may be closing
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

/** Close any open composer popout windows */
export async function closeComposerWindows(electronApp: ElectronApplication) {
  for (const page of electronApp.windows()) {
    try {
      const url = new URL(page.url());
      const loadSettings = url.searchParams.get('loadSettings');
      if (loadSettings) {
        const settings = JSON.parse(decodeURIComponent(loadSettings));
        if (settings.windowType === 'composer') {
          await page.close();
        }
      }
    } catch {
      // ignore
    }
  }
}

// ─��─ SQLite Database Helpers ───────────────────────────────────────────────

/** Open the test database (read-only) */
export function openTestDB(configDir: string): Database.Database {
  const dbPath = path.join(configDir, 'actunamail.db');
  return new Database(dbPath, { readonly: true });
}

/** Query Task objects from the database */
export function queryTasks(configDir: string): any[] {
  const db = openTestDB(configDir);
  try {
    const rows = db.prepare('SELECT data FROM Task ORDER BY rowid DESC').all() as any[];
    return rows.map(r => JSON.parse(r.data));
  } finally {
    db.close();
  }
}

/**
 * Wait for a task matching a predicate to appear in the database.
 * Useful for verifying that UI actions create the expected tasks.
 */
export async function waitForTask(
  configDir: string,
  matcher: (task: any) => boolean,
  timeoutMs = 10_000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tasks = queryTasks(configDir);
    const match = tasks.find(matcher);
    if (match) return match;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

/** Count threads in the database */
export function countThreadsInDB(configDir: string): number {
  const db = openTestDB(configDir);
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM Thread').get() as any;
    return row.count;
  } finally {
    db.close();
  }
}
