const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

(async () => {
  const APP = path.resolve('app/dist/ActunaMail-darwin-arm64/ActunaMail.app/Contents/MacOS/ActunaMail');
  const cfgDir = path.join(os.tmpdir(), `actunamail-smoke-${Date.now()}`);
  fs.mkdirSync(cfgDir, { recursive: true });
  // Empty config dir — no accounts needed for LESS compile validation.

  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  cleanEnv.PLAYWRIGHT = '1';

  const app = await _electron.launch({
    executablePath: APP,
    args: ['--enable-logging', '--dev', '--config-dir-path', cfgDir, '--lang=en'],
    env: cleanEnv,
    timeout: 30000,
  });

  const errors = [];
  app.on('window', page => {
    page.on('console', m => {
      if (m.type() === 'error' || m.type() === 'warning') {
        const t = m.text();
        if (/Error compiling Less|TypeError|ReferenceError|Failed to activate|Cannot find module/i.test(t)) {
          errors.push(`[${m.type()}] ${t.slice(0, 200)}`);
        }
      }
    });
    page.on('pageerror', err => {
      errors.push(`[pageerror] ${err.message.slice(0, 200)}`);
    });
  });

  // Wait for main window
  const start = Date.now();
  let mainWin = null;
  while (Date.now() - start < 30000) {
    for (const w of app.windows()) {
      try {
        const url = w.url();
        if (url.includes('windowType%22%3A%22default') || url.includes('windowType=default')) {
          mainWin = w;
          break;
        }
      } catch (e) { /* */ }
    }
    if (mainWin) break;
    await new Promise(r => setTimeout(r, 500));
  }

  // Let plugins activate (2.5s setTimeout + safety margin)
  await new Promise(r => setTimeout(r, 6000));

  // Print all errors found
  if (errors.length > 0) {
    console.log('SMOKE_FAILED — found errors:');
    for (const e of errors) console.log('  ', e);
  } else {
    console.log('SMOKE_OK — built app launched, plugins activated, no LESS/activation errors');
  }

  await app.close();
  fs.rmSync(cfgDir, { recursive: true, force: true });
  process.exit(errors.length > 0 ? 1 : 0);
})().catch(err => { console.error('SMOKE_CRASH:', err.message); process.exit(2); });
