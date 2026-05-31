/**
 * E2E — Pin cross-device (decyzja plan_to_version_1.0/46).
 *
 * Weryfikuje integrację end-to-end w działającej aplikacji (renderer + DOM):
 *  - atrybut `Thread.pinned` (queryable, round-trip z keyworda IMAP `$Pinned`),
 *  - klasa ChangePinnedTask zarejestrowana, konstruowalna, undoable,
 *  - MailboxPerspective.forPinned → PinnedMailboxPerspective (query po pinned),
 *  - drag-to-pin / remove-from-list → ChangePinnedTask (sync write),
 *  - skrzynka odbiorcza sortuje przypięte na górę (order po `pinned`),
 *  - sidebar "Attention Layers": Focused/Pinned/Snoozed klikalne, Pinned otwiera
 *    PinnedMailboxPerspective (cross-device, nie lokalny cache),
 *  - PinStore: pin/unpin cache + importer migracji.
 *
 * Uwaga: pełny dowód cross-device (urządzenie A → B) wymaga zsynchronizowanego
 * konta na dwóch instancjach — tu weryfikujemy wszystkie szwy integracji, które
 * da się sprawdzić z jednym procesem.
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

test.describe('Pin cross-device (#46) — model + task', () => {
  test('Thread.pinned is a queryable attribute and round-trips', async () => {
    const r = await executeInRenderer(
      electronApp,
      `(function(){
        var $m = window.$m;
        var Thread = $m.Thread;
        var attr = Thread && Thread.attributes && Thread.attributes.pinned;
        var t = new Thread({ id: 'e2e-pin-1', pinned: true });
        return { hasAttr: !!attr, queryable: !!(attr && attr.queryable), roundTrip: t.pinned === true };
      })()`
    );
    expect(r.hasAttr).toBe(true);
    expect(r.queryable).toBe(true);
    expect(r.roundTrip).toBe(true);
  });

  test('ChangePinnedTask is registered, constructible, undoable', async () => {
    const r = await executeInRenderer(
      electronApp,
      `(function(){
        try {
          var $m = window.$m;
          var Cls = $m.ChangePinnedTask;
          if (typeof Cls !== 'function') return { ok: false, error: 'ChangePinnedTask not on $m' };
          var Thread = $m.Thread;
          var task = new Cls({ threads: [new Thread({ id: 'e2e-pt', accountId: 'a' })], pinned: true });
          var undo = task.createUndoTask();
          return { ok: true, name: task.constructor.name, pinned: task.pinned === true,
                   threadIds: JSON.stringify(task.threadIds), undoPinned: undo.pinned === false };
        } catch (e) { return { ok: false, error: String(e) }; }
      })()`
    );
    expect(r.error || null).toBeNull();
    expect(r.ok).toBe(true);
    expect(r.name).toBe('ChangePinnedTask');
    expect(r.pinned).toBe(true);
    expect(r.threadIds).toBe('["e2e-pt"]');
    expect(r.undoPinned).toBe(true);
  });
});

test.describe('Pin cross-device (#46) — perspective', () => {
  test('forPinned builds a PinnedMailboxPerspective querying the synced pinned column', async () => {
    const r = await executeInRenderer(
      electronApp,
      `(function(){
        try {
          var $m = window.$m;
          var MP = $m.MailboxPerspective;
          if (!MP || typeof MP.forPinned !== 'function') return { ok: false, error: 'forPinned missing' };
          var p = MP.forPinned(['e2e-test-account']);
          var sub = p.threads();
          var sql = '';
          try { sql = sub && sub._query && sub._query.sql ? sub._query.sql() : ''; } catch (e) {}
          var starred = MP.forStarred(['e2e-test-account']);
          return { ok: true, name: p.constructor.name, pinned: p.pinned === true, hasThreads: !!sub,
                   sqlMentionsPinned: typeof sql === 'string' && sql.toLowerCase().indexOf('pinned') >= 0,
                   notEqualStarred: p.isEqual ? p.isEqual(starred) === false : true };
        } catch (e) { return { ok: false, error: String(e) }; }
      })()`
    );
    expect(r.error || null).toBeNull();
    expect(r.ok).toBe(true);
    expect(r.name).toBe('PinnedMailboxPerspective');
    expect(r.pinned).toBe(true);
    expect(r.hasThreads).toBe(true);
    expect(r.sqlMentionsPinned).toBe(true);
    expect(r.notEqualStarred).toBe(true);
  });

  test('drag-into-Pinned and remove-from-Pinned produce ChangePinnedTask (sync write)', async () => {
    const r = await executeInRenderer(
      electronApp,
      `(function(){
        try {
          var $m = window.$m;
          var MP = $m.MailboxPerspective;
          var Thread = $m.Thread;
          var p = MP.forPinned(['e2e-test-account']);
          var threads = [new Thread({ id: 'e2e-drag', accountId: 'a' })];
          var addTask = p.actionsForReceivingThreads(threads, 'a');
          var rmTasks = p.tasksForRemovingItems(threads);
          return { ok: true,
                   addName: addTask && addTask.constructor.name, addPinned: addTask && addTask.pinned === true,
                   rmName: rmTasks && rmTasks[0] && rmTasks[0].constructor.name,
                   rmPinned: rmTasks && rmTasks[0] && rmTasks[0].pinned === false };
        } catch (e) { return { ok: false, error: String(e) }; }
      })()`
    );
    expect(r.error || null).toBeNull();
    expect(r.addName).toBe('ChangePinnedTask');
    expect(r.addPinned).toBe(true);
    expect(r.rmName).toBe('ChangePinnedTask');
    // remove-from-list dispatches an UNPIN (pinned === false)
    expect(r.rmPinned).toBe(true);
  });

  test('inbox perspective orders pinned threads to the top', async () => {
    // The placeholder test account has no synced inbox category, so fabricate an
    // inbox Folder to exercise CategoryMailboxPerspective.threads() ordering.
    const r = await executeInRenderer(
      electronApp,
      `(function(){
        try {
          var $m = window.$m;
          var MP = $m.MailboxPerspective;
          var Folder = $m.Folder;
          var f = new Folder({ id: 'e2e-inbox', role: 'inbox', path: 'INBOX', accountId: 'e2e-test-account' });
          var p = MP.forCategories([f]);
          var sub = p.threads();
          var q = sub && sub._query;
          var orders = (q && q._orders) || [];
          var orderKeys = orders.map(function(o){ return o && o.attr ? (o.attr.modelKey || o.attr.tableColumn) : null; });
          return { built: !!sub, isInbox: p.isInbox ? p.isInbox() : null, orderKeys: JSON.stringify(orderKeys) };
        } catch (e) { return { built: false, error: String(e) }; }
      })()`
    );
    expect(r.error || null).toBeNull();
    expect(r.built).toBe(true);
    expect(r.isInbox).toBe(true);
    expect(r.orderKeys).toContain('pinned');
  });
});

test.describe('Pin cross-device (#46) — store + sidebar', () => {
  test('PinStore cache toggles and exposes the migration importer', async () => {
    // The priority-inbox-pin plugin exposes AppEnv.priorityInbox during activate();
    // poll briefly in case activation has not completed yet.
    let r: any = { ok: false };
    for (let i = 0; i < 25; i++) {
      r = await executeInRenderer(
        electronApp,
        `(function(){
          var api = window.AppEnv && window.AppEnv.priorityInbox;
          if (!api || !api.PinStore) return { ok: false, reason: 'no priorityInbox', hasApi: !!api };
          var store = api.PinStore;
          var id = 'e2e-pin-toggle-46';
          store.unpin(id);
          var before = store.isPinned(id);
          store.pin(id);
          var after = store.isPinned(id);
          store.unpin(id);
          var restored = store.isPinned(id);
          return { ok: true, before: before, after: after, restored: restored,
                   hasMigrator: typeof store._migrateLocalPinsToServer === 'function' };
        })()`
      );
      if (r.ok) break;
      await mainWindow.waitForTimeout(200);
    }
    expect(r.ok).toBe(true);
    expect(r.before).toBe(false);
    expect(r.after).toBe(true);
    expect(r.restored).toBe(false);
    expect(r.hasMigrator).toBe(true);
  });

  test('sidebar shows the Attention Layers section with Focused/Pinned/Snoozed', async () => {
    const sidebar = mainWindow.locator('.account-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText('Focused');
    await expect(sidebar).toContainText('Pinned');
    await expect(sidebar).toContainText('Snoozed');
  });

  test('clicking the Pinned sidebar row focuses a PinnedMailboxPerspective', async () => {
    const pinnedRow = mainWindow.locator('.account-sidebar .item:has-text("Pinned")').first();
    await pinnedRow.click();
    await mainWindow.waitForTimeout(500);
    const current = await executeInRenderer(
      electronApp,
      `(function(){
        var $m = window.$m;
        var FPS = $m.FocusedPerspectiveStore;
        var cur = FPS && FPS.current && FPS.current();
        return { name: cur && cur.constructor && cur.constructor.name, pinned: !!(cur && cur.pinned) };
      })()`
    );
    expect(current.name).toBe('PinnedMailboxPerspective');
    expect(current.pinned).toBe(true);
  });
});

// The exact bug the user reported: clicking Focused / Pinned / Snoozed in the
// sidebar did nothing. This proves each row is clickable end-to-end and the
// view actually switches (visible selection + focused perspective changes).
test.describe('Attention Layers folders are clickable (user-visible, the reported bug)', () => {
  async function currentPerspective() {
    return executeInRenderer(
      electronApp,
      `(function(){
        var $m = window.$m;
        var cur = $m.FocusedPerspectiveStore && $m.FocusedPerspectiveStore.current();
        return { name: cur && cur.constructor && cur.constructor.name,
                 dispName: cur && cur.name, pinned: !!(cur && cur.pinned) };
      })()`,
    );
  }

  async function clickFolderAndProve(name: string, expectedPerspective: string) {
    const row = mainWindow.locator(`.account-sidebar .item .name:has-text("${name}")`).first();
    await expect(row).toBeVisible();
    await row.click();
    await mainWindow.waitForTimeout(600);

    // (1) the focused perspective actually changed (functional proof)
    const cur = await currentPerspective();
    expect(cur.name).toBe(expectedPerspective);

    // (2) the clicked row is now visibly selected (aria-selected="true") — the
    //     thing that did NOT happen before (rows were inert). Scope to THIS row
    //     (Focused and Pinned resolve to the same perspective, so both highlight).
    const clickedItem = mainWindow
      .locator(`.account-sidebar .item:has(.name:has-text("${name}"))`)
      .first();
    await expect(clickedItem).toHaveAttribute('aria-selected', 'true');

    // (3) visual proof
    await mainWindow.screenshot({ path: `playwright/test-results/attention-click-${name}.png` });
    return cur;
  }

  test('clicking "Focused" switches the view (auto-detected important)', async () => {
    await clickFolderAndProve('Focused', 'FocusedMailboxPerspective');
  });

  test('clicking "Pinned" switches to the Pinned (synced) view', async () => {
    const cur = await clickFolderAndProve('Pinned', 'PinnedMailboxPerspective');
    expect(cur.pinned).toBe(true);
  });

  test('clicking "Snoozed" switches to the Snoozed view', async () => {
    const cur = await clickFolderAndProve('Snoozed', 'ThreadIdListPerspective');
    expect(cur.dispName).toBe('Snoozed');
  });
});
