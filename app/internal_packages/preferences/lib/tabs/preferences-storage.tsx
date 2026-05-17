/* eslint global-require: 0 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { localized } from 'actunamail-exports';

interface PreferencesStorageState {
  archivePath: string | null;
  archiveSizeMB: number | null;
  archiveCreatedISO: string | null;
  busy: boolean;
}

/**
 * Ticket 45e — Preferences > Magazyn tab.
 *
 * Shows current DB location + SQLCipher status (post-encryption) plus
 * a manual delete button for the v0.2.x archive folder (when one
 * exists from a v0.2 → v0.3 first-launch archive rename in
 * `first-launch-checks.ts:archiveV02Data`).
 *
 * Per user decision 2026-05-15 *"opcja nr 2"* — manual button + (later)
 * info banner, NO auto-prompt. Delete is single-click + confirm dialog
 * showing exact path + size + "operation NOT reversible" warning.
 */
export default class PreferencesStorage extends React.Component<{}, PreferencesStorageState> {
  static displayName = 'PreferencesStorage';

  state: PreferencesStorageState = {
    archivePath: null,
    archiveSizeMB: null,
    archiveCreatedISO: null,
    busy: false,
  };

  componentDidMount() {
    this._detectArchive();
  }

  _detectArchive = () => {
    const remote = require('@electron/remote');
    // archivePath set by main.js first-launch-checks (45c). May be
    // unset if no archive exists, or set even when the archive was
    // already deleted in a prior session — verify on disk.
    const candidatePath = (remote.getGlobal('actunaArchivePath') as string) || null;
    if (!candidatePath) {
      // Try to find existing archive next to the data dir.
      const dataDir = AppEnv.getConfigDirPath();
      const parent = path.dirname(dataDir);
      try {
        const entries = fs.readdirSync(parent);
        const dataName = path.basename(dataDir);
        const archiveEntry = entries.find(
          (e) =>
            e.startsWith(`${dataName}.v0.2-archive-`) &&
            fs.statSync(path.join(parent, e)).isDirectory()
        );
        if (archiveEntry) {
          this._populateArchiveStats(path.join(parent, archiveEntry));
          return;
        }
      } catch (_) {
        /* ignore */
      }
      this.setState({ archivePath: null });
      return;
    }
    if (!fs.existsSync(candidatePath)) {
      this.setState({ archivePath: null });
      return;
    }
    this._populateArchiveStats(candidatePath);
  };

  _populateArchiveStats = (archivePath: string) => {
    try {
      const stat = fs.statSync(archivePath);
      const sizeMB = this._dirSizeMB(archivePath);
      this.setState({
        archivePath,
        archiveSizeMB: sizeMB,
        archiveCreatedISO: stat.birthtime.toISOString().slice(0, 19),
      });
    } catch (_) {
      this.setState({ archivePath });
    }
  };

  _dirSizeMB = (dir: string): number => {
    let total = 0;
    const walk = (p: string) => {
      const stat = fs.statSync(p);
      if (stat.isFile()) {
        total += stat.size;
      } else if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
      }
    };
    try {
      walk(dir);
    } catch (_) {
      /* ignore unreadable */
    }
    return Math.round((total / 1024 / 1024) * 10) / 10;
  };

  _onDeleteArchive = async () => {
    const { archivePath, archiveSizeMB } = this.state;
    if (!archivePath) return;
    const remote = require('@electron/remote');
    const chosen = remote.dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [localized('Cancel'), localized('Delete permanently')],
      defaultId: 0,
      cancelId: 0,
      title: localized('Delete v0.2 archive?'),
      message: localized('Delete v0.2.x archive folder?'),
      detail:
        localized('Path: %@', archivePath) +
        '\n' +
        localized('Size: %@ MB', archiveSizeMB == null ? '?' : String(archiveSizeMB)) +
        '\n\n' +
        localized(
          'This operation is NOT reversible. Make sure you have copied any data you need from this folder.'
        ),
    });
    if (chosen !== 1) return;

    this.setState({ busy: true });
    const ipc = require('electron').ipcRenderer;
    try {
      const result = await ipc.invoke('delete-archive', archivePath);
      if (result && result.ok) {
        this.setState({ archivePath: null, archiveSizeMB: null, archiveCreatedISO: null });
      } else {
        const errMsg = (result && result.error) || 'unknown error';
        remote.dialog.showMessageBoxSync({
          type: 'error',
          buttons: [localized('OK')],
          title: localized('Could not delete archive'),
          message: localized('Could not delete archive folder.'),
          detail: errMsg,
        });
      }
    } catch (err) {
      remote.dialog.showMessageBoxSync({
        type: 'error',
        buttons: [localized('OK')],
        title: localized('Could not delete archive'),
        message: (err as Error).message,
      });
    } finally {
      this.setState({ busy: false });
    }
  };

  render() {
    const { archivePath, archiveSizeMB, archiveCreatedISO, busy } = this.state;
    const currentDbPath = path.join(AppEnv.getConfigDirPath(), 'edgehill.db');

    return (
      <div className="container-storage" style={{ padding: '0 30px' }}>
        <section style={{ marginBottom: 30 }}>
          <h6 style={{ marginBottom: 10 }}>{localized('Current database')}</h6>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{currentDbPath}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            {localized(
              'Encrypted at rest: %@',
              localized('Yes (SQLCipher Tier A — once enabled in v0.3.x)')
            )}
          </div>
        </section>

        <section>
          <h6 style={{ marginBottom: 10 }}>{localized('v0.2 archive')}</h6>
          {archivePath ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{archivePath}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                {localized('Size: %@ MB', archiveSizeMB == null ? '?' : String(archiveSizeMB))}
                {archiveCreatedISO ? ` · ${localized('Created: %@', archiveCreatedISO)}` : ''}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8, maxWidth: 480 }}>
                {localized(
                  'This is the encrypted/plaintext database from a previous ActunaMail version. v0.3 does not read it.'
                )}
              </div>
              <button
                type="button"
                className="btn"
                onClick={this._onDeleteArchive}
                disabled={busy}
                style={{ marginTop: 12 }}
                aria-label={localized('Delete v0.2 archive')}
              >
                {busy ? localized('Deleting…') : localized('Delete v0.2 archive')}
              </button>
            </>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {localized('No archive from a previous version.')}
            </div>
          )}
        </section>
      </div>
    );
  }
}
