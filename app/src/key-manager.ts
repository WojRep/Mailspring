import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { localized } from './intl';
import { Account } from 'actunamail-exports';

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

/**
 * safeStorage accessor that works in BOTH process types.
 *
 *   - main process (process.type === 'browser'): electron.safeStorage
 *     directly. `@electron/remote` is renderer-only and would yield
 *     `undefined` here — that was the bug behind the v0.3.7–0.3.9
 *     "MAILSPRING_DB_KEY is empty" crash: application.ts spawns
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
   * key → "MAILSPRING_DB_KEY is empty" refuse-to-start crash.
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
    if (this._dbKeyCache && this._dbKeyCache.some(b => b !== 0)) {
      return this._dbKeyCache;
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
        console.error('Mailspring encountered an error reading passwords from the keychain.');
        console.error(err);
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
