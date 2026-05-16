/* eslint-disable no-console */
//
// Tier A SQLCipher smoke test — runs in the Electron MAIN process.
//
// Catches the class of bug behind the v0.3.7–v0.3.11 restart loop:
// KeyManager.getDBKey() failing in the main process (where mailsync
// migrate is spawned), which left mailsync with an empty
// ACTUNA_DB_KEY and produced a plaintext / unopenable database.
//
// It tests the COMPILED key-manager + the real mailsync binary out of
// the deployed app bundle (/Applications/ActunaMail.app) — not the TS
// source — so it reflects exactly what ships.
//
// Run:
//   env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron \
//     scripts/test-tier-a-smoke.js [/path/to/ActunaMail.app]
//
// Exit code 0 = all checks passed; 1 = a check failed.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// Target bundle: explicit argv[2], else the freshly-built artifact if
// present (so `npm run test-tier-a` works straight after `npm run
// build`, before deploy), else the installed app.
function resolveBundle() {
  if (process.argv[2]) return process.argv[2];
  const built = path.join(
    __dirname,
    '..',
    'app',
    'dist',
    `ActunaMail-darwin-${process.arch}`,
    'ActunaMail.app'
  );
  if (fs.existsSync(built)) return built;
  return '/Applications/ActunaMail.app';
}
const APP_BUNDLE = resolveBundle();
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err && err.stack ? err.stack : err}`);
  }
}

app.whenReady().then(() => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-tier-a-'));
  app.setPath('userData', path.join(work, 'userData'));
  fs.mkdirSync(app.getPath('userData'), { recursive: true });

  // Extract the deployed app.asar so we can require the COMPILED
  // key-manager.js exactly as it ships.
  const asarPath = path.join(APP_BUNDLE, 'Contents', 'Resources', 'app.asar');
  const extractDir = path.join(work, 'asar');
  let keyManagerPath = null;
  let mailsyncBin = null;

  check('0. deployed app.asar + mailsync binary present', () => {
    if (!fs.existsSync(asarPath)) throw new Error(`no asar at ${asarPath}`);
    execFileSync('npx', ['--yes', 'asar', 'extract', asarPath, extractDir], {
      timeout: 60000,
      stdio: 'pipe',
    });
    keyManagerPath = path.join(extractDir, 'src', 'key-manager.js');
    if (!fs.existsSync(keyManagerPath)) throw new Error('key-manager.js not in asar');
    mailsyncBin = path.join(
      APP_BUNDLE,
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'mailsync'
    );
    if (!fs.existsSync(mailsyncBin)) throw new Error(`no mailsync at ${mailsyncBin}`);
  });

  let dbKeyHex = null;

  check('1. key-manager.js loads in the MAIN process', () => {
    // The v0.3.11 bug: a top-level require('@electron/remote') threw
    // here in the main process, so the whole module failed to load.
    require(keyManagerPath);
  });

  check('2. process.type is "browser" (main process)', () => {
    if (process.type !== 'browser') throw new Error(`process.type=${process.type}`);
  });

  check('3. getDBKey() returns a 32-byte Buffer in the main process', () => {
    const KeyManager = require(keyManagerPath).default;
    const key = KeyManager.getDBKey();
    if (!Buffer.isBuffer(key)) throw new Error('not a Buffer');
    if (key.length !== 32) throw new Error(`length=${key.length}`);
    dbKeyHex = key.toString('hex');
  });

  check('4. db-key.enc written to the config dir', () => {
    const keyPath = path.join(app.getPath('userData'), 'db-key.enc');
    if (!fs.existsSync(keyPath)) throw new Error(`missing ${keyPath}`);
  });

  check('5. getDBKey() is idempotent (same key on second call)', () => {
    const KeyManager = require(keyManagerPath).default;
    const again = KeyManager.getDBKey().toString('hex');
    if (again !== dbKeyHex) throw new Error('key changed between calls');
  });

  check('6. mailsync --mode migrate produces an ENCRYPTED edgehill.db', () => {
    if (!dbKeyHex) throw new Error('no key from check 3');
    const migrateDir = path.join(work, 'migrate');
    fs.mkdirSync(migrateDir, { recursive: true });
    execFileSync(mailsyncBin, ['--mode', 'migrate'], {
      env: {
        ...process.env,
        CONFIG_DIR_PATH: migrateDir,
        ACTUNA_DB_KEY: dbKeyHex,
        IDENTITY_SERVER: '',
      },
      timeout: 30000,
      stdio: 'pipe',
    });
    const dbPath = path.join(migrateDir, 'edgehill.db');
    if (!fs.existsSync(dbPath)) throw new Error('edgehill.db not created');
    const fd = fs.openSync(dbPath, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (header.toString('utf-8') === 'SQLite format 3\0') {
      throw new Error('edgehill.db is PLAINTEXT (stock SQLite magic header present)');
    }
  });

  check('7. mailsync refuses to start with an empty key', () => {
    const emptyDir = path.join(work, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    let exitCode = 0;
    try {
      execFileSync(mailsyncBin, ['--mode', 'migrate'], {
        env: {
          ...process.env,
          CONFIG_DIR_PATH: emptyDir,
          ACTUNA_DB_KEY: '',
          IDENTITY_SERVER: '',
        },
        timeout: 30000,
        stdio: 'pipe',
      });
    } catch (err) {
      exitCode = err.status || 1;
    }
    if (exitCode === 0) throw new Error('mailsync did NOT refuse an empty key');
  });

  check('8. mailsync can REOPEN the encrypted DB (key round-trips)', () => {
    // Re-run migrate on the same dir + key: must succeed (the DB is
    // already encrypted with this key; a wrong/empty key would fail).
    const migrateDir = path.join(work, 'migrate');
    execFileSync(mailsyncBin, ['--mode', 'migrate'], {
      env: {
        ...process.env,
        CONFIG_DIR_PATH: migrateDir,
        ACTUNA_DB_KEY: dbKeyHex,
        IDENTITY_SERVER: '',
      },
      timeout: 30000,
      stdio: 'pipe',
    });
  });

  const failed = results.filter(r => !r.ok);
  console.log('');
  console.log(`TIER A SMOKE: ${results.length - failed.length}/${results.length} passed`);
  app.exit(failed.length === 0 ? 0 : 1);
});
