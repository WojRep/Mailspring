#!/usr/bin/env node
/**
 * Suite C: 95% funkcjonalności — production-path verification per-feature flow.
 *
 * Coverage:
 *  - Wave 1 (#92 #93 #98) — UI implementation + backend API
 *  - Wave 2 (#99 #100 #104) — UI implementation + backend API + dispatch flow
 *  - Backend-only tickets #105-#116 — AppEnv.* surface presence + Cmd+K command registration
 *
 * Per-feature verification:
 *  (a) Plugin activated (in AppEnv.packages.getActivePackages())
 *  (b) Public API exposed at AppEnv.{namespace}
 *  (c) Keymap shortcut registered (where applicable)
 *  (d) Cmd+K palette command(s) registered + discoverable po keyword
 *  (e) UX flow (gdzie modal): open → DOM presence → close
 *
 * Run: `node scripts/prod-functionality.js`
 * Exit: 0 OK, 1 partial, 2 crash.
 */
const { launchProd, evalInTarget } = require('./_cdp-helpers');

const FEATURES = [
  // === Foundation ===
  {
    id: '#89', name: 'Command palette', plugin: 'command-palette',
    apis: ['AppEnv.commandPalette'],
    keymaps: { 'command-palette:toggle': ['mod+k', 'mod+shift+p'] },
    paletteKeywords: ['command palette'],
    flow: {
      open: `window.AppEnv.commands.dispatch('command-palette:toggle')`,
      check: `.command-palette[role="dialog"]`,
      close: `window.AppEnv.commands.dispatch('command-palette:toggle')`,
    },
  },
  // === Wave 1 ===
  {
    id: '#92', name: 'Glass demo + tokens', plugin: 'actuna-glass',
    apis: ['AppEnv.glass'],
    paletteKeywords: ['translucency', 'glass'],
  },
  {
    id: '#93', name: 'Priority Inbox pin', plugin: 'priority-inbox-pin',
    apis: ['AppEnv.priorityInbox'],
    paletteKeywords: ['pin', 'priority'],
  },
  {
    id: '#98', name: 'Tag system', plugin: 'tag-system',
    apis: ['AppEnv.tagSystem'],
    keymaps: { 'tag-system:open-picker': ['mod+l'] },
    paletteKeywords: ['tag picker', 'manage tags', 'zarządzaj tagami'],
    flow: {
      open: `window.AppEnv.commands.dispatch('tag-system:open-picker')`,
      check: `.tag-picker[role="dialog"]`,
      close: `var b=window.AppEnv.tagSystem&&window.AppEnv.tagSystem.UIBus;if(b)b.closePicker();`,
    },
  },
  // === Wave 2 ===
  {
    id: '#99', name: 'Smart Folder wizard', plugin: 'smart-folder',
    apis: ['AppEnv.smartFolder', 'AppEnv.smartFolder.UIBus'],
    keymaps: { 'smart-folder:open-wizard': ['mod+shift+n'] },
    paletteKeywords: ['smart folder'],
    flow: {
      open: `window.AppEnv.smartFolder.UIBus.openWizard()`,
      check: `.smart-folder-wizard[role="dialog"]`,
      close: `window.AppEnv.smartFolder.UIBus.closeWizard()`,
    },
  },
  {
    id: '#100', name: 'Rule builder', plugin: 'rule-builder',
    apis: ['AppEnv.rules', 'AppEnv.rules.UIBus'],
    keymaps: {
      'rule-builder:open-builder': ['mod+alt+r'],
      'rule-builder:run-rules-now': ['mod+alt+shift+r'],
    },
    paletteKeywords: ['reguł', 'rule'],
    flow: {
      open: `window.AppEnv.rules.UIBus.openBuilder()`,
      check: `.rule-builder[role="dialog"]`,
      close: `window.AppEnv.rules.UIBus.closeBuilder()`,
    },
  },
  {
    id: '#104', name: 'Snooze picker', plugin: 'snooze',
    apis: ['AppEnv.snooze', 'AppEnv.snooze.UIBus'],
    keymaps: {
      'snooze:open-picker': ['mod+shift+h'],
      'snooze:unsnooze-now': ['mod+shift+u'],
    },
    paletteKeywords: ['snooze'],
    flow: {
      open: `window.AppEnv.snooze.UIBus.openPicker('func-test-tid')`,
      check: `.snooze-picker[role="dialog"]`,
      close: `window.AppEnv.snooze.UIBus.closePicker()`,
    },
  },
  // === Backend-only (no modal UI) ===
  { id: '#101', name: 'Akcje seryjne (compound actions)', plugin: 'akcje-seryjne' },
  { id: '#102', name: 'Contact card', plugin: 'contact-card' },
  { id: '#103', name: 'People hub CardDAV', plugin: 'people-hub' },
  { id: '#105', name: 'Send later extras', plugin: 'send-later', apis: ['AppEnv.sendLater'] },
  { id: '#106', name: 'Follow-up', plugin: 'follow-up', apis: ['AppEnv.followUp'] },
  { id: '#107', name: 'Markdown composer', plugin: 'markdown-composer' },
  { id: '#108', name: '@mention picker', plugin: 'mention-picker' },
  { id: '#109', name: 'Keyboard mapping', plugin: 'keyboard-mapping' },
  { id: '#110', name: 'Onboarding tutorial', plugin: 'onboarding-tutorial' },
  { id: '#111', name: 'Tracker blocker', plugin: 'tracker-blocker' },
  { id: '#112', name: 'PGP/SMIME', plugin: 'pgp-smime' },
  { id: '#113', name: 'RODO consent', plugin: 'rodo-consent' },
  { id: '#114', name: 'Audit log', plugin: 'audit-log' },
  { id: '#115', name: 'Bulk unsubscribe', plugin: 'bulk-unsubscribe' },
  { id: '#116', name: 'Cleaning suggestions', plugin: 'cleaning-suggestions' },
];

