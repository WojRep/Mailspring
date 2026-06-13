import React from 'react';
import { localized, PropTypes, Actions, TaskFactory, ExtensionRegistry } from 'actunamail-exports';
import {
  flagColorValue,
  flagColorToken,
  flagColorNameKey,
  flagMeaningKey,
} from '../../../src/flag-colors';
import { ThreadWithMessagesMetadata } from './types';

class ThreadListIcon extends React.Component<{ thread: ThreadWithMessagesMetadata }> {
  static displayName = 'ThreadListIcon';
  static propTypes = { thread: PropTypes.object };

  _extensionsIconClassNames = () => {
    return ExtensionRegistry.ThreadList.extensions()
      .filter((ext) => ext.cssClassNamesForThreadListIcon != null)
      .reduce((prev, ext) => prev + ' ' + ext.cssClassNamesForThreadListIcon(this.props.thread), '')
      .trim();
  };

  _iconClassNames = () => {
    if (!this.props.thread) {
      return 'thread-icon-star-on-hover';
    }

    const extensionIconClassNames = this._extensionsIconClassNames();
    if (extensionIconClassNames.length > 0) {
      return extensionIconClassNames;
    }

    if (this.props.thread.starred) {
      return 'thread-icon-star';
    }

    if (this.props.thread.unread) {
      return 'thread-icon-unread thread-icon-star-on-hover';
    }

    const msgs = this._nonDraftMessages();
    const last = msgs[msgs.length - 1];

    if (msgs.length > 1 && (last.from[0] != null ? last.from[0].isMe() : undefined)) {
      if (last.isForwarded()) {
        return 'thread-icon-forwarded thread-icon-star-on-hover';
      } else {
        return 'thread-icon-replied thread-icon-star-on-hover';
      }
    }

    return 'thread-icon-none thread-icon-star-on-hover';
  };

  _nonDraftMessages() {
    let msgs = this.props.thread.__messages;
    if (!msgs || !(msgs instanceof Array)) {
      return [];
    }
    msgs = msgs.filter((m) => m.id && !m.draft);
    return msgs;
  }

  shouldComponentUpdate(nextProps) {
    if (nextProps.thread === this.props.thread) {
      return false;
    }
    return true;
  }

  render() {
    const thread = this.props.thread;
    // Kolorowa flaga Apple ($MailFlagBit* + \Flagged): render flagi w jej kolorze
    // (1:1 jak Apple Mail). Czysta gwiazdka (bez bitów) → poniżej, zwykła ikona.
    const flagVal = thread ? flagColorValue(thread.customKeywords, thread.starred) : null;
    if (flagVal !== null) {
      const token = flagColorToken(flagVal) || 'var(--flag-red)';
      // a11y + znaczenie: nazwa koloru + akcja kwadrantu (np. „Czerwona — Zrób teraz").
      const colorName = flagColorNameKey(flagVal);
      const meaningKey = flagMeaningKey(flagVal);
      const parts: string[] = [];
      if (colorName) parts.push(localized(colorName));
      if (meaningKey) parts.push(localized(meaningKey));
      const label = parts.length ? parts.join(' — ') : localized('Flag');
      return (
        <div
          className="thread-icon thread-icon-flagcolor"
          role="button"
          tabIndex={-1}
          aria-label={label}
          aria-pressed={true}
          title={label}
          onClick={this._onToggleStar}
          onKeyDown={this._onKeyDown}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 1.5v13"
              stroke={token}
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
            <path d="M4.8 2.2h7.2l-2.1 2.6 2.1 2.6H4.8z" fill={token} />
          </svg>
        </div>
      );
    }

    const starred = thread && thread.starred;
    const ariaLabel = starred ? localized('Unstar') : localized('Star');
    return (
      <div
        className={`thread-icon ${this._iconClassNames()}`}
        role="button"
        tabIndex={-1}
        aria-label={ariaLabel}
        aria-pressed={starred || false}
        title={ariaLabel}
        onClick={this._onToggleStar}
        onKeyDown={this._onKeyDown}
      />
    );
  }

  _onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this._onToggleStar(event as any);
    }
  };

  _onToggleStar = (event) => {
    Actions.queueTask(
      TaskFactory.taskForInvertingStarred({
        threads: [this.props.thread],
        source: 'Thread List Icon',
      })
    );
    // Don't trigger the thread row click
    return event.stopPropagation();
  };
}

export default ThreadListIcon;
