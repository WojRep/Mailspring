#!/usr/bin/env node
/* eslint global-require: 0 */
/* eslint quote-props: 0 */
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const { safeExec } = require('./utils/child-process-wrapper.js');

const appDependencies = require('../app/package.json').dependencies;
const rootDependencies = require('../package.json').dependencies;
const npmElectronTarget = rootDependencies.electron;
const npmEnvs = {
  system: process.env,
  electron: Object.assign({}, process.env, {
    npm_config_target: npmElectronTarget,
    npm_config_arch: process.env.OVERRIDE_TO_INTEL ? 'x64' : process.arch,
    npm_config_target_arch: process.env.OVERRIDE_TO_INTEL ? 'x64' : process.arch,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_runtime: 'electron',
  }),
};

function npm(cmd, options) {
  const { cwd, env } = Object.assign({ cwd: '.', env: 'system' }, options);

  return new Promise((resolve, reject) => {
    console.log(
      `\n-- Running npm ${cmd} in ${cwd} with ${env} config (arch=${npmEnvs[env].npm_config_target_arch}) --`
    );

    safeExec(
      `npm ${cmd}`,
      {
        cwd: path.resolve(__dirname, '..', cwd),
        env: npmEnvs[env],
      },
      (err, stdout) => {
        return err ? reject(err) : resolve(stdout);
      }
    );
  });
}

// NOTE: Upstream Mailspring downloaded a prebuilt `mailsync` binary from an
// S3 bucket under Foundry376 control when the submodule was absent. ActunaMail
// always builds `mailsync` from our own fork submodule
// (https://github.com/WojRep/Mailspring-Sync, branch DEV.compliance), so this
// S3 fallback is removed — both as dead code and to shrink the supply-chain
// attack surface. See `analysis/24-license-compliance-audit.md` §9 Strefa G.1
// and `backlog/74-license-mailsync-binary-checksum.md`.

// For speed, we cache app/node_modules. However, we need to
// be sure to do a full rebuild of native node modules when the
// Electron version changes. To do this we check a marker file.
const appPath = path.resolve(__dirname, '..', 'app');
const appModulesPath = path.resolve(appPath, 'node_modules');
const cacheVersionPath = path.join(appModulesPath, '.postinstall-target-version');
const cacheElectronTarget =
  fs.existsSync(cacheVersionPath) && fs.readFileSync(cacheVersionPath).toString();

if (cacheElectronTarget !== npmElectronTarget) {
  console.log(
    `\n-- Clearing app/node_modules (${cacheElectronTarget} !== ${npmElectronTarget}) --`
  );
  rimraf.sync(appModulesPath);
}

// Audit is emitted with npm ls, no need to run it on EVERY command which is an odd default

async function sqliteMissingNanosleep() {
  return new Promise(resolve => {
    // Ticket 45b.2: swapped better-sqlite3 → better-sqlite3-multiple-ciphers.
    // Same .node binary name (better_sqlite3.node — multi-ciphers fork
    // keeps the upstream filename for drop-in compatibility), just a
    // different package directory.
    const sqliteLibDir = path.join(
      appModulesPath,
      'better-sqlite3-multiple-ciphers',
      'build',
      'Release'
    );
    const staticLib = path.join(sqliteLibDir, 'sqlite3.a');
    const sharedLib = path.join(sqliteLibDir, 'better_sqlite3.node');

    // Check the static lib first (build-from-source), then the prebuilt .node binary
    const target = fs.existsSync(staticLib) ? staticLib : sharedLib;
    safeExec(`nm '${target}' | grep nanosleep`, { ignoreStderr: true }, (err, resp) => {
      resolve(resp === '');
    });
  });
}

async function run() {
  // run `npm install` in ./app with Electron NPM config
  await npm(`install --no-audit`, { cwd: './app', env: 'electron' });

  // run `npm dedupe` in ./app with Electron NPM config
  await npm(`dedupe --no-audit`, { cwd: './app', env: 'electron' });

  // run `npm ls` in ./app - detects missing peer dependencies, etc.
  await npm(`ls`, { cwd: './app', env: 'electron' });

  // if SQlite was not built with HAVE_NANOSLEEP, do not ship this build! We need nanosleep
  // support so that multiple processes can connect to the sqlite file at the same time.
  // Without it, transactions only retry every 1 sec instead of every 10ms, leading to
  // awful db lock contention.  https://github.com/WiseLibs/better-sqlite3/issues/597
  if (['linux', 'darwin'].includes(process.platform) && (await sqliteMissingNanosleep())) {
    console.error(`better-sqlite compiled without -HAVE_NANOSLEEP, do not ship this build!`);
    process.exit(1001);
  }

  // write the marker with the electron version
  fs.writeFileSync(cacheVersionPath, npmElectronTarget);

  // ActunaMail requires the `mailsync` submodule to be present and built
  // locally. The upstream S3 prebuilt-binary fallback has been removed (see
  // note at top of file). If the submodule is missing the contributor must
  // run `git submodule update --init --recursive` and build mailsync from
  // source per `mailsync/BUILDING.md`.
  if (!fs.existsSync('./mailsync/build.sh')) {
    console.error(
      `\n-- ERROR: mailsync submodule not initialised. Run:\n` +
        `   git submodule update --init --recursive\n` +
        `   cd mailsync && ./build.sh\n` +
        `   See mailsync/BUILDING.md for full build instructions. --\n`
    );
    process.exit(1);
  } else {
    console.log(
      `\n-- mailsync submodule detected (` +
        `${process.platform}-${process.arch}). Build it locally with mailsync/build.sh. --`
    );
  }
}

run();
