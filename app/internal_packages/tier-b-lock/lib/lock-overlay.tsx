/* eslint global-require: 0 */
import React from 'react';
import { localized } from 'actunamail-exports';

const { ipcRenderer } = require('electron');

interface LockOverlayState {
  locked: boolean;
  secret: string;
  recoveryMode: boolean;
  error: string | null;
  busy: boolean;
  rememberPassword: boolean;
  // Ticket #41 — biometric availability snapshot (3-state: still loading,
  // available, unavailable). Polled on lock to keep UI deterministic.
  biometric: { available: boolean; cached: boolean; enabled: boolean } | null;
}

/**
 * Ticket 46c — full-viewport lock overlay (SQLCipher Tier B).
 *
 * Rendered above the entire main window when the database is locked
 * (idle timeout / suspend / screen-lock / "Lock now"). Hides thread
 * list, reading pane, composer and message snippets behind an opaque
 * surface, and offers a master-password / recovery-code field. The
 * password is verified in the main process via the `tier-b-unlock`
 * IPC channel (Argon2id unwrap); a correct password broadcasts
 * UNLOCKED, which clears the overlay.
 */
export default class LockOverlay extends React.Component<{}, LockOverlayState> {
  state: LockOverlayState = {
    locked: false,
    secret: '',
    recoveryMode: false,
    error: null,
    busy: false,
    rememberPassword: false,
    biometric: null,
  };

  componentDidMount() {
    ipcRenderer.on('db-lock-state-changed', this._onLockStateChanged);
    // Pick up a lock that fired before this component mounted.
    ipcRenderer
      .invoke('tier-b-status')
      .then((status: any) => {
        if (status && status.locked) {
          this.setState({ locked: true });
        }
      })
      .catch(() => {});
  }

  componentWillUnmount() {
    ipcRenderer.removeListener('db-lock-state-changed', this._onLockStateChanged);
  }

  _onLockStateChanged = (_evt: any, payload: any) => {
    if (payload && payload.state === 'LOCKED') {
      this.setState({ locked: true, secret: '', error: null, busy: false });
      this._refreshBiometricStatus();
    } else if (payload && payload.state === 'UNLOCKED') {
      this.setState({ locked: false, secret: '', error: null, busy: false });
    }
  };

  /**
   * Ticket #41 — fetch current biometric availability (canPromptTouchID +
   * cache present + user opt-in) so the overlay can show the "Use Touch ID"
   * shortcut. Best-effort: null state hides the button silently.
   */
  _refreshBiometricStatus = () => {
    ipcRenderer
      .invoke('tier-b-biometric-status')
      .then((status: any) => {
        if (status && typeof status === 'object') {
          this.setState({ biometric: status });
        }
      })
      .catch(() => {
        this.setState({ biometric: { available: false, cached: false, enabled: false } });
      });
  };

  _onTouchIDClick = async () => {
    if (this.state.busy) return;
    this.setState({ busy: true, error: null });
    try {
      const res = await ipcRenderer.invoke(
        'tier-b-unlock-touch-id',
        localized('unlock ActunaMail')
      );
      if (res && res.ok) {
        this.setState({ locked: false, busy: false });
      } else {
        this.setState({
          busy: false,
          error: (res && res.error) || localized('Touch ID unlock failed.'),
        });
      }
    } catch (err) {
      this.setState({ busy: false, error: localized('Touch ID unlock failed.') });
    }
  };

