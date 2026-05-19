import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { localized } from './intl';
import { Account } from 'actunamail-exports';
import { createLogger } from './logger';
import {
  wrapDBKey,
  unwrapDBKey,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from './key-manager-tier-b';

const log = createLogger('KeyManager');

interface KeySet {
  [key: string]: string;
}

const configCredentialsKey = 'credentials';
const DB_KEY_LENGTH_BYTES = 32;
// SQLCipher DBKey is persisted as a safeStorage-encrypted blob in a
// dedicated file (not in config.json). A dedicated file is readable by
// BOTH the Electron main process and renderer processes via plain `fs`,
// which the config store is not — main process has no `AppEnv.config`.
const DB_KEY_FILENAME = 'db-key.enc';
// Tier B (ticket 46): the DBKey wrapped under an Argon2id-derived KEK.
// `db-key.tierb.enc` is wrapped by the master password; `db-key.recovery.enc`
// is a second copy wrapped by the recovery code. When Tier B is enabled the
// plain Tier A `db-key.enc` is removed — the DBKey only exists in RAM during
// an unlock window.
const DB_KEY_TIERB_FILENAME = 'db-key.tierb.enc';
const DB_KEY_RECOVERY_FILENAME = 'db-key.recovery.enc';

/**
 * Thrown by `getDBKey()` when Tier B is enabled but the database is
 * locked (no unwrapped DBKey in RAM). The Tier B startup gate (ticket
 * 46b) must unlock BEFORE any synchronous getDBKey() caller runs; if
 * this throws it means a caller raced ahead of the gate.
 */
export class DBKeyLockedError extends Error {
  constructor(message = 'The encrypted database is locked. Unlock with the master password.') {
    super(message);
    this.name = 'DBKeyLockedError';
  }
}

/**
 * safeStorage accessor that works in BOTH process types.
 *
 *   - main process (process.type === 'browser'): electron.safeStorage
 *     directly. `@electron/remote` is renderer-only and would yield
 *     `undefined` here — that was the bug behind the v0.3.7–0.3.9
 *     "ACTUNA_DB_KEY is empty" crash: application.ts spawns
 *     `mailsync.migrate()` from the MAIN process, getDBKey() threw on
 *     `undefined.isEncryptionAvailable()`, the catch swallowed it, and
 *     mailsync received an empty key.
 *   - renderer: `@electron/remote`.safeStorage (main-process module
 *     proxied into the renderer).
 */
function getSafeStorage(): {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
} {
  if (process.type === 'browser') {
    return require('electron').safeStorage;
  }
  return require('@electron/remote').safeStorage;
}

/**
 * Resolve the per-user config directory in BOTH process types.
 *   - main: electron.app.getPath('userData') — main.js calls
 *     app.setPath('userData', configDirPath) before Application starts.
 *   - renderer: AppEnv.getConfigDirPath() (local, no remote round-trip).
 */
function getConfigDirPath(): string {
  if (process.type === 'browser') {
    return require('electron').app.getPath('userData');
  }
  if (typeof AppEnv !== 'undefined' && AppEnv && typeof AppEnv.getConfigDirPath === 'function') {
    return AppEnv.getConfigDirPath();
  }
  return require('@electron/remote').app.getPath('userData');
}

/**
 * Crash-safe file write: write to a sibling `.tmp` then atomically
 * rename over the target. Tier B enable/disable/change-password rely on
 * this to preserve the "two valid states only" invariant — a crash
 * mid-write must never leave the app with no usable key blob.
 */
function atomicWrite(filePath: string, data: Buffer): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

/**
 * A basic wrap around electron's secure key management. Consolidates all of
 * our keys under a single namespaced keymap and provides migration
 * support.
 *
 * Consolidating this prevents a ton of key authorization popups for each
 * and every key we want to access.
 */
class KeyManager {
  private _dbKeyCache: Buffer | null = null;

  /**
   * SQLCipher Tier A DBKey accessor (ticket 45a; process-aware since the
   * v0.3.10 hotfix — see below).
   *
   * Returns a 32-byte Buffer used as the `PRAGMA key` for the encrypted
   * SQLite database. Generated on first call via `crypto.randomBytes(32)`,
   * persisted as a safeStorage-encrypted blob in `<configDir>/db-key.enc`,
   * cached in memory for the lifetime of the process.
   *
   * Works in BOTH the Electron main process and renderer processes —
   * `getSafeStorage()` and `getConfigDirPath()` resolve per `process.type`.
   * The earlier implementation used `@electron/remote` + `AppEnv.config`,
   * both renderer-only; `application.ts` spawns `mailsync.migrate()` from
   * the MAIN process, where getDBKey() threw and mailsync got an empty
   * key → "ACTUNA_DB_KEY is empty" refuse-to-start crash.
   *
   * SYNCHRONOUS by design — Electron's safeStorage encrypt/decrypt and
   * Node `fs` calls used here are all synchronous, so every caller
   * (including the sync mailsync-process.ts:_spawnProcess path) gets the
   * key immediately with no cache-warming race.
   *
   * Linux refuse-to-start gate: if `isEncryptionAvailable()` is false
   * (no managed secret service), throws rather than degrading to a
   * plaintext mode — design memo §5 user decision 2026-05-12.
   */
  getDBKey(): Buffer {
    if (this._dbKeyCache && this._dbKeyCache.some((b) => b !== 0)) {
      return this._dbKeyCache;
    }
    // Tier B (ticket 46): when enabled, the DBKey lives only inside the
    // KEK-wrapped blob — there is no `db-key.enc` to read. A cold cache
    // here means the database is locked; fail loud rather than fall
    // through and generate a BRAND-NEW Tier A key (which would orphan
    // the user's encrypted database).
    if (this.isTierBEnabled()) {
      // The DBKey is unwrapped in the MAIN process (startup gate /
      // unlock). A renderer process has its OWN KeyManager singleton
      // with a cold cache — it never ran the Argon2id unwrap. Rather
      // than throw (which would surface as a "database is locked" error
      // when the renderer opens DatabaseStore), fetch the already-
      // unwrapped key from the main process over a synchronous IPC.
      // getDBKey() stays synchronous. Same DBKey-over-IPC trust model
      // as Tier A's ACTUNA_DB_KEY env + database-agent dbKeyHex.
      if (process.type === 'renderer') {
        try {
          const hex = require('electron').ipcRenderer.sendSync('tier-b-get-dbkey');
          if (hex && typeof hex === 'string') {
            const fromMain = Buffer.from(hex, 'hex');
            if (fromMain.length === DB_KEY_LENGTH_BYTES) {
              this._dbKeyCache = fromMain;
              return this._dbKeyCache;
            }
          }
        } catch (err) {
          // fall through to throw — main is locked or unreachable
        }
      }
      throw new DBKeyLockedError();
    }
    const ss = getSafeStorage();
    if (!ss || !ss.isEncryptionAvailable()) {
      const platformHint =
        process.platform === 'linux'
          ? localized(
              ' On Linux, ActunaMail requires a secret service such as GNOME Keyring or KWallet. Please install and run one, then restart ActunaMail.'
            )
          : '';
      throw new Error(
        localized(
          `ActunaMail could not initialise database encryption because safeStorage is not available on this system.`
        ) + platformHint
      );
    }
    const keyPath = path.join(getConfigDirPath(), DB_KEY_FILENAME);
    if (fs.existsSync(keyPath)) {
      const blob = fs.readFileSync(keyPath);
      const hex = ss.decryptString(blob);
      this._dbKeyCache = Buffer.from(hex, 'hex');
      return this._dbKeyCache;
    }
    const fresh = crypto.randomBytes(DB_KEY_LENGTH_BYTES);
    const encrypted = ss.encryptString(fresh.toString('hex'));
    fs.writeFileSync(keyPath, encrypted, { mode: 0o600 });
    this._dbKeyCache = fresh;
    return this._dbKeyCache;
  }

  /**
   * Zeroes the in-memory DBKey cache. Used on app shutdown,
   * powerMonitor.suspend (Tier B integration in ticket 46), or when
   * forcing a fresh re-read after key rotation. After wipe the next
   * `getDBKey()` call re-decrypts from `safeStorage`.
   */
  wipeDBKey(): void {
    if (this._dbKeyCache) {
      this._dbKeyCache.fill(0);
    }
    this._dbKeyCache = null;
  }

  // ───────────────────────────────────────────────────────────────────
  // SQLCipher Tier B (ticket 46) — opt-in master password.
  //
  // Tier B wraps the Tier A DBKey under an Argon2id-derived KEK. Disk
  // layout once enabled:
  //   db-key.tierb.enc    — DBKey wrapped by the master password
  //   db-key.recovery.enc — DBKey wrapped by the recovery code
  //   db-key.enc          — REMOVED (Tier A plain-in-safeStorage blob)
  //
  // Wrong-password handling: unwrap throws WrongSecretError (GCM tag
  // mismatch). The master password is never logged — the structured
  // logger (#04) deny-list redacts master_password/argon2_* keys, and
  // no method here passes the password into a log call.
  // ───────────────────────────────────────────────────────────────────

  /** True when the Tier B wrapped-key blob exists on disk. */
  isTierBEnabled(): boolean {
    return fs.existsSync(path.join(getConfigDirPath(), DB_KEY_TIERB_FILENAME));
  }

  /** True when Tier B is enabled but no DBKey is held in RAM (locked). */
  isLocked(): boolean {
    return this.isTierBEnabled() && !(this._dbKeyCache && this._dbKeyCache.some((b) => b !== 0));
  }

  /**
   * Enable Tier B. Reads the current Tier A DBKey, wraps it under the
   * master password AND under a freshly generated recovery code, writes
   * both blobs, then removes `db-key.enc`. Returns the recovery code so
   * the UI can display it once. The database stays unlocked afterwards.
   */
  enableTierB(password: string): { recoveryCode: string } {
    if (!password) {
      throw new Error('A master password is required to enable Tier B.');
    }
    if (this.isTierBEnabled()) {
      throw new Error('Tier B is already enabled.');
    }
    const dbKey = this.getDBKey(); // Tier A path — reads db-key.enc
    const recoveryCode = generateRecoveryCode();
    const passwordBlob = wrapDBKey(dbKey, password);
    const recoveryBlob = wrapDBKey(dbKey, normalizeRecoveryCode(recoveryCode));
    const dir = getConfigDirPath();
    // Two-valid-states invariant: write BOTH new blobs fully before
    // removing the Tier A blob. A crash leaves either pure Tier A or
    // (Tier A + Tier B) on disk — both bootable.
    atomicWrite(path.join(dir, DB_KEY_TIERB_FILENAME), passwordBlob);
    atomicWrite(path.join(dir, DB_KEY_RECOVERY_FILENAME), recoveryBlob);
    const tierAPath = path.join(dir, DB_KEY_FILENAME);
    if (fs.existsSync(tierAPath)) {
      fs.unlinkSync(tierAPath);
    }
    this._dbKeyCache = dbKey;
    log.info('Tier B enabled (master password + recovery code).');
    return { recoveryCode };
  }

  /**
   * Unlock with the master password. Unwraps the DBKey into the RAM
   * cache. Throws WrongSecretError on an incorrect password.
   */
  unlockTierB(password: string): void {
    const blobPath = path.join(getConfigDirPath(), DB_KEY_TIERB_FILENAME);
    if (!fs.existsSync(blobPath)) {
      throw new Error('Tier B is not enabled.');
    }
    this._dbKeyCache = unwrapDBKey(fs.readFileSync(blobPath), password);
  }

  /**
   * Unlock with the recovery code (forgot-password path). Same outcome
   * as `unlockTierB` — DBKey lands in the RAM cache.
   */
  unlockWithRecoveryCode(code: string): void {
    const blobPath = path.join(getConfigDirPath(), DB_KEY_RECOVERY_FILENAME);
    if (!fs.existsSync(blobPath)) {
      throw new Error('Tier B recovery code is not configured.');
    }
    this._dbKeyCache = unwrapDBKey(fs.readFileSync(blobPath), normalizeRecoveryCode(code));
  }

  /**
   * Change the master password. Verifies the old password by unwrapping,
   * re-wraps the SAME DBKey under a new salt + KEK, atomic-writes the
   * blob. The recovery blob is untouched (it still wraps the same DBKey).
   */
  changeTierBPassword(oldPassword: string, newPassword: string): void {
    if (!newPassword) {
      throw new Error('A new master password is required.');
    }
    const blobPath = path.join(getConfigDirPath(), DB_KEY_TIERB_FILENAME);
    if (!fs.existsSync(blobPath)) {
      throw new Error('Tier B is not enabled.');
    }
    const dbKey = unwrapDBKey(fs.readFileSync(blobPath), oldPassword); // verifies oldPassword
    atomicWrite(blobPath, wrapDBKey(dbKey, newPassword));
    this._dbKeyCache = dbKey;
    log.info('Tier B master password changed.');
  }

  /**
   * Regenerate the recovery code. Verifies the master password, derives
   * a fresh code, re-wraps the recovery blob, returns the new code. The
   * old recovery code stops working. Used by the "show recovery code"
   * action in Preferences — the original code cannot be read back from
   * the wrapped blob, so revealing it means issuing a new one.
   */
  regenerateRecoveryCode(password: string): { recoveryCode: string } {
    const dir = getConfigDirPath();
    const blobPath = path.join(dir, DB_KEY_TIERB_FILENAME);
    if (!fs.existsSync(blobPath)) {
      throw new Error('Tier B is not enabled.');
    }
    const dbKey = unwrapDBKey(fs.readFileSync(blobPath), password); // verifies password
    const recoveryCode = generateRecoveryCode();
    atomicWrite(
      path.join(dir, DB_KEY_RECOVERY_FILENAME),
      wrapDBKey(dbKey, normalizeRecoveryCode(recoveryCode))
    );
    this._dbKeyCache = dbKey;
    log.info('Tier B recovery code regenerated.');
    return { recoveryCode };
  }

  /**
   * Disable Tier B (back to Tier A). Verifies the master password,
   * writes the DBKey back into the safeStorage-encrypted `db-key.enc`,
   * then removes the Tier B blobs. Write-before-delete preserves the
   * two-valid-states invariant.
   */
  disableTierB(password: string): void {
    const dir = getConfigDirPath();
    const blobPath = path.join(dir, DB_KEY_TIERB_FILENAME);
    if (!fs.existsSync(blobPath)) {
      throw new Error('Tier B is not enabled.');
    }
    const dbKey = unwrapDBKey(fs.readFileSync(blobPath), password); // verifies password
    const ss = getSafeStorage();
    if (!ss || !ss.isEncryptionAvailable()) {
      throw new Error(
        localized(
          `ActunaMail could not initialise database encryption because safeStorage is not available on this system.`
        )
      );
    }
    atomicWrite(path.join(dir, DB_KEY_FILENAME), ss.encryptString(dbKey.toString('hex')));
    fs.unlinkSync(blobPath);
    const recoveryPath = path.join(dir, DB_KEY_RECOVERY_FILENAME);
    if (fs.existsSync(recoveryPath)) {
      fs.unlinkSync(recoveryPath);
    }
    this._dbKeyCache = dbKey;
    log.info('Tier B disabled — reverted to Tier A safeStorage key.');
  }

  /** Lock the database: zero the DBKey from RAM. Alias of wipeDBKey(). */
  lock(): void {
    this.wipeDBKey();
  }

  async deleteAccountSecrets(account: Account) {
    try {
      const keys = await this._getKeyHash();
      delete keys[`${account.emailAddress}-imap`];
      delete keys[`${account.emailAddress}-smtp`];
      delete keys[`${account.emailAddress}-refresh-token`];
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async extractAndStoreAccountSecrets(account: Account) {
    try {
      const keys = await this._getKeyHash();
      keys[`${account.emailAddress}-imap`] = account.settings.imap_password;
      keys[`${account.emailAddress}-smtp`] = account.settings.smtp_password;
      keys[`${account.emailAddress}-refresh-token`] = account.settings.refresh_token;
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
    const next = account.clone();
    delete next.settings.imap_password;
    delete next.settings.smtp_password;
    delete next.settings.refresh_token;
    return next;
  }

  async insertAccountSecrets(account: Account, keys: KeySet = null) {
    const next = account.clone();
    if (!keys) keys = await this._getKeyHash();
    next.settings.imap_password = keys[`${account.emailAddress}-imap`];
    next.settings.smtp_password = keys[`${account.emailAddress}-smtp`];
    next.settings.refresh_token = keys[`${account.emailAddress}-refresh-token`];
    return next;
  }

  async replacePassword(keyName: string, newVal: string) {
    try {
      const keys = await this._getKeyHash();
      keys[keyName] = newVal;
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async deletePassword(keyName: string) {
    try {
      const keys = await this._getKeyHash();
      delete keys[keyName];
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async getPassword(keyName: string) {
    try {
      const keys = await this._getKeyHash();
      return keys[keyName];
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async _getKeyHash() {
    let raw = '{}';
    const encryptedCredentials = AppEnv.config.get(configCredentialsKey);
    // Check for different null values to prevent issues if a migration from keytar has failed
    if (
      encryptedCredentials !== undefined &&
      encryptedCredentials !== null &&
      encryptedCredentials !== 'null'
    ) {
      try {
        raw = getSafeStorage().decryptString(Buffer.from(encryptedCredentials, 'utf-8'));
      } catch (err) {
        log.error({ err }, 'Mailspring encountered an error reading passwords from the keychain.');
      }
    }
    try {
      return JSON.parse(raw) as KeySet;
    } catch (err) {
      return {} as KeySet;
    }
  }

  async _writeKeyHash(keys: KeySet) {
    if (!getSafeStorage().isEncryptionAvailable()) {
      const platformHint =
        process.platform === 'linux'
          ? localized(
              ' On Linux, Mailspring requires a secret service such as GNOME Keyring or KWallet. Please ensure one is installed and running, then restart Mailspring.'
            )
          : '';
      throw new Error(
        localized(
          `Mailspring could not store your password securely because encryption is not available on this system.`
        ) + platformHint
      );
    }
    const enrcyptedCredentials = getSafeStorage().encryptString(JSON.stringify(keys));
    AppEnv.config.set(configCredentialsKey, enrcyptedCredentials);
  }

  _reportFatalError(err: Error) {
    const clickedButton = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'error',
      buttons: [localized('Mailspring Help'), localized('Quit')],
      message:
        err.message ||
        localized(
          `Mailspring could not store your password securely. For more information, visit %@`,
          'https://community.getmailspring.com/t/password-management-error/199'
        ),
    });

    if (clickedButton == 0) {
      const shell = require('electron').shell;
      shell.openExternal('https://community.getmailspring.com/t/password-management-error/199');
    }

    // tell the app to exit and rethrow the error to ensure code relying
    // on the passwords being saved never runs (saving identity for example).
    // Mark as user-visible so the global error handler does not also report
    // it to Sentry — the user has already been informed via the dialog above.
    (err as any).noSentry = true;
    require('@electron/remote').app.quit();
    throw err;
  }
}

export default new KeyManager();
