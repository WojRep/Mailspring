/**
 * TimeIntentBadge — badge w thread row pokazujący current intent (#13 plan v1.0).
 */

import React from 'react';
import { TimeIntentStore, TimeIntent } from './time-intent-store';

const { localized } = require('actunamail-exports');

interface Props {
  threadId?: string;
}

interface State {
  intent: TimeIntent | undefined;
}

const LABELS: Record<TimeIntent, { pl: string; en: string; cls: string }> = {
  today: { pl: 'Dziś', en: 'Today', cls: 'today' },
  upcoming: { pl: 'Wkrótce', en: 'Upcoming', cls: 'upcoming' },
  anytime: { pl: 'Kiedyś', en: 'Anytime', cls: 'anytime' },
};

export default class TimeIntentBadge extends React.Component<Props, State> {
  static displayName = 'TimeIntentBadge';
  static containerRequired = false;

  state: State = { intent: undefined };

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._sync();
    if ((TimeIntentStore as any).listen) {
      this._unsubscribe = (TimeIntentStore as any).listen(() => this._sync());
    }
  }
  componentWillUnmount() { if (this._unsubscribe) this._unsubscribe(); }
  componentDidUpdate(prev: Props) {
    if (prev.threadId !== this.props.threadId) this._sync();
  }

  private _sync = (): void => {
    if (!this.props.threadId) {
      this.setState({ intent: undefined });
      return;
    }
    const intent = TimeIntentStore.get(this.props.threadId);
    this.setState({ intent });
  };

  render() {
    const intent = this.state.intent;
    if (!intent) return null;
    const cfg = LABELS[intent];
    return (
      <span
        className={`time-intent-badge time-intent-badge--${cfg.cls}`}
        role="status"
        aria-label={`${cfg.pl} / ${cfg.en}`}
      >
        {cfg.pl} / {cfg.en}
      </span>
    );
  }
}
