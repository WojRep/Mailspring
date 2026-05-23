/*
 * Preferences → Plugins.
 *
 * Lists USER-installed plugins (the ones under the config-dir packages/
 * folder, not the built-in `internal_packages/` set), lets the user
 * enable/disable them (via `core.disabledPackages`) and remove them
 * (deletes the package folder). Built-in packages are intentionally
 * hidden — they are part of the app itself.
 */
import path from 'path';
import fs from 'fs';
import React from 'react';
import { localized } from 'actunamail-exports';

interface PluginRow {
  name: string;
  displayName: string;
  description: string;
  version: string;
  directory: string;
  isOptional: boolean;
}

interface State {
  plugins: PluginRow[];
  disabled: string[];
  needsRestart: boolean;
}

export default class PreferencesPlugins extends React.Component<
  Record<string, unknown>,
  State
> {
  static displayName = 'PreferencesPlugins';

  constructor(props: Record<string, unknown>) {
    super(props);
    this.state = { plugins: [], disabled: [], needsRestart: false };
  }

  componentDidMount() {
    this._refresh();
  }

  _refresh = () => {
    const configDir = (AppEnv as any).getConfigDirPath();
    const userPackagesDir = path.join(configDir, 'packages');
    const all: any[] = (AppEnv as any).packages.getAvailablePackages() || [];
    const rows: PluginRow[] = all
      .filter(
        (p) =>
          p &&
          typeof p.directory === 'string' &&
          (p.directory === userPackagesDir ||
            p.directory.startsWith(userPackagesDir + path.sep)),
      )
      .map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        description: (p.json && p.json.description) || '',
        version: (p.json && p.json.version) || '',
        directory: p.directory,
        isOptional: !!p.isOptional && p.isOptional(),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const disabled = (AppEnv.config.get('core.disabledPackages') as string[]) || [];
    this.setState({ plugins: rows, disabled });
  };

  _isEnabled(name: string): boolean {
    return !this.state.disabled.includes(name);
  }

  _toggleEnabled = (name: string) => {
    const cur = (AppEnv.config.get('core.disabledPackages') as string[]) || [];
    const next = cur.includes(name)
      ? cur.filter((n) => n !== name)
      : [...cur, name];
    AppEnv.config.set('core.disabledPackages', next);
    this.setState({ disabled: next, needsRestart: true });
    // Best-effort hot-enable; hot-disable is not implemented, restart needed.
    if (!next.includes(name)) {
      try {
        const pkg = (AppEnv as any).packages.getPackageNamed(name);
        if (pkg) (AppEnv as any).packages.activatePackage(pkg);
      } catch {
        /* ignore — restart will pick it up */
      }
    }
  };

  _install = () => {
    try {
      (AppEnv as any).packages.installPackageManually();
    } catch {
      try {
        AppEnv.commands.dispatch('window:install-package');
      } catch {
        /* ignore */
      }
    }
    // Refresh shortly after — the install dialog is async; this catches
    // the case where the user confirms quickly.
    setTimeout(this._refresh, 1500);
  };

  _remove = (row: PluginRow) => {
    const remote = require('@electron/remote');
    const choice = remote.dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [localized('Cancel'), localized('Remove')],
      defaultId: 0,
      cancelId: 0,
      message: localized('Remove plugin %@?', row.displayName),
      detail: localized(
        'This deletes the plugin files from your packages folder. The app should be restarted for the change to take full effect.',
      ),
    });
    if (choice !== 1) return;
    try {
      fs.rmSync(row.directory, { recursive: true, force: true });
    } catch (err: any) {
      AppEnv.showErrorDialog({
        title: localized('Could not remove plugin'),
        message: (err && err.message) || String(err),
      });
      return;
    }
    this.setState({ needsRestart: true });
    this._refresh();
  };

  render() {
    const { plugins, needsRestart } = this.state;
    return (
      <div className="container-plugins">
        <section>
          <h2>{localized('Plugins')}</h2>
          <p className="platform-note">
            {localized(
              'Installed plugins are extensions of ActunaMail. Built-in features of the app are not listed here.',
            )}
          </p>

          <div className="plugin-install-bar">
            <button className="btn btn-emphasis" onClick={this._install}>
              {localized('Install a Plugin')}…
            </button>
            <span className="plugin-install-hint">
              {localized(
                'Pick a plugin file (.actunamail-plugin or .zip) — ActunaMail installs it for you.',
              )}
            </span>
          </div>

          {plugins.length === 0 ? (
            <p className="platform-note">
              {localized('No plugins installed yet.')}
            </p>
          ) : (
            <ul className="plugin-list">
              {plugins.map((p) => (
                <li key={p.name} className="plugin-row">
                  <div className="plugin-info">
                    <div className="plugin-name">
                      <strong>{p.displayName}</strong>
                      {p.version ? (
                        <span className="plugin-version"> {p.version}</span>
                      ) : null}
                    </div>
                    {p.description ? (
                      <div className="plugin-desc">{p.description}</div>
                    ) : null}
                  </div>
                  <div className="plugin-actions">
                    <label className="plugin-toggle">
                      <input
                        type="checkbox"
                        disabled={!p.isOptional}
                        checked={this._isEnabled(p.name)}
                        onChange={() => this._toggleEnabled(p.name)}
                      />
                      {' '}
                      {localized('Enabled')}
                    </label>
                    <button className="btn" onClick={() => this._remove(p)}>
                      {localized('Remove')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {needsRestart && (
            <p className="platform-note">
              {localized(
                'Restart ActunaMail for plugin changes to take full effect.',
              )}
            </p>
          )}
        </section>
      </div>
    );
  }
}
