/**
 * CleaningSuggestionsPanel — proactive panel z suggestions z analyzeForSuggestions
 * (#116 plan v1.0). Mockup: design/mockups/25-cleaning-suggestions.html.
 */

import React from 'react';
import { CleaningSuggestion } from './suggestions-engine';

const { localized } = require('actunamail-exports');

interface Props {
  suggestions?: CleaningSuggestion[];
  onDismiss?: (s: CleaningSuggestion) => void;
  onAct?: (s: CleaningSuggestion) => void;
}

export default class CleaningSuggestionsPanel extends React.Component<Props> {
  static displayName = 'CleaningSuggestionsPanel';
  static containerRequired = false;

  render() {
    const suggestions = this.props.suggestions || [];
    const ariaLabel = localized('Sugestie sprzątania / Cleaning suggestions');
    const emptyLabel = localized('Brak sugestii. / No cleaning suggestions.');
    const dismissLabel = localized('Odrzuć / Dismiss');
    const actLabel = localized('Wykonaj / Apply');
    return (
      <div className="cleaning-suggestions-panel" role="region" aria-label={ariaLabel}>
        <h3 className="cleaning-suggestions-title">{ariaLabel}</h3>
        {suggestions.length === 0 ? (
          <p className="cleaning-suggestions-empty">{emptyLabel}</p>
        ) : (
          <ul className="cleaning-suggestions-list">
            {suggestions.map((s) => (
              <li key={s.id} className="cleaning-suggestion-item">
                <div className="cleaning-suggestion-meta">
                  <span className="cleaning-suggestion-scope">
                    {s.scope === 'sender'
                      ? localized('Nadawca / Sender')
                      : localized('Domena / Domain')}
                    {': '}
                    <strong>{s.scopeValue}</strong>
                  </span>
                  <span className="cleaning-suggestion-count">
                    {s.count} {localized('wiadomości / messages')}
                  </span>
                  <span className="cleaning-suggestion-category">{s.category}</span>
                </div>
                <div className="cleaning-suggestion-actions">
                  <button
                    type="button"
                    className="cleaning-dismiss-btn"
                    aria-label={dismissLabel}
                    onClick={() => this.props.onDismiss?.(s)}
                  >
                    {dismissLabel}
                  </button>
                  <button
                    type="button"
                    className="cleaning-act-btn"
                    aria-label={actLabel}
                    onClick={() => this.props.onAct?.(s)}
                  >
                    {actLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
}
