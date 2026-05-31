/**
 * CentrumDniaPane — daily-focus side pane (#6 plan v1.0).
 *
 * 3 sekcje: calendar / tasks / mails. Otwierane przez CentrumDniaStore.openPane().
 *
 * "Maile dnia" (decyzja 46 follow-up, user 2026-05-31): pokazuje dzisiejsze
 * nieprzeczytane z INBOX + przypięte (Thread.pinned). Klik = focus wątku.
 * Kalendarz/Zadania czekają na osobne moduły (#31/#32) — celowo puste.
 */

import React from 'react';
import { CentrumDniaStore } from './centrum-dnia-store';

const {
  localized,
  DatabaseStore,
  Thread,
  CategoryStore,
  AccountStore,
  Actions,
} = require('actunamail-exports');
const moment = require('moment');

interface State {
  open: boolean;
  calendarCollapsed: boolean;
  tasksCollapsed: boolean;
  mailsCollapsed: boolean;
  mails: any[];
}

export default class CentrumDniaPane extends React.Component<{}, State> {
  static displayName = 'CentrumDniaPane';
  static containerRequired = false;

  state: State = {
    open: false,
    calendarCollapsed: false,
    tasksCollapsed: false,
    mailsCollapsed: false,
    mails: [],
  };

  private _unsubscribe: (() => void) | null = null;
  private _mounted = false;

  componentDidMount() {
    this._mounted = true;
    this._sync();
    if ((CentrumDniaStore as any).listen) {
      this._unsubscribe = (CentrumDniaStore as any).listen(() => this._sync());
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._unsubscribe) this._unsubscribe();
  }

  private _sync = (): void => {
    const open = CentrumDniaStore.isPaneOpen();
    this.setState({
      open,
      calendarCollapsed: CentrumDniaStore.isSectionCollapsed('calendar'),
      tasksCollapsed: CentrumDniaStore.isSectionCollapsed('tasks'),
      mailsCollapsed: CentrumDniaStore.isSectionCollapsed('mails'),
    });
    if (open) this._fetchMails();
  };

  // Dzisiejsze nieprzeczytane z INBOX + przypięte (przypięte pierwsze, dedup).
  private _fetchMails = async (): Promise<void> => {
    try {
      const accountIds = AccountStore.accountIds();
      const inboxCats = CategoryStore.getCategoriesWithRoles(accountIds, 'inbox') || [];
      const inboxIds = inboxCats.map((c: any) => c.id).filter(Boolean);
      const start = moment().startOf('day').valueOf();
      const end = moment().endOf('day').valueOf();

      const queries: Promise<any[]>[] = [];
      if (inboxIds.length > 0) {
        queries.push(
          DatabaseStore.findAll(Thread)
            .where([
              Thread.attributes.unread.equal(true),
              Thread.attributes.lastMessageReceivedTimestamp.greaterThan(start),
              Thread.attributes.lastMessageReceivedTimestamp.lessThan(end),
              Thread.attributes.categories.containsAny(inboxIds),
            ])
            .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
            .limit(25)
        );
      }
      queries.push(
        DatabaseStore.findAll(Thread)
          .where([Thread.attributes.pinned.equal(true)])
          .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
          .limit(25)
      );

      const results = await Promise.all(queries);
      const pinned = (inboxIds.length > 0 ? results[1] : results[0]) || [];
      const unread = inboxIds.length > 0 ? results[0] || [] : [];

      const seen = new Set<string>();
      const merged: any[] = [];
      for (const t of [...pinned, ...unread]) {
        if (t && t.id && !seen.has(t.id)) {
          seen.add(t.id);
          merged.push(t);
        }
      }
      if (this._mounted) this.setState({ mails: merged });
    } catch (e) {
      if (this._mounted) this.setState({ mails: [] });
    }
  };

  private _toggleSection = (section: 'calendar' | 'tasks' | 'mails'): void => {
    CentrumDniaStore.toggleSection(section);
  };

  private _openThread = (thread: any): void => {
    try {
      Actions.setFocus({ collection: 'thread', item: thread });
    } catch (e) {
      /* focus not available */
    }
  };

  private _close = (): void => {
    CentrumDniaStore.closePane();
  };

  private _renderMails() {
    const { mails } = this.state;
    if (mails.length === 0) {
      return (
        <div className="centrum-dnia-empty">{localized('Brak maili na dziś / No mails today')}</div>
      );
    }
    return mails.map((m) => (
      <button
        key={m.id}
        type="button"
        className={`centrum-dnia-mail-row${m.pinned ? ' pinned' : ''}`}
        onClick={() => this._openThread(m)}
        title={m.subject || ''}
      >
        {m.pinned ? <span className="centrum-dnia-mail-pin">📌</span> : null}
        <span className="centrum-dnia-mail-subject">
          {m.subject || localized('(brak tematu / no subject)')}
        </span>
      </button>
    ));
  }

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
          >
            ×
          </button>
        </header>
        <div className="centrum-dnia-sections">
          <section className="centrum-dnia-section centrum-dnia-section--calendar">
            <button
              className="centrum-dnia-section-toggle"
              onClick={() => this._toggleSection('calendar')}
            >
              {localized('Kalendarz / Calendar')}
            </button>
          </section>
          <section className="centrum-dnia-section centrum-dnia-section--tasks">
            <button
              className="centrum-dnia-section-toggle"
              onClick={() => this._toggleSection('tasks')}
            >
              {localized('Zadania / Tasks')}
            </button>
          </section>
          <section className="centrum-dnia-section centrum-dnia-section--mails">
            <button
              className="centrum-dnia-section-toggle"
              onClick={() => this._toggleSection('mails')}
            >
              {localized('Maile dnia / Today mails')}
            </button>
            {!this.state.mailsCollapsed ? (
              <div className="centrum-dnia-section-content">{this._renderMails()}</div>
            ) : null}
          </section>
        </div>
      </aside>
    );
  }
}
