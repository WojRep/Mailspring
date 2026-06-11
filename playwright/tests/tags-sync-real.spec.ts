/**
 * E2E — realny cross-device sync tagów (bilet #117, kryterium MUST-HAVE
 * usera 2026-06-10: "dwie rozne instancje ActunaMail podpięte pod jedno
 * konto widzą te same tagi").
 *
 * Dowód w dwóch połówkach (łącznie = dwie instancje widzą to samo):
 *  - INBOUND (serwer → aplikacja): keyword `E2E_Tag_In` ustawiony na serwerze
 *    PRZED startem (verification/imap-keyword-tool.py — symuluje "instancję A")
 *    pojawia się w tej instancji jako Thread.customKeywords ORAZ jako
 *    auto-zarejestrowany tag w TagStore przypisany do wątku.
 *  - OUTBOUND (aplikacja → serwer): tag "E2E Tag Out" nadany w tej instancji
 *    przez TagStore.apply trafia ChangeKeywordsTask-iem do silnika C++ i jako
 *    keyword `E2E_Tag_Out` na serwer — weryfikacja po zamknięciu testu przez
 *    imap-keyword-tool.py check (czyli "instancja B" = surowy IMAP).
 *
 * Wymaga sieci do mail.actuna.pl:993 + hasła w .env.test.local — bez tego skip.
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

test.describe('Tags — real cross-device sync (#117 must-have)', () => {
  test('INBOUND: keyword z serwera widoczny jako tag; OUTBOUND: tag z aplikacji wysłany na serwer', async () => {
    test.skip(!PW, 'no TEST_ACCOUNT_PASSWORD in playwright/.env.test.local — skipping real sync');
    // Realny sync z serwerem (auth + pełny fetch INBOX) nie mieści się w
    // domyślnych 60 s — jak inne real-account testy potrzebuje dłuższego okna.
    test.setTimeout(300000);

    // Sonda delt PRZED relaunch klienta — łapie cały strumień initial sync.
    await executeInRenderer(
      electronApp,
      `(function(){
        var $m = window.$m;
        window.__probe = { threadDeltas: 0, withCk: 0, lastCk: null };
        $m.DatabaseStore.listen(function(c){
          if (c && c.objectClass === 'Thread' && Array.isArray(c.objects)) {
            window.__probe.threadDeltas++;
            for (var i = 0; i < c.objects.length; i++) {
              var th = c.objects[i];
              if (th && th.customKeywords && th.customKeywords.length) {
                window.__probe.withCk++;
                window.__probe.lastCk = th.customKeywords;
              }
            }
          }
        });
        return true;
      })()`,
    );

    // 1) Uwierzytelnij konto fixture (ta sama ścieżka co real-account-sync).
    const injected = await executeInRenderer(
      electronApp,
      `(function(){
        var $m = window.$m;
        var acct = $m.AccountStore.accounts()[0];
        if (!acct) return Promise.resolve({ ok:false, reason:'no account' });
        var PW = ${JSON.stringify(PW)};
        return Promise.resolve()
          .then(function(){ return $m.KeyManager.replacePassword(acct.emailAddress + '-imap', PW); })
          .then(function(){ return $m.KeyManager.replacePassword(acct.emailAddress + '-smtp', PW); })
          .then(function(){ window.AppEnv.mailsyncBridge.forceRelaunchClient(acct); return { ok:true }; });
      })()`,
    );
    expect(injected.ok).toBe(true);

    // 2) INBOUND — poll aż zsyncowany wątek niesie keyword z serwera, a tag
    //    jest w TRWAŁYM stanie (localStorage — współdzielony między kopiami
    //    modułu, patrz #122) zarejestrowany i przypisany do tego wątku.
    let inbound: any = { threads: 0, kwThread: null, tagAssigned: false };
    for (let i = 0; i < 75; i++) {
      inbound = await executeInRenderer(
        electronApp,
        `(function(){
          var $m = window.$m;
          return $m.DatabaseStore.findAll($m.Thread).then(function(all){
            var kwThread = null;
            for (var k = 0; k < all.length; k++) {
              var ck = all[k].customKeywords;
              if (ck && ck.indexOf && ck.indexOf('E2E_Tag_In') !== -1) { kwThread = all[k].id; break; }
            }
            var tagAssigned = false;
            try {
              var reg = JSON.parse(localStorage.getItem('actuna.tags.registry') || '[]');
              var ass = JSON.parse(localStorage.getItem('actuna.tags.assignments') || '[]');
              var tag = reg.filter(function(t){ return t.name === 'E2E_Tag_In'; })[0];
              if (tag && kwThread) {
                for (var a = 0; a < ass.length; a++) {
                  if (ass[a][0] === kwThread && ass[a][1].indexOf(tag.id) !== -1) tagAssigned = true;
                }
              }
            } catch (e) { /* parse */ }
            return { threads: all.length, kwThread: kwThread, tagAssigned: tagAssigned };
          });
        })()`,
      );
      if (inbound.tagAssigned) break;
      await mainWindow.waitForTimeout(2000);
    }
    // eslint-disable-next-line no-console
    console.log('TAGS_INBOUND', JSON.stringify(inbound));

    // Dowód user-facing (#118 + #117): chip tagu widoczny w wierszu listy.
    let chipVisible = false;
    if (inbound.tagAssigned) {
      try {
        await mainWindow
          .locator('.tag-chip-compact-name', { hasText: 'E2E_Tag_In' })
          .first()
          .waitFor({ state: 'visible', timeout: 20000 });
        chipVisible = true;
      } catch (e) {
        chipVisible = false;
      }
      await mainWindow.screenshot({ path: 'playwright/test-results/tags-01-inbound-chip.png' });
    }
    // eslint-disable-next-line no-console
    console.log('TAGS_CHIP_VISIBLE', chipVisible);

    // Diagnostyka (bisekcja listener-vs-gating): ręczne syncFromThread na
    // znalezionym wątku + provider konta + stan tagów przed/po.
    if (inbound.kwThread && !inbound.tagAssigned) {
      const diag = await executeInRenderer(
        electronApp,
        `(function(){
          var $m = window.$m;
          var Store = window.AppEnv.tagSystem.Store;
          var tid = ${JSON.stringify(String(inbound.kwThread || ''))};
          return $m.DatabaseStore.find($m.Thread, tid).then(function(th){
            var acct = th ? $m.AccountStore.accountForId(th.accountId) : null;
            var registryNames = Store.list().map(function(t){ return t.name; });
            var before = Store.getTags(tid).map(function(t){ return t.name; });
            var err = null;
            try { Store.syncFromThread(th); } catch (e) { err = String(e && e.message || e); }
            var after = Store.getTags(tid).map(function(t){ return t.name; });
            var api = window.AppEnv.tagSystem;
            var emitterCount = ($m.DatabaseStore._emitter && $m.DatabaseStore._emitter.listenerCount)
              ? $m.DatabaseStore._emitter.listenerCount('trigger') : -1;
            var statsBefore = JSON.parse(JSON.stringify(api.deltaStats || {}));
            $m.DatabaseStore.trigger({
              objectClass: 'Thread',
              objects: [{ id: 'synthetic-1', accountId: th ? th.accountId : 'x', customKeywords: ['SyntheticKw'] }],
            });
            var statsAfterSynthetic = JSON.parse(JSON.stringify(api.deltaStats || {}));
            var sameDS = 'no-require';
            try {
              if (typeof require === 'function') {
                sameDS = (require('actunamail-exports').DatabaseStore === $m.DatabaseStore);
              }
            } catch (e2) { sameDS = 'require-err: ' + e2.message; }
            return {
              sameDS: sameDS,
              lsAssignments: (function(){ try { return localStorage.getItem('actuna.tags.assignments'); } catch(e3){ return 'err'; } })(),
              lsRegistryNames: (function(){ try { return (JSON.parse(localStorage.getItem('actuna.tags.registry')||'[]')).map(function(t){return t.name;}); } catch(e4){ return 'err'; } })(),
              emitterCount: emitterCount,
              statsBefore: statsBefore,
              statsAfterSynthetic: statsAfterSynthetic,
              provider: acct ? acct.provider : null,
              accountId: th ? th.accountId : null,
              ck: th ? th.customKeywords : null,
              deltaWiring: api.deltaWiring,
              deltaWiringError: api.deltaWiringError,
              deltaStats: api.deltaStats,
              registryNames: registryNames,
              before: before, after: after, err: err,
            };
          });
        })()`,
      );
      // eslint-disable-next-line no-console
      console.log('TAGS_DIAG', JSON.stringify(diag));
      const probe = await executeInRenderer(electronApp, `window.__probe`);
      // eslint-disable-next-line no-console
      console.log('TAGS_PROBE', JSON.stringify(probe));
    }

    expect(inbound.kwThread).toBeTruthy();
    expect(inbound.tagAssigned).toBe(true);

    // 3) OUTBOUND — nadaj tag w tej instancji na tym samym wątku; adapter
    //    (imap-keyword) wysyła ChangeKeywordsTask do silnika.
    const out = await executeInRenderer(
      electronApp,
      `(function(){
        var Store = window.AppEnv.tagSystem.Store;
        var threadId = ${JSON.stringify(String(inbound.kwThread || ''))};
        Store.register({ id: 'e2e-out', name: 'E2E Tag Out', color: '#3b6bdb', source: 'user' });
        var applied = Store.apply(threadId, 'e2e-out');
        return { applied: applied, has: Store.hasTag(threadId, 'e2e-out') };
      })()`,
    );
    // eslint-disable-next-line no-console
    console.log('TAGS_OUTBOUND_APPLY', JSON.stringify(out));
    expect(out.has).toBe(true);

    // Czas dla silnika na performRemote (STORE +FLAGS E2E_Tag_Out na serwerze).
    await mainWindow.waitForTimeout(15000);
  });
});
