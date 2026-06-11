/**
 * SlashCommandsDropdown — overlay z listą slash commands (#107 plan v1.0).
 *
 * Pojawia się gdy SlashUIBus.openWithQuery('') trigger'owany (przez composer
 * keymap "/" listener — wire-up osobny ticket integration). Filter po query
 * (substring na label/slug/keywords). Click → handler + close.
 */

import React from 'react';
import { SlashUIBus } from './slash-ui-bus';
import { SlashCommandRegistry, SlashCommand } from './slash-command-registry';

const { localized } = require('actunamail-exports');

interface State {
  open: boolean;
  query: string;
  matches: SlashCommand[];
}

export default class SlashCommandsDropdown extends React.Component<{}, State> {
  static displayName = 'SlashCommandsDropdown';
  static containerRequired = false;

  state: State = { open: false, query: '', matches: [] };

  private _unsubscribeBus: (() => void) | null = null;
  private _unsubscribeRegistry: (() => void) | null = null;

  componentDidMount() {
    this._unsubscribeBus = SlashUIBus.listen(() => this._sync());
    if ((SlashCommandRegistry as any).listen) {
      this._unsubscribeRegistry = (SlashCommandRegistry as any).listen(() => this._sync());
    }
    this._sync();
  }

  componentWillUnmount() {
    if (this._unsubscribeBus) this._unsubscribeBus();
    if (this._unsubscribeRegistry) this._unsubscribeRegistry();
  }

  private _sync = (): void => {
    const open = SlashUIBus.isOpen();
    const query = SlashUIBus.getQuery();
    const all = SlashCommandRegistry.list();
    const q = (query || '').toLowerCase();
    const matches = q
      ? all.filter((c) => {
          return (
            c.label.toLowerCase().includes(q) ||
            c.slug.toLowerCase().includes(q) ||
            (c.keywords || []).some((k) => k.toLowerCase().includes(q))
          );
        })
      : all;
    this.setState({ open, query, matches });
  };

  private _onItemClick = (cmd: SlashCommand): void => {
    try {
      cmd.handler();
    } catch (e) {
      /* swallow */
    }
    SlashUIBus.close();
  };

  render() {
    if (!this.state.open) return null;
    const ariaLabel = localized('Slash commands / Komendy slash');
    return (
      <div className="slash-commands-dropdown" role="listbox" aria-label={ariaLabel}>
        {this.state.matches.length === 0 && (
          <div className="slash-commands-empty">{localized('Brak dopasowań / No matches')}</div>
        )}
        {this.state.matches.map((cmd) => (
          <div
            key={cmd.slug}
            className="slash-command-item"
            role="option"
            aria-selected="false"
            onClick={() => this._onItemClick(cmd)}
          >
            <span className="slash-command-slug">/{cmd.slug}</span>
            <span className="slash-command-label">{cmd.label}</span>
            {cmd.description && <span className="slash-command-desc">{cmd.description}</span>}
          </div>
        ))}
      </div>
    );
  }
}
