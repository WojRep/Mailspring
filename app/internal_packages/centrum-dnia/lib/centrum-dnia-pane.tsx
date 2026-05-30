/**
 * CentrumDniaPane — daily-focus side pane (#6 plan v1.0).
 *
 * 3 sections: calendar / tasks / mails. Open via CentrumDniaStore.openPane().
 */

import React from 'react';
import { CentrumDniaStore } from './centrum-dnia-store';

const { localized } = require('actunamail-exports');

interface State {
  open: boolean;
  calendarCollapsed: boolean;
  tasksCollapsed: boolean;
  mailsCollapsed: boolean;
}

export default class CentrumDniaPane extends React.Component<{}, State> {
  static displayName = 'CentrumDniaPane';
  static containerRequired = false;

  state: State = { open: false, calendarCollapsed: false, tasksCollapsed: false, mailsCollapsed: false };

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._sync();
    if ((CentrumDniaStore as any).listen) {
      this._unsubscribe = (CentrumDniaStore as any).listen(() => this._sync());
    }
  }

  componentWillUnmount() { if (this._unsubscribe) this._unsubscribe(); }

  private _sync = (): void => {
    this.setState({
      open: CentrumDniaStore.isPaneOpen(),
      calendarCollapsed: CentrumDniaStore.isSectionCollapsed('calendar'),
      tasksCollapsed: CentrumDniaStore.isSectionCollapsed('tasks'),
      mailsCollapsed: CentrumDniaStore.isSectionCollapsed('mails'),
    });
  };

  private _toggleSection = (section: 'calendar' | 'tasks' | 'mails'): void => {
    CentrumDniaStore.toggleSection(section);
  };

  private _close = (): void => { CentrumDniaStore.closePane(); };

  render() {
    if (!this.state.open) return null;
    return (
      <aside
        className="centrum-dnia-pane"
        role="complementary"
        aria-label={localized('Centrum dnia / Day center')}
      >
        <header className="centrum-dnia-header">
          <h3 className="centrum-dnia-title">{localized('Centrum dnia / Day center')}</h3>
          <button
            type="button"
            className="centrum-dnia-close"
            aria-label={localized('Zamknij / Close')}
            onClick={this._close}
          >×</button>
        </header>
        <div className="centrum-dnia-sections">
          <section className="centrum-dnia-section centrum-dnia-section--calendar">
            <button className="centrum-dnia-section-toggle" onClick={() => this._toggleSection('calendar')}>
              {localized('Kalendarz / Calendar')}
            </button>
          </section>
          <section className="centrum-dnia-section centrum-dnia-section--tasks">
            <button className="centrum-dnia-section-toggle" onClick={() => this._toggleSection('tasks')}>
              {localized('Zadania / Tasks')}
            </button>
          </section>
          <section className="centrum-dnia-section centrum-dnia-section--mails">
            <button className="centrum-dnia-section-toggle" onClick={() => this._toggleSection('mails')}>
              {localized('Maile dnia / Today mails')}
            </button>
          </section>
        </div>
      </aside>
    );
  }
}
