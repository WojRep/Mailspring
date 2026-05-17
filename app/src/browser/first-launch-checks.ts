/**
 * Ticket 45c — first-launch checks for SQLCipher Tier A.
 *
 * Two responsibilities (kept in one module because they share the
 * data-folder inspection path and both must complete before any DB
 * open):
 *
 *   1. Linux refuse-to-start gate (memo §5 user decision 2026-05-12
 *      *"Refuse to start"*) — if safeStorage.getSelectedStorageBackend()
 *      returns 'basic_text', show install instructions and quit. No
 *      fall-through to plaintext mode.
 *
 *   2. First-launch detection + archive rename (memo §5 user decision
 *      *"Nowa instalacja, pusta, jako punkt startu, to nowa
 *      funkcjonalnosc, wiec nic nie migrujemy"*) — if a v0.2.x data
 *      folder exists with a plaintext SQLite db, rename it to
 *      `<dir>.v0.2-archive-<timestamp>` and create a fresh empty
 *      folder. Show a one-time info dialog so the user knows where
 *      their old data went.
 */

import fs from 'fs';
import path from 'path';

// Stock SQLite databases begin with this 16-byte magic header. SQLCipher
// databases have an opaque first page (no magic), so the heuristic
// "starts with this magic" === "unencrypted plaintext v0.2 data".
const STOCK_SQLITE_HEADER_MAGIC = 'SQLite format 3\0';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
}

export interface BackendGateResult {
  ok: boolean;
  reason?: 'unavailable' | 'basic_text';
  message?: string;
}

/**
 * Verify safeStorage backend is suitable for storing the DBKey.
 *
 * - macOS: Keychain → ok
 * - Windows: DPAPI → ok
 * - Linux + GNOME Keyring or KWallet → ok
 * - Linux + basic_text (no managed secret service) → refuse
 * - Anywhere with isEncryptionAvailable() === false → refuse
 */
export function verifySafeStorageBackend(
  safeStorage: SafeStorageLike,
  platform: NodeJS.Platform
): BackendGateResult {
  if (!safeStorage.isEncryptionAvailable()) {
    const hint =
      platform === 'linux'
        ? ' Install GNOME Keyring (gnome-keyring) or KWallet (kwallet) and restart ActunaMail.'
        : '';
    return {
      ok: false,
      reason: 'unavailable',
      message:
        'ActunaMail could not initialise database encryption because safeStorage is not available on this system.' +
        hint,
    };
  }
  if (platform === 'linux' && safeStorage.getSelectedStorageBackend) {
    const backend = safeStorage.getSelectedStorageBackend();
    if (backend === 'basic_text') {
      return {
        ok: false,
        reason: 'basic_text',
        message:
          'ActunaMail requires a managed secret service on Linux (GNOME Keyring or KWallet). ' +
          'The "basic_text" backend stores secrets in plaintext, which is not acceptable for ' +
          'an encrypted database key. Install gnome-keyring or kwallet, then restart ActunaMail.',
      };
    }
  }
  return { ok: true };
}

/**
 * Returns true if `configDirPath` contains an `edgehill.db` that is NOT
 * SQLCipher-encrypted (i.e., a leftover v0.2.x plaintext database).
 *
 * Detection heuristic: stock SQLite databases begin with the 16-byte
 * magic header `SQLite format 3\0`. SQLCipher-encrypted databases have
 * an opaque first page (no magic header). If the file exists but the
 * magic header is absent, it's already encrypted (or corrupt — either
 * way we don't archive it).
 */
export function detectV02Data(configDirPath: string): boolean {
  const dbPath = path.join(configDirPath, 'edgehill.db');
  if (!fs.existsSync(dbPath)) {
    return false;
  }
  try {
    const fd = fs.openSync(dbPath, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    return header.toString('utf-8') === STOCK_SQLITE_HEADER_MAGIC;
  } catch (err) {
    // Unreadable / locked — don't archive; let the regular open path
    // surface the real error.
    return false;
  }
}

/**
 * Rename `configDirPath` to a sibling archive folder
 * `<dir>.v0.2-archive-<ISO timestamp>` and recreate an empty `configDirPath`.
 *
 * Returns the absolute path of the archive folder so the caller can
 * surface it to the user (info banner — ticket 45e).
 *
 * Idempotent within a single process: caller must check `detectV02Data`
 * first; calling this twice would shuffle whatever happens to be in
 * `configDirPath` at the second call (likely an empty fresh folder).
 */
export function archiveV02Data(configDirPath: string, nowIso?: string): string {
  const ts = (nowIso || new Date().toISOString())
    .replace(/[:.]/g, '-')
    .replace(/T/, '-')
    .slice(0, 19);
  const archivePath = `${configDirPath}.v0.2-archive-${ts}`;
  fs.renameSync(configDirPath, archivePath);
  fs.mkdirSync(configDirPath, { recursive: true });
  return archivePath;
}
