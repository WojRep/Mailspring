#!/usr/bin/env node
/**
 * Production-path smoke test — launches BUILT /Applications/ActunaMail.app
 * (lub app/dist/.../ActunaMail.app) **WITHOUT** PLAYWRIGHT=1 env bypass.
 *
 * Why: poprzednie scripts/smoke-built.js i Wave-1/2 e2e używały PLAYWRIGHT=1
 * env który bypassuje Tier B unlock gate (app/src/browser/application.ts:256).
 * To maskowało: (a) crashe w prod-only branchach, (b) brak template dot-actunamail/config.json,
 * (c) sytuację gdzie Tier B unlock dialog faktycznie pokazuje się user'owi.
 *
 * Strategy:
 *  - Spawn binary z `env -u ELECTRON_RUN_AS_NODE -- bin -c <freshCfg> --remote-debugging-port=PORT`
 *  - Fresh config dir = no Tier B keychain entry = unlock gate skipped naturally
 *  - CDP `http://localhost:PORT/json` enumerates targets
 *  - WebSocket eval per target dla DOM inspection
 *  - Captures Console.messageAdded + Runtime.exceptionThrown przez Inspector enable
 *
 * Run: `node scripts/prod-smoke.js [--use-installed]`
 *  - default: testuje świeży build z `app/dist/`
 *  - `--use-installed`: testuje `/Applications/ActunaMail.app`
 *
 * Exit: 0 OK, 1 visual/launch error, 2 crash.
 */

const fs = require('fs');
const { launchProd, evalInTarget, captureScreenshot } = require('./_cdp-helpers');

