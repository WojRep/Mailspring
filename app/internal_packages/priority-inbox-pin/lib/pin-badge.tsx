/**
 * PinBadge — inline pin indicator per thread row.
 *
 * Bilet MVP #93. Mockup: design/mockups/02-inbox-task-queue.html.
 *
 * Renderuje `📌` gdy `PinStore.isPinned(thread.id)`. Klik / Enter / Space toggles.
 *
 * Mounted w thread row via ComponentRegistry slot `role: 'ThreadListIcon'` —
 * istniejący Mailspring slot który exposes `thread` prop (obok ⭐ icon).
 * Accepts either `thread` (z slot) lub `threadId` (test-friendly).
 */

import React from 'react';
import { PinStore } from './pin-store';

const { localized } = require('actunamail-exports');

interface Props {
  thread?: { id: string };
  threadId?: string;
}

interface State {
  pinned: boolean;
}

export default class PinBadge extends React.Component<Props, State> {
  static displayName = 'PinBadge';
  static containerRequired = false;
  state: State = { pinned: false };

  private _unsubscribe: (() => void) | null = null;

  private _getThreadId(props = this.props): string | null {
    if (props.thread && props.thread.id) return props.thread.id;
    if (props.threadId) return props.threadId;
    return null;
  }

  componentDidMount() {
    this._unsubscribe = PinStore.listen(() => this._sync());
    this._sync();
  }

  componentDidUpdate(prevProps: Props) {
    if (this._getThreadId(prevProps) !== this._getThreadId(this.props)) {
      this._sync();
    }
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  private _sync = (): void => {
    const tid = this._getThreadId();
    this.setState({ pinned: tid ? PinStore.isPinned(tid) : false });
  };

  private _onToggle = (e: React.MouseEvent | React.KeyboardEvent): void => {
    e.stopPropagation();
    const tid = this._getThreadId();
    if (tid) PinStore.toggle(tid);
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._onToggle(e);
    }
  };

  render() {
    if (!this.state.pinned) return null;
    const label = localized(
      'Przypięty wątek — kliknij aby odpiąć / Pinned thread — click to unpin',
    );
    return (
      <span
        className="pin-badge"
        role="img"
        aria-label={label}
        title={label}
        tabIndex={0}
        onClick={this._onToggle}
        onKeyDown={this._onKeyDown}
      >
        📌
      </span>
    );
  }
}
