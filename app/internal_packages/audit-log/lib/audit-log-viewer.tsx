/**
 * AuditLogViewer — Preferences > Privacy > Audit log viewer (#114 plan v1.0).
 */

import React from 'react';
import { AuditLogStore, AuditEntry } from './audit-log-store';

const { localized } = require('actunamail-exports');

interface State {
  entries: AuditEntry[];
}

export default class AuditLogViewer extends React.Component<{}, State> {
  static displayName = 'AuditLogViewer';
  static containerRequired = false;

  state: State = { entries: [] };

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._sync();
    if ((AuditLogStore as any).listen) {
      this._unsubscribe = (AuditLogStore as any).listen(() => this._sync());
    }
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  private _sync = (): void => {
    const entries = AuditLogStore.list ? AuditLogStore.list().slice(0, 200) : [];
    this.setState({ entries });
  };

  render() {
    const ariaLabel = localized('Dziennik audytu / Audit log');
    return (
      <div className="audit-log-viewer" role="region" aria-label={ariaLabel}>
        <header className="audit-log-header">
          <h3 className="audit-log-title">{ariaLabel}</h3>
        </header>
        {this.state.entries.length === 0 ? (
          <p className="audit-log-empty">{localized('Brak wpisów / No entries')}</p>
        ) : (
          <table className="audit-log-table">
            <thead>
              <tr>
                <th>{localized('Czas / Time')}</th>
                <th>{localized('Aktor / Actor')}</th>
                <th>{localized('Subsystem')}</th>
                <th>{localized('Zdarzenie / Event')}</th>
                <th>{localized('Szczegóły / Detail')}</th>
              </tr>
            </thead>
            <tbody>
              {this.state.entries.map((e: any, i: number) => (
                <tr key={`${e.timestamp}-${i}`} className="audit-log-row">
                  <td>{new Date(e.timestamp).toLocaleString()}</td>
                  <td>{e.actor}</td>
                  <td>{e.subsystem}</td>
                  <td>{e.eventType}</td>
                  <td>{e.detail || (e.context ? JSON.stringify(e.context) : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }
}
