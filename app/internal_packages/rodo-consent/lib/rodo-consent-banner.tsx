/**
 * RodoConsentBanner — composer banner gdy recipients bez consent (#113).
 *
 * Per ConsentStore.checkBulkSend(recipients): jeśli withoutConsent.length > 0 →
 * pokazuje banner z listą + "Grant consent" button per email.
 */

import React from 'react';
import { ConsentStore } from './consent-store';

const { localized } = require('actunamail-exports');

interface Props {
  recipients?: string[];
}

interface State {
  withoutConsent: string[];
  revoked: string[];
  dismissed: boolean;
}

export default class RodoConsentBanner extends React.Component<Props, State> {
  static displayName = 'RodoConsentBanner';
  static containerRequired = false;

  state: State = { withoutConsent: [], revoked: [], dismissed: false };

  componentDidMount() { this._sync(); }
  componentDidUpdate(prev: Props) {
    if (JSON.stringify(prev.recipients || []) !== JSON.stringify(this.props.recipients || [])) {
      this._sync();
    }
  }

  private _sync = (): void => {
    const recipients = this.props.recipients || [];
    if (recipients.length === 0) {
      this.setState({ withoutConsent: [], revoked: [] });
      return;
    }
    try {
      const r = ConsentStore.checkBulkSend(recipients);
      this.setState({ withoutConsent: r.withoutConsent, revoked: r.revoked });
    } catch (e) {
      this.setState({ withoutConsent: recipients, revoked: [] });
    }
  };

  private _onGrant = (email: string): void => {
    ConsentStore.grantConsent(email, { source: 'manual' });
    this._sync();
  };

  render() {
    if (this.state.dismissed) return null;
    if (this.state.withoutConsent.length === 0 && this.state.revoked.length === 0) return null;
    const ariaLabel = localized('Brak zgody RODO / Missing RODO/GDPR consent');
    const warningLabel = localized('Brak zgody marketingowej dla / Missing marketing consent for');
    const grantLabel = localized('Wyraź zgodę / Grant consent');
    return (
      <div
        className="rodo-consent-banner"
        role="region"
        aria-label={ariaLabel}
      >
        <div className="rodo-consent-icon" aria-hidden="true">⚖️</div>
        <div className="rodo-consent-body">
          <div className="rodo-consent-title">{warningLabel}:</div>
          <ul className="rodo-consent-list">
            {this.state.withoutConsent.map(email => (
              <li key={email} className="rodo-consent-item">
                <span className="rodo-consent-email">{email}</span>
                <button
                  type="button"
                  className="rodo-grant-btn"
                  aria-label={`${grantLabel} ${email}`}
                  onClick={() => this._onGrant(email)}
                >{grantLabel}</button>
              </li>
            ))}
            {this.state.revoked.map(email => (
              <li key={email} className="rodo-consent-item rodo-consent-item--revoked">
                <span className="rodo-consent-email">{email}</span>
                <span className="rodo-revoked-marker">{localized('zgoda cofnięta / consent revoked')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
}
