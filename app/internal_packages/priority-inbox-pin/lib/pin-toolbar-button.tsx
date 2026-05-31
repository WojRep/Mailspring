/**
 * PinToolbarButton — inline button "Pin / Ważne" w thread toolbar (#93 Wave 3).
 *
 * Mounted via ComponentRegistry role='ThreadActionsToolbarButton'. Pokazuje
 * gwiazdkę lub pinezkę z labelem 'Ważne' / 'Pin'. Click toggle.
 *
 * Address user-reported gap (verbatim 2026-05-30): 'Nie widzę możliwości ...
 * ustawień wazności emaili'. Wcześniej dostępne tylko przez Shift+P shortcut
 * + Cmd+K palette — bez discoverable affordance.
 */

import React from 'react';
import { PropTypes } from 'actunamail-exports';
import { PinStore } from './pin-store';

const { localized } = require('actunamail-exports');

interface Props {
  items?: any[];
}

interface State {
  pinned: boolean;
}

export default class PinToolbarButton extends React.Component<Props, State> {
  static displayName = 'PinToolbarButton';
  static containerRequired = false;
  static propTypes = {
    items: PropTypes.array,
  };

  state: State = { pinned: false };

  _unlisten: () => void = () => {};

  componentDidMount() {
    this._sync();
    this._unlisten = PinStore.listen(() => this._sync());
  }

  componentDidUpdate(prev: Props) {
    const lengthChanged = (prev.items || []).length !== (this.props.items || []).length;
    // Cross-device (#46): re-sync also when the focused thread's pinned flips
    // via a sync delta (same selection, new Thread.pinned).
    const pinnedChanged = this._modelPinned(prev) !== this._modelPinned(this.props);
    if (lengthChanged || pinnedChanged) {
      this._sync();
    }
  }

  componentWillUnmount() {
    this._unlisten();
  }

  private _focusedThreadId(): string | null {
    const items = this.props.items || [];
    if (items.length === 0) return null;
    const first = items[0];
    return first && first.id ? first.id : null;
  }

  // Synced model (Thread.pinned via IMAP `$Pinned`) is the cross-device source
  // of truth; the local PinStore cache is an instant fallback.
  private _modelPinned(props = this.props): boolean {
    const first = (props.items || [])[0];
    return !!(first && first.pinned);
  }

  private _sync = (): void => {
    const id = this._focusedThreadId();
    const pinned = this._modelPinned() || (id ? PinStore.isPinned(id) : false);
    this.setState({ pinned });
  };

  private _onClick = (): void => {
    const id = this._focusedThreadId();
    if (!id) return;
    PinStore.toggle(id);
    this._sync();
  };

  render() {
    const id = this._focusedThreadId();
    if (!id) return null;
    const label = this.state.pinned
      ? localized('Odepnij / Unpin')
      : localized('Przypnij jako ważne / Pin as important');
    const icon = this.state.pinned ? '📌' : '📍';
    return (
      <button
        type="button"
        tabIndex={-1}
        className={`btn btn-toolbar pin-toolbar-button pinned-${this.state.pinned}`}
        title={label}
        aria-label={label}
        aria-pressed={this.state.pinned}
        onClick={this._onClick}
      >
        <span aria-hidden="true" style={{ fontSize: '14px' }}>
          {icon}
        </span>
      </button>
    );
  }
}
