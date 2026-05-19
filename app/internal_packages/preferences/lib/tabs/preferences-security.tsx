/* eslint global-require: 0 */
import React from 'react';
import { localized } from 'actunamail-exports';

const { ipcRenderer } = require('electron');

const IDLE_CHOICES_MIN = [1, 5, 15, 30, 60];

interface TierBConfig {
  idleMs: number;
  lockOnSuspend: boolean;
  lockOnScreenLock: boolean;
}

type FormMode = 'idle' | 'enable' | 'change' | 'disable' | 'reveal';

interface PreferencesSecurityState {
  loaded: boolean;
  enabled: boolean;
  locked: boolean;
  config: TierBConfig;
  mode: FormMode;
  pw1: string;
  pw2: string;
  oldPw: string;
  error: string | null;
  busy: boolean;
  recoveryCode: string | null;
}

const DEFAULT_CONFIG: TierBConfig = {
  idleMs: 15 * 60 * 1000,
  lockOnSuspend: true,
  lockOnScreenLock: true,
};

/**
 * Ticket 46c — Preferences > Security tab (SQLCipher Tier B).
 *
 * Opt-in master-password management: enable/disable, change password,
 * reveal (regenerate) the recovery code, idle-timeout + lock-trigger
 * settings, and a manual "Lock now" button. All actions go through the
 * Tier B IPC surface registered in application.ts (_registerTierBIPCHandlers).
 * The master password is never logged and never leaves the local IPC
 * channel.
 */
export default class PreferencesSecurity extends React.Component<{}, PreferencesSecurityState> {
  static displayName = 'PreferencesSecurity';

  state: PreferencesSecurityState = {
    loaded: false,
    enabled: false,
    locked: false,
    config: DEFAULT_CONFIG,
    mode: 'idle',
    pw1: '',
    pw2: '',
    oldPw: '',
    error: null,
    busy: false,
    recoveryCode: null,
  };

  componentDidMount() {
    this._refreshStatus();
  }

  _refreshStatus = async () => {
    try {
      const status = await ipcRenderer.invoke('tier-b-status');
      this.setState({
        loaded: true,
        enabled: !!(status && status.enabled),
        locked: !!(status && status.locked),
        config: (status && status.config) || DEFAULT_CONFIG,
      });
    } catch (err) {
      this.setState({ loaded: true, error: (err as Error).message });
    }
  };

  _resetForm = (mode: FormMode = 'idle') => {
    this.setState({ mode, pw1: '', pw2: '', oldPw: '', error: null, busy: false });
  };

  _onEnable = async () => {
    const { pw1, pw2 } = this.state;
    if (!pw1) {
      this.setState({ error: localized('Enter a master password.') });
      return;
    }
    if (pw1 !== pw2) {
      this.setState({ error: localized('The passwords do not match.') });
      return;
    }
    this.setState({ busy: true, error: null });
    const res = await ipcRenderer.invoke('tier-b-enable', pw1);
    if (res && res.ok) {
      this.setState({
        mode: 'idle',
        pw1: '',
        pw2: '',
        oldPw: '',
        busy: false,
        recoveryCode: res.recoveryCode,
      });
      this._refreshStatus();
    } else {
      this.setState({ busy: false, error: (res && res.error) || localized('Could not enable.') });
    }
  };

  _onChangePassword = async () => {
    const { oldPw, pw1, pw2 } = this.state;
    if (pw1 !== pw2) {
      this.setState({ error: localized('The passwords do not match.') });
      return;
    }
    if (!pw1) {
      this.setState({ error: localized('Enter a master password.') });
      return;
    }
    this.setState({ busy: true, error: null });
    const res = await ipcRenderer.invoke('tier-b-change-password', oldPw, pw1);
    if (res && res.ok) {
      this._resetForm('idle');
    } else {
      this.setState({ busy: false, error: (res && res.error) || localized('Could not change.') });
    }
  };

  _onDisable = async () => {
    const { oldPw } = this.state;
    this.setState({ busy: true, error: null });
    const res = await ipcRenderer.invoke('tier-b-disable', oldPw);
    if (res && res.ok) {
      this._resetForm('idle');
      this._refreshStatus();
    } else {
      this.setState({ busy: false, error: (res && res.error) || localized('Could not disable.') });
    }
  };

