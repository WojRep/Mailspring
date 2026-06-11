/**
 * Cmd+K Command Palette — React modal component.
 *
 * Bilet MVP #89 (foundation tier).
 *
 * Renderowane jako overlay nad całą aplikacją gdy CommandPaletteStore.isOpen().
 * - role="dialog" + aria-modal="true" + aria-label
 * - Focus trap (focused input domyślnie)
 * - Esc → close + restore focus
 * - ↑↓ navigation, Enter execute, Tab autocomplete
 * - Glass surface (actuna-glass z #92) — fallback solid via prefers-reduced-transparency
 * - Sections per command.section
 *
 * Mockup referencyjny: plan_to_version_1.0/design/mockups/03-cmd-k-palette.html
 */

import React from 'react';
import { CommandPaletteStore, PaletteCommand } from './command-palette-store';
import { fuzzyFilter } from './fuzzy-match';

const { localized } = require('actunamail-exports');

interface State {
  open: boolean;
  query: string;
  selectedIndex: number;
  commands: PaletteCommand[];
  // restore focus on close
  previousActiveElement: Element | null;
}

export default class CommandPalette extends React.Component<{}, State> {
  static displayName = 'CommandPalette';

  state: State = {
    open: false,
    query: '',
    selectedIndex: 0,
    commands: [],
    previousActiveElement: null,
  };

  private _unsubscribe: (() => void) | null = null;
  private _inputRef = React.createRef<HTMLInputElement>();
  private _itemsRef = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this._unsubscribe = CommandPaletteStore.listen(() => this._syncFromStore());
    this._syncFromStore();
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  componentDidUpdate(_: {}, prevState: State) {
    // On open: focus input
    if (this.state.open && !prevState.open) {
      setTimeout(() => this._inputRef.current?.focus(), 0);
    }
    // On close: restore focus
    if (!this.state.open && prevState.open && prevState.previousActiveElement) {
      const el = prevState.previousActiveElement as HTMLElement;
      if (el && typeof el.focus === 'function') {
        try {
          el.focus();
        } catch (e) {
          /* element no longer in DOM */
        }
      }
    }
    // Scroll selected item into view
    if (this.state.open && this.state.selectedIndex !== prevState.selectedIndex) {
      this._scrollSelectedIntoView();
    }
  }

  private _syncFromStore() {
    const open = CommandPaletteStore.isOpen();
    const previousActiveElement =
      open && !this.state.open ? document.activeElement : this.state.previousActiveElement;
    this.setState({
      open,
      query: CommandPaletteStore.getQuery(),
      selectedIndex: CommandPaletteStore.getSelectedIndex(),
      commands: CommandPaletteStore.getCommands(),
      previousActiveElement,
    });
  }

  private _scrollSelectedIntoView() {
    const container = this._itemsRef.current;
    if (!container) return;
    const selected = container.querySelector('.command-palette-item.focused') as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  private _onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    CommandPaletteStore.setQuery(e.target.value);
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const filtered = this._getFilteredCommands();
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        CommandPaletteStore.close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        CommandPaletteStore.setSelectedIndex(
          Math.min(filtered.length - 1, this.state.selectedIndex + 1)
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        CommandPaletteStore.setSelectedIndex(Math.max(0, this.state.selectedIndex - 1));
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (filtered[this.state.selectedIndex]) {
          CommandPaletteStore.execute(filtered[this.state.selectedIndex].item.id);
        }
        break;
      case 'Home':
        e.preventDefault();
        CommandPaletteStore.setSelectedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        CommandPaletteStore.setSelectedIndex(filtered.length - 1);
        break;
    }
  };

  private _onItemClick = (id: string) => {
    CommandPaletteStore.execute(id);
  };

  private _onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      CommandPaletteStore.close();
    }
  };

  private _getFilteredCommands() {
    return fuzzyFilter(this.state.query, this.state.commands);
  }

  render() {
    if (!this.state.open) return null;

    const filtered = this._getFilteredCommands();
    const totalAvailable = this.state.commands.length;

    // Group by section dla wyświetlania
    const sections: { [section: string]: typeof filtered } = {};
    for (const m of filtered) {
      const sec = m.item.section || localized('Other');
      if (!sections[sec]) sections[sec] = [];
      sections[sec].push(m);
    }
    const sectionNames = Object.keys(sections);

    // Calculate global index dla selected highlighting
    let globalIdx = 0;

    return (
      <div className="command-palette-backdrop" onClick={this._onBackdropClick} role="presentation">
        <div
          className="command-palette actuna-glass"
          role="dialog"
          aria-modal="true"
          aria-label={localized('Command palette')}
          onKeyDown={this._onKeyDown}
        >
          <div className="command-palette-search">
            <span className="command-palette-icon" aria-hidden="true">
              ⌘
            </span>
            <input
              ref={this._inputRef}
              className="command-palette-input"
              type="text"
              value={this.state.query}
              onChange={this._onQueryChange}
              placeholder={localized('Wpisz akcję, kontakt lub wątek… / Type a command…')}
              aria-label={localized('Search commands')}
              aria-autocomplete="list"
              aria-controls="command-palette-results"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <span className="command-palette-hint">
              <kbd>esc</kbd>
            </span>
          </div>

          <div
            ref={this._itemsRef}
            className="command-palette-results"
            id="command-palette-results"
            role="listbox"
            aria-label={localized('Available commands')}
          >
            {filtered.length === 0 && (
              <div className="command-palette-empty">
                {localized('Brak dopasowań / No matches for')} <strong>"{this.state.query}"</strong>
              </div>
            )}
            {sectionNames.map((sec) => (
              <div key={sec} className="command-palette-section-group">
                <div className="command-palette-section" role="presentation">
                  {sec}
                </div>
                {sections[sec].map(({ item }) => {
                  const isSelected = globalIdx === this.state.selectedIndex;
                  const currentIdx = globalIdx;
                  globalIdx++;
                  return (
                    <div
                      key={item.id}
                      className={`command-palette-item ${isSelected ? 'focused' : ''}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => this._onItemClick(item.id)}
                      onMouseEnter={() => CommandPaletteStore.setSelectedIndex(currentIdx)}
                      data-command-id={item.id}
                    >
                      <div className="command-palette-item-icon" aria-hidden="true">
                        {item.icon || '•'}
                      </div>
                      <div className="command-palette-item-label">
                        <span className="command-palette-item-main">{item.label}</span>
                        {item.description && (
                          <span className="command-palette-item-meta">{item.description}</span>
                        )}
                      </div>
                      {item.shortcut && (
                        <div className="command-palette-item-keys" aria-hidden="true">
                          {item.shortcut.map((k, i) => (
                            <kbd key={i}>{k}</kbd>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="command-palette-footer">
            <span className="command-palette-footer-keys">
              <kbd>↑</kbd>
              <kbd>↓</kbd> {localized('nawigacja')}
            </span>
            <span className="command-palette-footer-keys">
              <kbd>↵</kbd> {localized('wykonaj')}
            </span>
            <span className="command-palette-footer-keys">
              <kbd>esc</kbd> {localized('zamknij')}
            </span>
            <span className="command-palette-footer-status" aria-live="polite">
              {filtered.length} {localized('z')} {totalAvailable} {localized('komend')}
            </span>
          </div>
        </div>
      </div>
    );
  }
}
