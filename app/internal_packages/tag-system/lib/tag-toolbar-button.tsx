/**
 * TagToolbarButton — inline button "Dodaj tag" w thread toolbar (#98 Wave 5).
 *
 * Mounted via ComponentRegistry role='ThreadActionsToolbarButton'. Click
 * otwiera TagPicker via TagSystemUIBus.
 *
 * Address user-reported gap (verbatim 2026-05-30): 'Nie widzę możliwości
 * dodawania tagów'. Wcześniej tag dodawanie tylko przez Cmd+L shortcut +
 * Cmd+K palette — bez discoverable affordance.
 */

import React from 'react';
import { PropTypes } from 'actunamail-exports';
import { TagSystemUIBus } from './tag-system-ui-bus';

const { localized } = require('actunamail-exports');

interface Props {
  items?: any[];
}

export default class TagToolbarButton extends React.Component<Props> {
  static displayName = 'TagToolbarButton';
  static containerRequired = false;
  static propTypes = {
    items: PropTypes.array,
  };

  private _focusedThreadId(): string | null {
    const items = this.props.items || [];
    if (items.length === 0) return null;
    const first = items[0];
    return first && first.id ? first.id : null;
  }

  private _onClick = (): void => {
    const id = this._focusedThreadId();
    if (!id) return;
    TagSystemUIBus.openPicker(id);
  };

  render() {
    const id = this._focusedThreadId();
    if (!id) return null;
    const label = localized('Dodaj tag / Add tag');
    return (
      <button
        type="button"
        tabIndex={-1}
        className="btn btn-toolbar tag-toolbar-button"
        title={`${label} (⌘L)`}
        aria-label={label}
        onClick={this._onClick}
      >
        <span aria-hidden="true" style={{ fontSize: '14px' }}>
          🏷️
        </span>
      </button>
    );
  }
}
