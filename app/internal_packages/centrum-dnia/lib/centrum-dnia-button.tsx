/**
 * CentrumDniaButton — inline button "Centrum dnia" w thread toolbar (#95).
 *
 * Mounted via ComponentRegistry role='ThreadActionsToolbarButton' żeby user
 * widział affordance bez konieczności znajomości Cmd+Shift+D shortcut.
 * Click toggle pane (CentrumDniaStore.togglePane).
 *
 * Address user-reported gap (verbatim 2026-05-30): 'Nie widzę możliwości ...
 * czy punktu skupienia dla nich' — Centrum dnia był overlay-only.
 */

import React from 'react';
import { CentrumDniaStore } from './centrum-dnia-store';

const { localized } = require('actunamail-exports');

export default class CentrumDniaButton extends React.Component {
  static displayName = 'CentrumDniaButton';
  static containerRequired = false;

  private _onClick = (): void => {
    CentrumDniaStore.togglePane();
  };

  render() {
    const label = localized('Centrum dnia / Today pane');
    return (
      <button
        type="button"
        tabIndex={-1}
        className="btn btn-toolbar centrum-dnia-button"
        title={`${label} (⌘⇧D)`}
        aria-label={label}
        onClick={this._onClick}
      >
        <span aria-hidden="true" style={{ fontSize: '14px' }}>🎯</span>
      </button>
    );
  }
}
