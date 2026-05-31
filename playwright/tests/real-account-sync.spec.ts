/**
 * E2E — realny sync konta testowego (user: "to konto testowe to ty tym
 * zarządzasz ... więc to zrób po prostu").
 *
 * Wstrzykuje zapisane hasło (`.env.test.local`, gitignored) do własnego magazynu
 * credentiali aplikacji (KeyManager) i relaunchuje klienta mailsync — tą samą
 * ścieżką co przycisk "Try Again". Dowodzi, że konto sffsw323@actuna.pl REALNIE
 * się uwierzytelnia i synchronizuje (foldery z serwera, brak błędu auth) — czyli
 * znika czerwony "Encountered an error while syncing".
 *
 * Wymaga sieci do mail.actuna.pl:993. Bez hasła (`.env.test.local`) — skip.
 */
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, executeInRenderer, TEST_ACCOUNT } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

const PW = TEST_ACCOUNT.password;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test.describe('Real account sync (sffsw323@actuna.pl)', () => {
  test('saved password authenticates the account and syncs folders (no auth error)', async () => {
    test.skip(!PW, 'no TEST_ACCOUNT_PASSWORD in playwright/.env.test.local — skipping real sync');

    // 1) Inject the saved password into the app's own credential store, then
    //    relaunch the mailsync client (same path as the "Try Again" button).
    const injected = await executeInRenderer(
      electronApp,
      `(function(){
        var $m = window.$m;
        var KeyManager = $m.KeyManager;
        var acct = $m.AccountStore.accounts()[0];
        if (!acct) return Promise.resolve({ ok:false, reason:'no account' });
        var email = acct.emailAddress;
        var PW = ${JSON.stringify(PW)};
        return Promise.resolve()
          .then(function(){ return KeyManager.replacePassword(email + '-imap', PW); })
          .then(function(){ return KeyManager.replacePassword(email + '-smtp', PW); })
          .then(function(){
            window.AppEnv.mailsyncBridge.forceRelaunchClient(acct);
            return { ok:true, email: email };
          });
      })()`,
    );
    expect(injected.ok).toBe(true);

    // 2) Poll for real authentication: folders synced from the server + no auth
    //    error. Folder count > 0 is the definitive "real sync happened" signal
    //    (the placeholder account starts with none).
    let result: any = { folders: 0, err: 'init', state: '?' };
    let authFailed = false;
    for (let i = 0; i < 45; i++) {
      result = await executeInRenderer(
        electronApp,
        `(function(){
          var $m = window.$m;
          var acct = $m.AccountStore.accounts()[0];
          if (!acct) return { folders:0, err:'no-account', state:'no-account' };
          var cats = ($m.CategoryStore && $m.CategoryStore.categories) ? ($m.CategoryStore.categories(acct.id) || []) : [];
          var err = acct.syncError ? (acct.syncError.message || acct.syncError.error || JSON.stringify(acct.syncError).slice(0,140)) : null;
          return { folders: cats.length, err: err, state: acct.syncState };
        })()`,
      );
      if (result.folders > 0) break;
      if (result.err && /auth|credential|password|login|INVALID/i.test(String(result.err))) {
        authFailed = true;
        break;
      }
      await mainWindow.waitForTimeout(2000);
    }
    // eslint-disable-next-line no-console
    console.log('REAL_SYNC', JSON.stringify(result));

    expect(authFailed).toBe(false);
    expect(result.folders).toBeGreaterThan(0);
  });

  test('seeded emails sync; server $Pinned surfaces as Thread.pinned (cross-device) + visual proof', async () => {
    test.skip(!PW, 'no TEST_ACCOUNT_PASSWORD — skipping real sync');

    // Ensure authenticated (idempotent re-inject + relaunch).
    await executeInRenderer(
      electronApp,
      `(function(){
        var $m = window.$m;
        var acct = $m.AccountStore.accounts()[0];
        var PW = ${JSON.stringify(PW)};
        return Promise.resolve()
          .then(function(){ return $m.KeyManager.replacePassword(acct.emailAddress + '-imap', PW); })
          .then(function(){ return $m.KeyManager.replacePassword(acct.emailAddress + '-smtp', PW); })
          .then(function(){ window.AppEnv.mailsyncBridge.forceRelaunchClient(acct); return true; });
      })()`,
    );

    // Poll until the seeded INBOX messages have synced into the local DB.
    let stats: any = { threads: 0, pinned: 0 };
    for (let i = 0; i < 60; i++) {
      stats = await executeInRenderer(
        electronApp,
        `(function(){
          var $m = window.$m;
          return Promise.all([
            $m.DatabaseStore.findAll($m.Thread),
            $m.DatabaseStore.findAll($m.Thread).where($m.Thread.attributes.pinned.equal(true)),
            $m.DatabaseStore.findAll($m.Thread).where($m.Thread.attributes.starred.equal(true)),
          ]).then(function(r){
            return { threads: r[0].length, pinned: r[1].length, starred: r[2].length };
          });
        })()`,
      );
      if (stats.threads >= 7 && stats.pinned >= 1) break;
      await mainWindow.waitForTimeout(2000);
    }
    // eslint-disable-next-line no-console
    console.log('SEEDED_SYNC', JSON.stringify(stats));

    // Cross-device proof: the $Pinned keyword set on the SERVER (by the seed
    // script) was read by mailsync into Thread.pinned — i.e. a pin made
    // elsewhere shows up here.
    expect(stats.threads).toBeGreaterThanOrEqual(7);
    expect(stats.pinned).toBeGreaterThanOrEqual(1);
    expect(stats.starred).toBeGreaterThanOrEqual(1);

    // Visual proof — screenshots of the running app on real data.
    await mainWindow.waitForTimeout(1500);
    await mainWindow.screenshot({ path: 'playwright/test-results/real-01-inbox.png' });

    await mainWindow.locator('.account-sidebar .item .name:has-text("Pinned")').first().click();
    await mainWindow.waitForTimeout(1200);
    await mainWindow.screenshot({ path: 'playwright/test-results/real-02-pinned.png' });

    await mainWindow.locator('.account-sidebar .item .name:has-text("Focused")').first().click();
    await mainWindow.waitForTimeout(1200);
    await mainWindow.screenshot({ path: 'playwright/test-results/real-03-focused.png' });

    await executeInRenderer(
      electronApp,
      `(function(){
        var api = window.AppEnv && window.AppEnv.centrumDnia;
        if (api && api.Store) api.Store.openPane();
        return true;
      })()`,
    );
    await mainWindow.waitForTimeout(1500);
    await mainWindow.screenshot({ path: 'playwright/test-results/real-04-centrum-dnia.png' });
  });
});