(async () => {
  const USE_INSTALLED = process.argv.includes('--use-installed');
  const appPath = USE_INSTALLED
    ? '/Applications/ActunaMail.app/Contents/MacOS/ActunaMail'
    : undefined;
  const ctx = await launchProd({ appPath });
  console.log(`Launching: ${ctx.child.spawnfile}`);
  console.log(`Config dir: ${ctx.cfgDir} (fresh — no Tier B, no accounts)`);
  console.log(`CDP port: ${ctx.port}`);

  let exited = false;
  ctx.child.on('exit', code => { exited = true; console.log(`child exited code=${code}`); });

  // Phase 1: wait + enumerate targets via DevToolsActivePort
  console.log('\n=== PHASE 1: enumerate windows via DevToolsActivePort ===');
  await new Promise(r => setTimeout(r, 5000));
  if (exited) {
    console.error('FAIL: app exited before window appeared.');
    console.error('Log tail:', ctx.logs.join('').slice(-2000));
    process.exit(1);
  }
  const targets = await ctx.listTargets();
  if (!targets) {
    console.error('FAIL: cannot read targets (DevToolsActivePort not written or WS unreachable).');
    console.error('Log:', ctx.logs.join('').slice(-1500));
    await ctx.cleanup();
    process.exit(1);
  }
  console.log(`Windows: ${targets.length}`);
  for (const t of targets) console.log(`  ${t.title} | ${t.url.slice(0, 100)}`);

  // Phase 2: wait for main default window
  console.log('\n=== PHASE 2: wait for main default window ===');
  const unlock = targets.find(t => t.url.includes('unlock.html'));
  if (unlock) {
    console.log('  → Tier B unlock screen detected; fresh config should NOT have Tier B by default.');
    try {
      const data = await evalInTarget(unlock.webSocketDebuggerUrl,
        'JSON.stringify({title:document.title,hasForm:!!document.getElementById("form"),hasSubmit:!!document.getElementById("submit"),bodyLen:document.body?document.body.innerHTML.length:0})'
      );
      console.log('  unlock DOM:', data);
    } catch (e) { console.log('  unlock eval err:', e.message); }
  }

  const main = await ctx.waitForMain(20000);
  if (!main) {
    console.error('FAIL: default main window never appeared.');
    console.error('Last targets:', targets.map(t => t.title));
    console.error('Log tail:', ctx.logs.join('').slice(-2000));
    await ctx.cleanup();
    process.exit(1);
  }
  console.log(`  ✓ main default window: ${main.title}`);
  await new Promise(r => setTimeout(r, 6000)); // plugin activation

  // Phase 3: DOM checks per major view region
  console.log('\n=== PHASE 3: visual DOM checks ===');
  const checks = [
    ['body non-empty',                  'document.body && document.body.innerHTML.length > 500'],
    ['toolbar present',                 '!!document.querySelector(".toolbar, [class*=\'toolbar\']")'],
    ['compose button',                  '!!document.querySelector(".item-compose")'],
    ['sidebar present',                 '!!document.querySelector(".account-sidebar, .sidebar, [class*=\'account-sidebar\']")'],
    ['main sheet container',            '!!document.querySelector("#sheet-container, .sheet-container, [class*=\'sheet\']")'],
    ['React mounted (any react fiber)', '!!Object.keys(document.body).find(k => k.startsWith("__reactFiber"))'],
    ['AppEnv global',                   'typeof window.AppEnv === "object"'],
    ['$m global ($m exports)',          'typeof window.$m === "object"'],
    ['AppEnv.commands',                 'typeof window.AppEnv.commands === "object" && typeof window.AppEnv.commands.dispatch === "function"'],
    ['AppEnv.packages',                 'typeof window.AppEnv.packages === "object"'],
    ['AppEnv.keymaps',                  'typeof window.AppEnv.keymaps === "object"'],
    ['command-palette plugin active',   'window.AppEnv.packages.getActivePackages().some(p => p.name === "command-palette")'],
    ['actuna-glass plugin active',      'window.AppEnv.packages.getActivePackages().some(p => p.name === "actuna-glass")'],
    ['priority-inbox-pin plugin active', 'window.AppEnv.packages.getActivePackages().some(p => p.name === "priority-inbox-pin")'],
    ['tag-system plugin active',        'window.AppEnv.packages.getActivePackages().some(p => p.name === "tag-system")'],
    ['snooze plugin active',            'window.AppEnv.packages.getActivePackages().some(p => p.name === "snooze")'],
    ['smart-folder plugin active',      'window.AppEnv.packages.getActivePackages().some(p => p.name === "smart-folder")'],
    ['rule-builder plugin active',      'window.AppEnv.packages.getActivePackages().some(p => p.name === "rule-builder")'],
    ['AppEnv.snooze.UIBus exists',      'typeof (window.AppEnv.snooze && window.AppEnv.snooze.UIBus) === "object"'],
    ['AppEnv.smartFolder.UIBus exists', 'typeof (window.AppEnv.smartFolder && window.AppEnv.smartFolder.UIBus) === "object"'],
    ['AppEnv.rules.UIBus exists',       'typeof (window.AppEnv.rules && window.AppEnv.rules.UIBus) === "object"'],
    ['keymap mod+k registered',         'window.AppEnv.keymaps.getBindingsForCommand("command-palette:toggle").includes("mod+k")'],
    ['keymap mod+shift+h registered',   'window.AppEnv.keymaps.getBindingsForCommand("snooze:open-picker").includes("mod+shift+h")'],
    ['keymap mod+shift+n registered',   'window.AppEnv.keymaps.getBindingsForCommand("smart-folder:open-wizard").includes("mod+shift+n")'],
    ['keymap mod+alt+r registered',     'window.AppEnv.keymaps.getBindingsForCommand("rule-builder:open-builder").includes("mod+alt+r")'],
  ];

  const failed = [];
  for (const [label, expr] of checks) {
    try {
      const result = await evalInTarget(main.webSocketDebuggerUrl, expr);
      console.log(`  ${result === true ? '✓' : '✗'} ${label} = ${result}`);
      if (result !== true) failed.push(label);
    } catch (e) {
      console.log(`  ✗ ${label} EVAL ERR: ${e.message}`);
      failed.push(label);
    }
  }

  // Phase 4: modal dispatch check (W1 + W2)
  console.log('\n=== PHASE 4: modal dispatch checks ===');
  const modals = [
    ['#89 command palette',  `window.AppEnv.commands.dispatch('command-palette:toggle')`, `.command-palette[role="dialog"]`,
                              `window.AppEnv.commands.dispatch('command-palette:toggle')`],
    ['#98 tag picker',       `window.AppEnv.commands.dispatch('tag-system:open-picker')`, `.tag-picker[role="dialog"]`,
                              `(function(){var b=window.AppEnv.tagSystem&&window.AppEnv.tagSystem.UIBus;if(b)b.closePicker();})()`],
    ['#104 snooze picker',   `window.AppEnv.snooze.UIBus.openPicker('smk-thread')`, `.snooze-picker[role="dialog"]`,
                              `window.AppEnv.snooze.UIBus.closePicker()`],
    ['#99 smart folder wiz', `window.AppEnv.smartFolder.UIBus.openWizard()`, `.smart-folder-wizard[role="dialog"]`,
                              `window.AppEnv.smartFolder.UIBus.closeWizard()`],
    ['#100 rule builder',    `window.AppEnv.rules.UIBus.openBuilder()`, `.rule-builder[role="dialog"]`,
                              `window.AppEnv.rules.UIBus.closeBuilder()`],
  ];

  for (const [label, openCode, locator, closeCode] of modals) {
    try {
      await evalInTarget(main.webSocketDebuggerUrl, openCode);
      await new Promise(r => setTimeout(r, 600));
      const present = await evalInTarget(main.webSocketDebuggerUrl, `!!document.querySelector('${locator}')`);
      console.log(`  ${present ? '✓' : '✗'} ${label} → ${locator}`);
      if (!present) failed.push(label);
      if (closeCode) await evalInTarget(main.webSocketDebuggerUrl, closeCode).catch(() => {});
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.log(`  ✗ ${label} ERR: ${e.message}`);
      failed.push(label);
    }
  }

  // Phase 5: screenshot for visual inspection
  console.log('\n=== PHASE 5: screenshot ===');
  try {
    const p = await captureScreenshot(main.webSocketDebuggerUrl, `/tmp/prod-smoke-${Date.now()}.png`);
    console.log('  screenshot:', p);
  } catch (e) { console.log('  screenshot ERR:', e.message); }

  await ctx.cleanup();

  console.log('\n=== SUMMARY ===');
  if (failed.length > 0) {
    console.log(`FAIL: ${failed.length} checks failed:`);
    for (const f of failed) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('PROD_SMOKE_OK — all checks passed');
})().catch(err => {
  console.error('CRASH:', err.message, err.stack);
  process.exit(2);
});
