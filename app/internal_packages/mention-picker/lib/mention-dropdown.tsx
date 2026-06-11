/**
 * MentionDropdown — @ trigger dropdown z search wyników (#108 plan v1.0).
 *
 * Pojawia się gdy MentionUIBus.openWithQuery(q) trigger'owany. Composer
 * keyboard '@' integration osobny ticket. Tu MVP: visible dropdown z
 * mention search results + click → buildMentionInsertion + close.
 */

import React from 'react';
import { MentionUIBus } from './mention-ui-bus';
import { searchMentionsWithFallback, buildMentionInsertion, MentionMatch } from './mention-engine';

const { localized } = require('actunamail-exports');

interface State {
  open: boolean;
  query: string;
  matches: MentionMatch[];
}

export default class MentionDropdown extends React.Component<{}, State> {
  static displayName = 'MentionDropdown';
  static containerRequired = false;

  state: State = { open: false, query: '', matches: [] };

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._unsubscribe = MentionUIBus.listen(() => this._sync());
    this._sync();
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  private _sync = (): void => {
    const open = MentionUIBus.isOpen();
    const query = MentionUIBus.getQuery();
    const matches = open ? searchMentionsWithFallback(query, 8) || [] : [];
    this.setState({ open, query, matches });
  };

  private _onItemClick = (match: MentionMatch): void => {
    try {
      buildMentionInsertion(match, 'to');
    } catch (e) {
      /* swallow */
    }
    MentionUIBus.close();
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      MentionUIBus.close();
    }
  };

  render() {
    if (!this.state.open) return null;
    const ariaLabel = localized('Wzmiankuj osobę / Mention person');
    return (
      <div
        className="mention-dropdown"
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={this._onKeyDown}
      >
        {this.state.matches.length === 0 && (
          <div className="mention-empty">{localized('Brak dopasowań / No matches')}</div>
        )}
        {this.state.matches.map((m, idx) => (
          <div
            key={`${m.entry?.email || m.email || idx}`}
            className="mention-item"
            role="option"
            aria-selected="false"
            onClick={() => this._onItemClick(m)}
          >
            <span className="mention-name">{m.displayName}</span>
            {m.email && <span className="mention-email">{m.email}</span>}
          </div>
        ))}
      </div>
    );
  }
}
