/**
 * TagChips — inline tag chips w reading pane header per thread.
 *
 * Bilet MVP #98. Mockup: design/mockups/04-tag-picker.html.
 *
 * Renderuje horizontal row z `.tag-chip` items per assigned tag:
 *  color dot + tag name + ✕ remove button.
 *
 * Każdy chip: role="button" + aria-label PL+EN. ✕ button osobnym role="button"
 * z aria-label "Usuń tag".
 *
 * Mount via ComponentRegistry slot `role: 'MessageList:Header'` (exposes thread).
 * Accepts thread (slot) lub threadId (test).
 */

import React from 'react';
import { TagStore, Tag } from './tag-store';

const { localized } = require('actunamail-exports');

interface Props {
  thread?: { id: string };
  threadId?: string;
}

interface State {
  tags: Tag[];
}

export default class TagChips extends React.Component<Props, State> {
  static displayName = 'TagChips';
  static containerRequired = false;
  state: State = { tags: [] };

  private _unsubscribe: (() => void) | null = null;

  private _getThreadId(props = this.props): string | null {
    if (props.thread && props.thread.id) return props.thread.id;
    if (props.threadId) return props.threadId;
    return null;
  }

  componentDidMount() {
    this._unsubscribe = TagStore.listen(() => this._sync());
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
    this.setState({ tags: tid ? TagStore.getTags(tid) : [] });
  };

  private _onRemove = (tag: Tag, e: React.MouseEvent | React.KeyboardEvent): void => {
    e.stopPropagation();
    const tid = this._getThreadId();
    if (tid) TagStore.remove(tid, tag.id);
  };

  private _onChipKeyDown = (tag: Tag, e: React.KeyboardEvent<HTMLSpanElement>): void => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      this._onRemove(tag, e);
    }
  };

  render() {
    if (this.state.tags.length === 0) return null;
    return (
      <div className="tag-chips-row" role="list" aria-label={localized('Tagi wątku / Thread tags')}>
        {this.state.tags.map((tag) => {
          const chipLabel = localized('Tag {name} / Tag {name}').replace(/\{name\}/g, tag.name);
          const removeLabel = localized('Usuń tag {name} / Remove tag {name}').replace(
            /\{name\}/g,
            tag.name
          );
          return (
            <span
              key={tag.id}
              className={`tag-chip${tag.systemManaged ? ' tag-chip--system' : ''}`}
              role="listitem"
              aria-label={chipLabel}
              tabIndex={0}
              onKeyDown={(e) => this._onChipKeyDown(tag, e)}
            >
              <span className="tag-chip-dot" style={{ background: tag.color }} aria-hidden="true" />
              <span className="tag-chip-name">{tag.name}</span>
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={removeLabel}
                title={removeLabel}
                onClick={(e) => this._onRemove(tag, e)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    );
  }
}
