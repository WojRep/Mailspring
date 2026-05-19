/* eslint global-require: 0 */
import React from 'react';
import ReactDOM from 'react-dom';
import LockOverlay from './lock-overlay';

// Ticket 46c — SQLCipher Tier B lock overlay.
//
// Mounted into a dedicated full-viewport container appended to the
// document body (outside the WorkspaceStore sheet system) so it can
// cover thread list, reading pane and composer when the database is
// locked at runtime. Driven by the `db-lock-state-changed` IPC event
// broadcast from application.ts (ticket 46b).

const CONTAINER_ID = 'tier-b-lock-overlay-root';

export function activate() {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    document.body.appendChild(container);
  }
  ReactDOM.render(React.createElement(LockOverlay), container);
}

export function deactivate() {
  const container = document.getElementById(CONTAINER_ID);
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  }
}

export function serialize() {}
