/**
 * CheatSheetOverlay — keyboard cheat sheet overlay (#109 plan v1.0).
 *
 * Wywoływany przez `?` keymap. Pokazuje grouped bindings z aktywnego preseta
 * (default / apple_mail / gmail / outlook).
 */

import React from 'react';
import { CheatSheetUIBus } from './cheatsheet-ui-bus';
import { KeyboardMappingStore } from './keyboard-mapping-store';
import { KeymapBinding } from './keymap-presets';

const { localized } = require('actunamail-exports');

interface State {
  open: boolean;
  groups: Record<string, KeymapBinding[]>;
}

export default class CheatSheetOverlay extends React.Component<{}, State> {
  static displayName = 'CheatSheetOverlay';
  static containerRequired = false;

  state: State = { open: false, groups: {} };

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._unsubscribe = CheatSheetUIBus.listen(() => this._sync());
    this._sync();
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  private _sync = (): void => {
    const open = CheatSheetUIBus.isOpen();
    let groups: Record<string, KeymapBinding[]> = {};
    if (open) {
      try {
        groups = KeyboardMappingStore.groupedByCategory();
      } catch (e) { /* */ }
    }
    this.setState({ open, groups });
  };

  private _close = (): void => { CheatSheetUIBus.close(); };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._close();
    }
  };

  render() {
    if (!this.state.open) return null;
    const ariaLabel = localized('Skróty klawiszowe / Keyboard shortcuts');
    const closeLabel = localized('Zamknij / Close');
    const categories = Object.keys(this.state.groups);
    return (
      <div
        className="cheatsheet-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={this._onKeyDown}
      >
        <header className="cheatsheet-header">
          <h2 className="cheatsheet-title">{ariaLabel}</h2>
          <button
            type="button"
            className="cheatsheet-close"
            aria-label={closeLabel}
            onClick={this._close}
          >×</button>
        </header>
        <div className="cheatsheet-body">
          {categories.map(cat => (
            <div key={cat} className="cheatsheet-section">
              <h3 className="cheatsheet-section-title">{cat}</h3>
              <ul className="cheatsheet-bindings">
                {this.state.groups[cat].map((b, i) => (
                  <li key={`${cat}-${i}`} className="cheatsheet-binding">
                    <kbd className="cheatsheet-shortcut">{b.shortcut}</kbd>
                    <span className="cheatsheet-label">{b.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="cheatsheet-empty">
              {localized('Brak skrótów / No shortcuts')}
            </p>
          )}
        </div>
      </div>
    );
  }
}
