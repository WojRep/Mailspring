/**
 * PgpEncryptButton — przycisk szyfrowania w composer toolbar (#112 plan v1.0).
 *
 * Enabled gdy PgpKeyStore.canEncryptToAll(recipients).ok.
 * Disabled gdy brak public key dla któregoś z recipients.
 */

import React from 'react';
import { PgpKeyStore } from './pgp-key-store';

const { localized } = require('actunamail-exports');

interface Props {
  recipients?: string[];
}

interface State {
  enabled: boolean;
  active: boolean;
}

export default class PgpEncryptButton extends React.Component<Props, State> {
  static displayName = 'PgpEncryptButton';
  static containerRequired = false;

  state: State = { enabled: false, active: false };

  componentDidMount() {
    this._sync();
  }
  componentDidUpdate(prev: Props) {
    if (JSON.stringify(prev.recipients || []) !== JSON.stringify(this.props.recipients || [])) {
      this._sync();
    }
  }

  private _sync = (): void => {
    const recipients = this.props.recipients || [];
    if (recipients.length === 0) {
      this.setState({ enabled: false });
      return;
    }
    let enabled = false;
    try {
      const check = PgpKeyStore.canEncryptToAll(recipients);
      enabled = !!(check && check.ok);
    } catch (e) {
      enabled = false;
    }
    this.setState({ enabled });
  };

  private _onClick = (): void => {
    this.setState({ active: !this.state.active });
    // Real encryption hook = osobny ticket (composer event integration)
  };

  render() {
    const recipients = this.props.recipients || [];
    if (recipients.length === 0) return null;
    const ariaLabel = this.state.enabled
      ? localized('Szyfruj wiadomość PGP / Encrypt message with PGP')
      : localized(
          'Szyfrowanie niedostępne — brak klucza publicznego / Encryption unavailable — no public key'
        );
    return (
      <button
        type="button"
        className={`pgp-encrypt-button ${this.state.active ? 'pgp-encrypt-button--active' : ''}`}
        role="button"
        aria-label={ariaLabel}
        aria-pressed={this.state.active}
        title={ariaLabel}
        disabled={!this.state.enabled}
        onClick={this._onClick}
      >
        <span className="pgp-encrypt-icon" aria-hidden="true">
          🔒
        </span>
        <span className="pgp-encrypt-label">{localized('Szyfruj / Encrypt')}</span>
      </button>
    );
  }
}
