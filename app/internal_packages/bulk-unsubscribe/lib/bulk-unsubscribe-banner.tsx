/**
 * BulkUnsubscribeBanner — banner w MessageList:Header gdy thread ma
 * List-Unsubscribe header (RFC 2369 / RFC 8058 #115).
 *
 * Plan v1.0 mockup design/mockups/24-bulk-unsubscribe.html.
 *
 * Funkcje:
 *  - Renderuje banner z sender info + "Wypisz / Unsubscribe" button
 *  - 1-click → SubscriptionStore.markSent (audit log entry)
 *  - role="region" + aria-label PL+EN
 *  - Hide gdy brak thread lub brak List-Unsubscribe header
 */

import React from 'react';
import { SubscriptionStore } from './subscription-store';
import { parseListUnsubscribe } from './list-unsubscribe-parser';

const { localized } = require('actunamail-exports');

interface Props {
  thread?: {
    id: string;
    sender?: string;
    headers?: Record<string, string>;
  };
}

interface State {
  dismissed: boolean;
}

export default class BulkUnsubscribeBanner extends React.Component<Props, State> {
  static displayName = 'BulkUnsubscribeBanner';
  static containerRequired = false;

  state: State = { dismissed: false };

  private _onUnsubscribe = (): void => {
    const sender = this.props.thread?.sender;
    if (!sender) return;
    try {
      SubscriptionStore.markSent(sender, { method: 'mailto' });
    } catch (e) {
      // Sender nie był recorded — silent (UI may have stale data)
    }
    this.setState({ dismissed: true });
  };

  private _onDismiss = (): void => {
    this.setState({ dismissed: true });
  };

  render() {
    const thread = this.props.thread;
    if (!thread) return null;
    const header = thread.headers && thread.headers['List-Unsubscribe'];
    if (!header) return null;
    if (this.state.dismissed) return null;

    const sender = thread.sender || localized('nieznany nadawca / unknown sender');
    const ariaLabel = localized('Wypisz z newslettera / Unsubscribe from mailing list');
    const unsubLabel = localized('Wypisz / Unsubscribe');
    const dismissLabel = localized('Ukryj / Dismiss');
    const fromLabel = localized('Newsletter od / Newsletter from');

    return (
      <div
        className="bulk-unsubscribe-banner"
        role="region"
        aria-label={ariaLabel}
      >
        <span className="bulk-unsubscribe-icon" aria-hidden="true">📬</span>
        <span className="bulk-unsubscribe-text">
          {fromLabel} <strong>{sender}</strong>
        </span>
        <button
          type="button"
          className="bulk-unsubscribe-action"
          onClick={this._onUnsubscribe}
          aria-label={unsubLabel}
        >
          {unsubLabel}
        </button>
        <button
          type="button"
          className="bulk-unsubscribe-dismiss"
          onClick={this._onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
        >
          ×
        </button>
      </div>
    );
  }
}
