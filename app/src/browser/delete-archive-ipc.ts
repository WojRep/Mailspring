import fs from 'fs';
import path from 'path';
import { IpcMain } from 'electron';

/**
 * Ticket 45e — IPC handler for "Usuń archiwum v0.2.x" button in
 * Preferences > Magazyn.
 *
 * Renderer calls `ipcRenderer.invoke('delete-archive', archivePath)`.
 * Main process validates the path matches the expected archive folder
 * pattern (defense in depth — renderer is untrusted enough that a
 * malicious or compromised window could otherwise request rm -rf of
 * any path the user has write access to) and rm -rf's the folder.
 *
 * Per design memo §5 + user decision 2026-05-15 (*"Cały folder
 * archiwum"*) — the whole archive folder, not just the database file.
 */

const ARCHIVE_NAME_PATTERN = /\.v0\.2-archive-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/;

export interface DeleteArchiveResult {
  ok: boolean;
  error?: string;
}

/**
 * Pure validation + delete function — extracted from the IPC handler
 * for spec coverage. Returns {ok: true} on success, {ok: false, error}
 * on validation failure or filesystem error.
 *
 * Security regression test surface: the path-pattern whitelist MUST
 * stay tight — only paths ending in `.v0.2-archive-<timestamp>` may
 * be deleted. Future relaxation of this pattern would expand the IPC
 * attack surface.
 */
export function deleteArchive(archivePath: string): DeleteArchiveResult {
  if (typeof archivePath !== 'string' || !archivePath) {
    return { ok: false, error: 'archivePath must be a non-empty string' };
  }
  const basename = path.basename(archivePath);
  if (!ARCHIVE_NAME_PATTERN.test(basename)) {
    return {
      ok: false,
      error: `archivePath does not match expected pattern *.v0.2-archive-<timestamp>: ${basename}`,
    };
  }
  if (!fs.existsSync(archivePath)) {
    return { ok: false, error: `archivePath does not exist: ${archivePath}` };
  }
  try {
    fs.rmSync(archivePath, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function registerDeleteArchiveIPCHandler(ipcMain: IpcMain) {
  ipcMain.handle('delete-archive', (_evt, archivePath: string) => deleteArchive(archivePath));
}