  _onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { secret, recoveryMode, rememberPassword, biometric } = this.state;
    if (!secret) return;
    this.setState({ busy: true, error: null });
    const channel = recoveryMode ? 'tier-b-unlock-recovery' : 'tier-b-unlock';
    const options =
      !recoveryMode && rememberPassword && biometric && biometric.enabled && biometric.available
        ? { cacheForBiometric: true }
        : undefined;
    try {
      const res = await ipcRenderer.invoke(channel, secret, options);
      if (res && res.ok) {
        // The main process broadcasts UNLOCKED; _onLockStateChanged
        // clears the overlay. Clear the secret immediately regardless.
        this.setState({ locked: false, secret: '', busy: false });
      } else {
        this.setState({
          busy: false,
          secret: '',
          error: (res && res.error) || localized('Incorrect master password or recovery code.'),
        });
      }
    } catch (err) {
      this.setState({ busy: false, error: localized('Unlock failed. Please try again.') });
    }
  };

  render() {
    const { locked, secret, recoveryMode, error, busy, rememberPassword, biometric } = this.state;
    if (!locked) return null;
    // Ticket #41 — pokazuj Touch ID przycisk tylko gdy: enabled w
    // Preferences, hardware dostępne, cache obecny w configDir.
    const showTouchID =
      biometric && biometric.enabled && biometric.available && biometric.cached && !recoveryMode;
    // Pokazuj "Remember password" tylko gdy enabled + dostępny, ale jeszcze
    // brak cache (po pierwszym opt-in unlock).
    const showRememberOption =
      biometric && biometric.enabled && biometric.available && !biometric.cached && !recoveryMode;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={localized('ActunaMail is locked')}
        style={
          {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100000,
            background: '#23272e',
            color: '#f4f4f4',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            WebkitUserSelect: 'none',
            WebkitAppRegion: 'drag',
          } as any
        }
      >
        <div style={{ WebkitAppRegion: 'no-drag', width: 320, textAlign: 'center' } as any}>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
            {localized('ActunaMail is locked')}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 18 }}>
            {recoveryMode
              ? localized('Enter your recovery code to unlock.')
              : localized('Enter your master password to unlock.')}
          </div>
          <form onSubmit={this._onSubmit}>
            <input
              type={recoveryMode ? 'text' : 'password'}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-label={recoveryMode ? localized('Recovery code') : localized('Master password')}
              value={secret}
              onChange={(e) => this.setState({ secret: e.target.value })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                fontSize: 14,
                borderRadius: 4,
                border: '1px solid #555',
                background: '#1b1e24',
                color: '#f4f4f4',
              }}
            />
            <div style={{ color: '#ff7a7a', fontSize: 12, minHeight: 16, marginTop: 8 }}>
              {error || ''}
            </div>
            {showRememberOption && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 12,
                  marginTop: 4,
                  cursor: 'pointer',
                  opacity: 0.85,
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => this.setState({ rememberPassword: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                {localized('Remember password (Touch ID)')}
              </label>
            )}
            <button
              type="submit"
              disabled={busy || !secret}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '8px 0',
                fontSize: 14,
                borderRadius: 4,
                border: 'none',
                background: '#4087f2',
                color: '#fff',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy || !secret ? 0.5 : 1,
              }}
            >
              {busy ? localized('Unlocking…') : localized('Unlock')}
            </button>
          </form>
          {showTouchID && (
            <button
              type="button"
              className="touch-id-unlock-button"
              onClick={this._onTouchIDClick}
              disabled={busy}
              style={{
                marginTop: 10,
                width: '100%',
                padding: '8px 0',
                fontSize: 13,
                borderRadius: 4,
                border: '1px solid #4087f2',
                background: 'transparent',
                color: '#7fa8f0',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
              aria-label={localized('Unlock with Touch ID')}
            >
              {localized('Unlock with Touch ID')}
            </button>
          )}
          <a
            role="button"
            tabIndex={0}
            onClick={() => this.setState({ recoveryMode: !recoveryMode, secret: '', error: null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                this.setState({ recoveryMode: !recoveryMode, secret: '', error: null });
              }
            }}
            style={{
              display: 'inline-block',
              marginTop: 14,
              fontSize: 12,
              color: '#7fa8f0',
              cursor: 'pointer',
            }}
          >
            {recoveryMode ? localized('Use master password') : localized('Use recovery code')}
          </a>
        </div>
      </div>
    );
  }
}
