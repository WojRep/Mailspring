/**
 * FollowUpWaitingPanel — sidebar/panel z listą waiting threads (#106 plan v1.0).
 *
 * Mockup: design/mockups/18-follow-up-waiting.html.
 * Pokazuje threads ze status='pending' (outbound bez reply + over threshold).
 * Per row: recipient + subject + waiting days + Dismiss + Resolved buttons.
 */

import React from 'react';
import { FollowUpStore, WaitingEntry } from './follow-up-store';

const { localized } = require('actunamail-exports');

interface State {
  entries: WaitingEntry[];
}

function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
}

export default class FollowUpWaitingPanel extends React.Component<{}, State> {
  static displayName = 'FollowUpWaitingPanel';
  static containerRequired = false;

  state: State = { entries: [] };

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._sync();
    if ((FollowUpStore as any).listen) {
      this._unsubscribe = (FollowUpStore as any).listen(() => this._sync());
    }
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  private _sync = (): void => {
    const entries = FollowUpStore.listActive ? FollowUpStore.listActive() : [];
    this.setState({ entries });
  };

  private _onDismiss = (entry: WaitingEntry): void => {
    FollowUpStore.dismiss(entry.threadId);
  };

  private _onResolved = (entry: WaitingEntry): void => {
    FollowUpStore.markResolved(entry.threadId);
  };

  render() {
    const ariaLabel = localized('Oczekuje na odpowiedź / Waiting for reply');
    const emptyLabel = localized('Brak wiadomości oczekujących na odpowiedź. / No threads waiting for reply.');
    const dismissLabel = localized('Odrzuć / Dismiss');
    const resolvedLabel = localized('Załatwione / Resolved');
    const daysLabel = localized('dni temu / days ago');
    return (
      <div
        className="follow-up-waiting-panel"
        role="region"
        aria-label={ariaLabel}
      >
        <header className="follow-up-waiting-header">
          <h3 className="follow-up-waiting-title">{ariaLabel}</h3>
        </header>
        {this.state.entries.length === 0 ? (
          <p className="follow-up-waiting-empty">{emptyLabel}</p>
        ) : (
          <ul className="follow-up-waiting-list">
            {this.state.entries.map(e => (
              <li key={e.threadId} className="follow-up-waiting-item">
                <div className="follow-up-waiting-meta">
                  <span className="follow-up-waiting-recipient">{e.recipient || '?'}</span>
                  <span className="follow-up-waiting-subject">{e.subject || '(no subject)'}</span>
                  <span className="follow-up-waiting-days">
                    {daysSince(e.lastOutboundAt)} {daysLabel}
                  </span>
                </div>
                <div className="follow-up-waiting-actions">
                  <button
                    type="button"
                    className="follow-up-dismiss-btn"
                    aria-label={dismissLabel}
                    onClick={() => this._onDismiss(e)}
                  >{dismissLabel}</button>
                  <button
                    type="button"
                    className="follow-up-resolved-btn"
                    aria-label={resolvedLabel}
                    onClick={() => this._onResolved(e)}
                  >{resolvedLabel}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
}
