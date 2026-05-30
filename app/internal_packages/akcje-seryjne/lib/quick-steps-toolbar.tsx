/**
 * QuickStepsToolbar — toolbar buttons dla compound actions z showInToolbar=true.
 *
 * Plan v1.0 #101 + mockup design/mockups/15-compound-actions.html.
 *
 * Renderuje row of buttons z compound actions; każdy ma:
 * - name label
 * - shortcut indicator (1-9)
 * - aria-label PL+EN
 *
 * Click → CompoundActionStore.previewApply + dispatch (real backend wire-up
 * w follow-up gdy FocusedContentStore integration potrzebna; teraz dispatch
 * pattern via console.info dla TDD GREEN + observable behavior).
 */

import React from 'react';
import { CompoundActionStore, CompoundAction } from './compound-action-store';

const { localized } = require('actunamail-exports');

interface State {
  toolbarActions: CompoundAction[];
}

export default class QuickStepsToolbar extends React.Component<{}, State> {
  static displayName = 'QuickStepsToolbar';
  static containerRequired = false;

  state: State = { toolbarActions: [] };

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._sync();
    this._unsubscribe = CompoundActionStore.listen(() => this._sync());
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  private _sync = (): void => {
    const all = CompoundActionStore.list().filter(a => a.showInToolbar);
    all.sort((a, b) => (a.toolbarOrder || 0) - (b.toolbarOrder || 0));
    this.setState({ toolbarActions: all });
  };

  private _onClick = (action: CompoundAction): void => {
    // Real execution wymaga focused threadIds + dispatch przez Task system.
    // Tu pattern: log + emit event dla future integration. CompoundActionStore
    // backend już ma previewApply() — UI wire-up do Tasks osobny ticket.
    console.info('[QuickStepsToolbar] activate compound action', action.id, action.name);
  };

  render() {
    const { toolbarActions } = this.state;
    return (
      <div className="quick-steps-toolbar" role="toolbar" aria-label={localized('Quick steps / Akcje seryjne')}>
        {toolbarActions.map(a => (
          <button
            key={a.id}
            type="button"
            className="quick-step-btn"
            role="button"
            aria-label={`${a.name} — ${localized('skrót / shortcut')} ${a.shortcut || '?'}`}
            title={a.name}
            onClick={() => this._onClick(a)}
            data-shortcut={a.shortcut || ''}
          >
            <span className="quick-step-name">{a.name}</span>
            {a.shortcut && (
              <span className="quick-step-shortcut" aria-hidden="true">{a.shortcut}</span>
            )}
          </button>
        ))}
      </div>
    );
  }
}