  _onRevealRecovery = async () => {
    const { oldPw } = this.state;
    this.setState({ busy: true, error: null });
    const res = await ipcRenderer.invoke('tier-b-regenerate-recovery', oldPw);
    if (res && res.ok) {
      this.setState({ mode: 'idle', oldPw: '', busy: false, recoveryCode: res.recoveryCode });
    } else {
      this.setState({ busy: false, error: (res && res.error) || localized('Wrong password.') });
    }
  };

  _onChangeIdle = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idleMs = parseInt(e.target.value, 10);
    this._applyConfig({ idleMs });
  };

  _onToggleSuspend = (e: React.ChangeEvent<HTMLInputElement>) => {
    this._applyConfig({ lockOnSuspend: e.target.checked });
  };

  _onToggleScreenLock = (e: React.ChangeEvent<HTMLInputElement>) => {
    this._applyConfig({ lockOnScreenLock: e.target.checked });
  };

  _applyConfig = async (partial: Partial<TierBConfig>) => {
    const res = await ipcRenderer.invoke('tier-b-configure', partial);
    if (res && res.ok) {
      this.setState({ config: res.config });
    }
  };

  _onLockNow = () => {
    ipcRenderer.send('tier-b-lock-now');
  };

  _renderRecoveryPanel() {
    const { recoveryCode } = this.state;
    if (!recoveryCode) return null;
    return (
      <section
        style={{
          marginTop: 20,
          padding: 14,
          border: '1px solid #d8b400',
          borderRadius: 6,
          background: 'rgba(255, 220, 90, 0.12)',
        }}
      >
        <h6 style={{ marginBottom: 6 }}>{localized('Recovery code')}</h6>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8, maxWidth: 480 }}>
          {localized(
            'Save this recovery code somewhere safe. It is the only way to unlock the database if you forget the master password. It is shown once.'
          )}
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 15,
            letterSpacing: 1,
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.06)',
            borderRadius: 4,
            userSelect: 'text',
          }}
        >
          {recoveryCode}
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 10 }}
          onClick={() => this.setState({ recoveryCode: null })}
        >
          {localized('I have saved my recovery code')}
        </button>
      </section>
    );
  }

  _renderError() {
    const { error } = this.state;
    if (!error) return null;
    return (
      <div role="alert" style={{ color: '#d0021b', fontSize: 12, marginTop: 8 }}>
        {error}
      </div>
    );
  }

  _passwordField(
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    autoFocus = false
  ) {
    return (
      <div style={{ marginTop: 8 }}>
        <label htmlFor={id} style={{ fontSize: 12, opacity: 0.8, display: 'block' }}>
          {label}
        </label>
        <input
          id={id}
          type="password"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 260, padding: '5px 7px', marginTop: 3 }}
        />
      </div>
    );
  }

  _renderEnableForm() {
    const { pw1, pw2, busy } = this.state;
    return (
      <section style={{ marginTop: 12 }}>
        {this._passwordField(
          'tierb-pw1',
          localized('Master password'),
          pw1,
          (v) => this.setState({ pw1: v }),
          true
        )}
        {this._passwordField('tierb-pw2', localized('Confirm master password'), pw2, (v) =>
          this.setState({ pw2: v })
        )}
        {this._renderError()}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn" disabled={busy} onClick={this._onEnable}>
            {busy ? localized('Working…') : localized('Enable')}
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            disabled={busy}
            onClick={() => this._resetForm('idle')}
          >
            {localized('Cancel')}
          </button>
        </div>
      </section>
    );
  }

  _renderChangeForm() {
    const { oldPw, pw1, pw2, busy } = this.state;
    return (
      <section style={{ marginTop: 12 }}>
        {this._passwordField(
          'tierb-old',
          localized('Current master password'),
          oldPw,
          (v) => this.setState({ oldPw: v }),
          true
        )}
        {this._passwordField('tierb-new1', localized('New master password'), pw1, (v) =>
          this.setState({ pw1: v })
        )}
        {this._passwordField('tierb-new2', localized('Confirm new master password'), pw2, (v) =>
          this.setState({ pw2: v })
        )}
        {this._renderError()}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn" disabled={busy} onClick={this._onChangePassword}>
            {busy ? localized('Working…') : localized('Change password')}
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            disabled={busy}
            onClick={() => this._resetForm('idle')}
          >
            {localized('Cancel')}
          </button>
        </div>
      </section>
    );
  }

  _renderPasswordConfirmForm(title: string, action: () => void, danger = false) {
    const { oldPw, busy } = this.state;
    return (
      <section style={{ marginTop: 12 }}>
        {this._passwordField(
          'tierb-confirm',
          localized('Master password'),
          oldPw,
          (v) => this.setState({ oldPw: v }),
          true
        )}
        {this._renderError()}
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className={danger ? 'btn btn-danger' : 'btn'}
            disabled={busy || !oldPw}
            onClick={action}
          >
            {busy ? localized('Working…') : title}
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8 }}
            disabled={busy}
            onClick={() => this._resetForm('idle')}
          >
            {localized('Cancel')}
          </button>
        </div>
      </section>
    );
  }

  _renderEnabledControls() {
    const { config, mode } = this.state;
    const idleMin = Math.round(config.idleMs / 60000) || 15;
    return (
      <>
        <section style={{ marginTop: 16 }}>
          <h6 style={{ marginBottom: 8 }}>{localized('Auto-lock')}</h6>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
            <label htmlFor="tierb-idle" style={{ marginRight: 8 }}>
              {localized('Lock after inactivity')}
            </label>
            <select id="tierb-idle" value={String(config.idleMs)} onChange={this._onChangeIdle}>
              {IDLE_CHOICES_MIN.map((min) => (
                <option key={min} value={String(min * 60000)}>
                  {localized('%@ minutes', String(min))}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.lockOnSuspend}
                onChange={this._onToggleSuspend}
              />{' '}
              {localized('Lock when the computer sleeps')}
            </label>
          </div>
          <div style={{ marginTop: 4 }}>
            <label style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={config.lockOnScreenLock}
                onChange={this._onToggleScreenLock}
              />{' '}
              {localized('Lock when the screen locks')}
            </label>
          </div>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 12 }}
            onClick={this._onLockNow}
            aria-label={localized('Lock now')}
          >
            {localized('Lock now')}
          </button>
        </section>

        <section style={{ marginTop: 20 }}>
          <h6 style={{ marginBottom: 8 }}>{localized('Master password')}</h6>
          {mode === 'idle' && (
            <div>
              <button type="button" className="btn" onClick={() => this._resetForm('change')}>
                {localized('Change master password')}
              </button>
              <button
                type="button"
                className="btn"
                style={{ marginLeft: 8 }}
                onClick={() => this._resetForm('reveal')}
              >
                {localized('Show recovery code')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ marginLeft: 8 }}
                onClick={() => this._resetForm('disable')}
              >
                {localized('Disable master password')}
              </button>
            </div>
          )}
          {mode === 'change' && this._renderChangeForm()}
          {mode === 'reveal' && (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6, maxWidth: 480 }}>
                {localized(
                  'The original recovery code cannot be shown again. Confirm your password to generate a new one — the old code will stop working.'
                )}
              </div>
              {this._renderPasswordConfirmForm(localized('Generate new recovery code'), () =>
                this._onRevealRecovery()
              )}
            </>
          )}
          {mode === 'disable' && (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6, maxWidth: 480 }}>
                {localized(
                  'Disabling the master password reverts to Tier A — the database key is managed by the OS keychain again.'
                )}
              </div>
              {this._renderPasswordConfirmForm(
                localized('Disable master password'),
                () => this._onDisable(),
                true
              )}
            </>
          )}
        </section>
      </>
    );
  }

  render() {
    const { loaded, enabled, mode } = this.state;
    return (
      <div className="container-security" style={{ padding: '0 30px' }}>
        <section>
          <h6 style={{ marginBottom: 8 }}>{localized('Database master password (Tier B)')}</h6>
          <div style={{ fontSize: 12, opacity: 0.8, maxWidth: 520 }}>
            {localized(
              'The local database is always encrypted. Enabling a master password adds a second layer: the encryption key is wrapped with your password and the app must be unlocked on every launch. Recommended for regulated (KNF) deployments.'
            )}
          </div>
        </section>

        {!loaded && (
          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>{localized('Loading…')}</div>
        )}

        {loaded && !enabled && (
          <section style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              {localized('The master password is currently off.')}
            </div>
            {mode === 'idle' ? (
              <button type="button" className="btn" onClick={() => this._resetForm('enable')}>
                {localized('Set a master password')}
              </button>
            ) : (
              this._renderEnableForm()
            )}
          </section>
        )}

        {loaded && enabled && this._renderEnabledControls()}

        {this._renderRecoveryPanel()}
      </div>
    );
  }
}
