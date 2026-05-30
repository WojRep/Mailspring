/**
 * Visual verify of built artifact — sprawdza że NIE TYLKO brak console errors,
 * ale że RZECZYWIŚCIE main UI renderuje DOM elements + wszystkie modale otwierają się.
 *
 * Run: cd app-client && node scripts/visual-verify.js
 * Exit: 0 = pass, 1 = visible-DOM problem, 2 = launch crash.
 */
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

(async () => {
  const APP = path.resolve('app/dist/ActunaMail-darwin-arm64/ActunaMail.app/Contents/MacOS/ActunaMail');
  if (!fs.existsSync(APP)) {
    console.error('FAIL: built app not found at', APP);
    process.exit(2);
  }
  const cfgDir = path.join(os.tmpdir(), `actunamail-verify-${Date.now()}`);
  fs.mkdirSync(cfgDir, { recursive: true });
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  cleanEnv.PLAYWRIGHT = '1';

  const consoleErrors = [];
  const pageerrors = [];

  const app = await _electron.launch({
    executablePath: APP,
    // NIE używamy --dev — user uruchamia z LaunchPad bez --dev. Production mode
    // używa innych ścieżek do styles/JS niż dev mode. Smoke test musi matchować
    // realny user-facing launch path.
    args: ['--enable-logging', '--config-dir-path', cfgDir, '--lang=en'],
    env: cleanEnv,
    timeout: 30000,
  });

  app.on('window', page => {
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', err => pageerrors.push(err.message.slice(0, 300)));
  });

  // Wait for any window
  await new Promise(r => setTimeout(r, 3000));
  const allWins = app.windows();
  console.log(`Windows after 3s: ${allWins.length}`);
  for (const w of allWins) {
    try {
      const url = w.url();
      const u = new URL(url);
      const ls = u.searchParams.get('loadSettings');
      const wt = ls ? JSON.parse(decodeURIComponent(ls)).windowType : '?';
      console.log(`  ${wt}: ${url.slice(0, 100)}`);
    } catch (e) { console.log('  parse failed:', e.message); }
  }

  // Find main
  let mainWin = null;
  const start = Date.now();
  while (Date.now() - start < 25000) {
    for (const w of app.windows()) {
      try {
        if (w.url().includes('windowType%22%3A%22default')) { mainWin = w; break; }
      } catch (e) {}
    }
    if (mainWin) break;
    await new Promise(r => setTimeout(r, 500));
  }
  if (!mainWin) {
    console.error('FAIL: main window never appeared');
    console.error('Console errors:', consoleErrors);
    console.error('Pageerrors:', pageerrors);
    await app.close();
    process.exit(1);
  }
  console.log('Main window URL:', mainWin.url().slice(0, 120));

  // Wait for plugin activation (2.5s setTimeout + safety)
  await new Promise(r => setTimeout(r, 6000));

  // === CRITICAL: Visual DOM checks ===
  const results = [];
  const check = async (label, locator, opts = {}) => {
    try {
      const count = await mainWin.locator(locator).count();
      const visible = count > 0;
      results.push({ label, locator, count, ok: opts.shouldExist === false ? !visible : visible });
    } catch (e) {
      results.push({ label, locator, count: 0, ok: false, error: e.message.slice(0, 80) });
    }
  };

  // Core layout elements — MUSI być w default main window
  await check('Window body non-empty',           'body > *');
  await check('Sheet container',                  '#sheet-container, .sheet-container');
  await check('Toolbar present',                  '.toolbar, [class*="toolbar"]');
  await check('Compose button',                   '.item-compose');
  await check('Sidebar present',                  '.account-sidebar, .sidebar, [class*="account-sidebar"]');
  await check('Thread list region',               '.thread-list, .multiselect-list, #thread-list');

  // Body snippet for visibility check
  let bodyHtmlLen = 0;
  try {
    const bodyText = await mainWin.locator('body').innerHTML({ timeout: 3000 });
    bodyHtmlLen = bodyText.length;
  } catch (e) {
    bodyHtmlLen = -1;
  }
  results.push({ label: 'Body HTML length', locator: 'body innerHTML', count: bodyHtmlLen, ok: bodyHtmlLen > 1000 });

  // Take screenshot for inspection
  const screenshotPath = path.join('/tmp', `visual-verify-${Date.now()}.png`);
  try {
    await mainWin.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Screenshot saved:', screenshotPath);
  } catch (e) {
    console.log('Screenshot failed:', e.message);
  }

  // === Modal dispatch checks (per-feature) ===
  const exec = async code => app.evaluate(async ({ BrowserWindow }, js) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.getURL().includes('windowType%22%3A%22default')) {
        return await win.webContents.executeJavaScript(js);
      }
    }
  }, code);

  const checkModal = async (label, openCode, locator, closeCode) => {
    try { await exec(openCode); } catch (e) {
      results.push({ label: `Open: ${label}`, locator, count: 0, ok: false, error: 'dispatch failed: ' + e.message.slice(0, 60) });
      return;
    }
    await new Promise(r => setTimeout(r, 800));
    let visible = false;
    try {
      visible = await mainWin.locator(locator).isVisible({ timeout: 2500 });
    } catch (e) {}
    results.push({ label: `Modal: ${label}`, locator, count: visible ? 1 : 0, ok: visible });
    if (closeCode) {
      try { await exec(closeCode); } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
    }
  };

  await checkModal('#89 Command palette',
    `window.AppEnv.commands.dispatch('command-palette:toggle');`,
    '.command-palette[role="dialog"]',
    `window.AppEnv.commands.dispatch('command-palette:toggle');`);

  await checkModal('#104 Snooze picker',
    `if (window.AppEnv && window.AppEnv.snooze && window.AppEnv.snooze.UIBus) window.AppEnv.snooze.UIBus.openPicker('vfy-thread');`,
    '.snooze-picker[role="dialog"]',
    `if (window.AppEnv && window.AppEnv.snooze && window.AppEnv.snooze.UIBus) window.AppEnv.snooze.UIBus.closePicker();`);

  await checkModal('#99 Smart Folder wizard',
    `if (window.AppEnv && window.AppEnv.smartFolder && window.AppEnv.smartFolder.UIBus) window.AppEnv.smartFolder.UIBus.openWizard();`,
    '.smart-folder-wizard[role="dialog"]',
    `if (window.AppEnv && window.AppEnv.smartFolder && window.AppEnv.smartFolder.UIBus) window.AppEnv.smartFolder.UIBus.closeWizard();`);

  await checkModal('#100 Rule builder',
    `if (window.AppEnv && window.AppEnv.rules && window.AppEnv.rules.UIBus) window.AppEnv.rules.UIBus.openBuilder();`,
    '.rule-builder[role="dialog"]',
    `if (window.AppEnv && window.AppEnv.rules && window.AppEnv.rules.UIBus) window.AppEnv.rules.UIBus.closeBuilder();`);

  console.log('\n=== VISUAL VERIFY ===');
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.label} (${r.locator}) count=${r.count}${r.error ? ' [' + r.error + ']' : ''}`);
  }
  console.log('\nConsole errors collected:', consoleErrors.length);
  for (const e of consoleErrors.slice(0, 10)) console.log('  CONSOLE:', e);
  console.log('Page errors collected:', pageerrors.length);
  for (const e of pageerrors.slice(0, 10)) console.log('  PAGEERROR:', e);

  await app.close();
  fs.rmSync(cfgDir, { recursive: true, force: true });

  const fails = results.filter(r => !r.ok);
  if (fails.length > 0) {
    console.log(`\nFAIL: ${fails.length} check(s) failed`);
    process.exit(1);
  }
  console.log('\nVISUAL_OK');
})().catch(err => { console.error('CRASH:', err.message, err.stack); process.exit(2); });
