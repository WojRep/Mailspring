/**
 * TagChipsCompact — kompaktowe chipy tagów w wierszach listy wątków.
 *
 * Bilet #118. Mount przez slot `role: 'Thread:MailLabel'` (InjectedComponentSet
 * wewnątrz MailLabelSet) — pokrywa layout wide (kolumna c3) i narrow.
 *
 * Read-only (bez ✕): usuwanie tagu zostaje w reading pane (TagChips) i pickerze,
 * żeby nie łapać przypadkowych kliknięć w wierszu listy.
 *
 * Wiersze listy są memoizowane (ListTabularItem.shouldComponentUpdate), więc
 * komponent sam subskrybuje TagStore i odświeża się wewnątrz zamrożonego wiersza
 * — wzorzec PinBadge (#93).
 *
 * WCAG 1.4.1: kolor nigdy nie jest jedynym sygnałem — chip zawsze niesie tekst
 * nazwy. Przy >MAX_VISIBLE tagach chip przepełnienia `+N` wymienia ukryte
 * nazwy w aria-label i title.
 */

import React from 'react';
import { TagStore, Tag } from './tag-store';

const { localized } = require('actunamail-exports');

const MAX_VISIBLE = 3;

interface Props {
  thread?: { id: string };
  threadId?: string;
}

interface State {
  tags: Tag[];
}

export default class TagChipsCompact extends React.Component<Props, State> {
  static displayName = 'TagChipsCompact';
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
    this.setState({ tags: tid ? this._sorted(TagStore.getTags(tid)) : [] });
  };

  // #120: tag priorytetowy (preset Eisenhower/ABC) pierwszy wg rank,
  // potem systemowe, potem user alfabetycznie.
  private _sorted(tags: Tag[]): Tag[] {
    let presetStore: { rankForTagId(id: string): number | null } | null = null;
    try {
      presetStore = require('./priority-preset-store').PriorityPresetStore;
    } catch (e) {
      /* preset store unavailable */
    }
    const rank = (t: Tag) => {
      const r = presetStore ? presetStore.rankForTagId(t.id) : null;
      return r == null ? Number.MAX_SAFE_INTEGER : r;
    };
    return tags.slice().sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      const bySystem = Number(!!a.systemManaged) - Number(!!b.systemManaged);
      if (bySystem !== 0) return bySystem;
      return a.name.localeCompare(b.name);
    });
  }

  render() {
    const { tags } = this.state;
    if (tags.length === 0) return null;

    const visible = tags.slice(0, MAX_VISIBLE);
    const hidden = tags.slice(MAX_VISIBLE);

    const overflowLabel = hidden.length
      ? localized('Pozostałe tagi: {names} / More tags: {names}').replace(
          /\{names\}/g,
          hidden.map((t) => t.name).join(', ')
        )
      : '';

    return (
      <span
        className="tag-chips-compact-row"
        role="list"
        aria-label={localized('Tagi wątku / Thread tags')}
      >
        {visible.map((tag) => (
          <span
            key={tag.id}
            className={`tag-chip-compact${tag.systemManaged ? ' tag-chip-compact--system' : ''}`}
            role="listitem"
            title={tag.name}
            aria-label={localized('Tag {name} / Tag {name}').replace(/\{name\}/g, tag.name)}
          >
            <span
              className="tag-chip-compact-dot"
              style={{ background: tag.color }}
              aria-hidden="true"
            />
            <span className="tag-chip-compact-name">{tag.name}</span>
          </span>
        ))}
        {hidden.length > 0 && (
          <span
            className="tag-chip-compact-overflow"
            role="listitem"
            aria-label={overflowLabel}
            title={hidden.map((t) => t.name).join(', ')}
          >
            {`+${hidden.length}`}
          </span>
        )}
      </span>
    );
  }
}