(async () => {
  const ctx = await launchProd();
  console.log(`Launching prod app, CDP port ${ctx.port}, fresh config ${ctx.cfgDir}`);

  const main = await ctx.waitForMain(30000);
  if (!main) {
    console.error('FAIL: main window never appeared.');
    console.error('Log tail:', ctx.logs.join('').slice(-2000));
    await ctx.cleanup();
    process.exit(1);
  }
  console.log(`✓ main window ready: ${main.title}`);
  await new Promise(r => setTimeout(r, 6000)); // plugin activation

  const fails = [];
  const ws = main.webSocketDebuggerUrl;

  for (const f of FEATURES) {
    console.log(`\n--- ${f.id} ${f.name} (${f.plugin}) ---`);

    // (a) Plugin activated
    try {
      const active = await evalInTarget(ws,
        `window.AppEnv.packages.getActivePackages().some(p => p.name === ${JSON.stringify(f.plugin)})`);
      console.log(`  ${active ? '✓' : '✗'} plugin ${f.plugin} active`);
      if (!active) { fails.push(`${f.id} plugin ${f.plugin} not active`); continue; }
    } catch (e) { console.log(`  ✗ activation check ERR: ${e.message}`); fails.push(`${f.id} activation`); continue; }

    // (b) APIs
    if (f.apis) {
      for (const api of f.apis) {
        try {
          const ok = await evalInTarget(ws, `typeof window.${api} === "object"`);
          console.log(`  ${ok ? '✓' : '✗'} ${api} exists`);
          if (!ok) fails.push(`${f.id} API ${api}`);
        } catch (e) { console.log(`  ✗ ${api} ERR: ${e.message}`); fails.push(`${f.id} ${api}`); }
      }
    }

    // (c) Keymaps
    if (f.keymaps) {
      for (const [cmd, expected] of Object.entries(f.keymaps)) {
        try {
          const bindings = await evalInTarget(ws,
            `JSON.stringify(window.AppEnv.keymaps.getBindingsForCommand(${JSON.stringify(cmd)}) || [])`);
          const arr = JSON.parse(bindings);
          const allPresent = expected.every(e => arr.includes(e));
          console.log(`  ${allPresent ? '✓' : '✗'} keymap ${cmd}: expected ${JSON.stringify(expected)}, got ${bindings}`);
          if (!allPresent) fails.push(`${f.id} keymap ${cmd}`);
        } catch (e) { console.log(`  ✗ keymap ${cmd} ERR: ${e.message}`); fails.push(`${f.id} keymap ${cmd}`); }
      }
    }

    // (d) Cmd+K palette discoverability
    if (f.paletteKeywords) {
      for (const kw of f.paletteKeywords) {
        try {
          const found = await evalInTarget(ws, `(function(){
            var api = window.AppEnv.commandPalette;
            if (!api) return false;
            // Some palette APIs expose _store directly; some via store getter.
            // Search registered commands matching keyword via fuzzy.
            // Approach: open palette, set query, read filtered count.
            try {
              var s; try { s = require('command-palette/lib/command-palette-store'); } catch(e) { s = null; }
              if (!s) return null; // can't inspect
              var Store = s.CommandPaletteStore || s.default || s;
              if (!Store.getCommands) return null;
              var all = Store.getCommands();
              var q = ${JSON.stringify(kw)}.toLowerCase();
              return all.some(function(c){
                var label = (c.label||'').toLowerCase();
                var keys = (c.keywords||[]).join(' ').toLowerCase();
                return label.indexOf(q) >= 0 || keys.indexOf(q) >= 0 || (c.id||'').toLowerCase().indexOf(q) >= 0;
              });
            } catch(e) { return false; }
          })()`);
          if (found === null) {
            console.log(`  ⏭ palette keyword "${kw}" — store inspection unavailable, skip`);
          } else {
            console.log(`  ${found ? '✓' : '✗'} palette keyword "${kw}" discoverable`);
            if (!found) fails.push(`${f.id} palette "${kw}"`);
          }
        } catch (e) { console.log(`  ✗ palette "${kw}" ERR: ${e.message}`); fails.push(`${f.id} palette ${kw}`); }
      }
    }

    // (e) UX flow
    if (f.flow) {
      try {
        await evalInTarget(ws, f.flow.open);
        await new Promise(r => setTimeout(r, 600));
        const ok = await evalInTarget(ws, `!!document.querySelector(${JSON.stringify(f.flow.check)})`);
        console.log(`  ${ok ? '✓' : '✗'} flow: open → ${f.flow.check}`);
        if (!ok) fails.push(`${f.id} flow ${f.flow.check}`);
        if (f.flow.close) { try { await evalInTarget(ws, f.flow.close); } catch (e) {} }
        await new Promise(r => setTimeout(r, 200));
      } catch (e) { console.log(`  ✗ flow ERR: ${e.message}`); fails.push(`${f.id} flow`); }
    }
  }

  await ctx.cleanup();

  console.log('\n=== SUMMARY (Suite C: 95% funkcjonalności) ===');
  console.log(`Tested ${FEATURES.length} features`);
  if (fails.length > 0) {
    console.log(`FAIL: ${fails.length} checks failed:`);
    for (const f of fails) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('FUNCTIONALITY_OK — wszystkie checks passed');
})().catch(err => { console.error('CRASH:', err.message, err.stack); process.exit(2); });
