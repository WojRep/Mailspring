/**
 * TagPicker — Cmd+L modal dla apply/remove tagów per thread.
 *
 * Bilet MVP #98. Mockup: design/mockups/04-tag-picker.html.
 *
 * Funkcje:
 *  - Input filter (case-insensitive, match po name).
 *  - Lista tagów z color swatch + checkbox indicator + system badge.
 *  - Enter (na input z pustym query) creates new user tag z default color.
 *  - Space / click na row toggles assignment immediately.
 *  - Esc closes.
 *  - role="dialog" aria-modal aria-label.
 *
 * Glass surface via className "actuna-glass" (consumes #92 hook indirectly —
 * fallback handled by tokens.less media queries).
 */

import React from 'react';
import { TagSystemUIBus } from './tag-system-ui-bus';
import { TagStore, Tag, DEFAULT_COLORS } from './tag-store';

const { localized } = require('actunamail-exports');

interface State {
  open: boolean;
  threadId: string | null;
  query: string;
  /** All tags z TagStore (sorted: user alpha, system na końcu). */
  allTags: Tag[];
  /** Currently assigned tag ids dla threadId. */
  assigned: Set<string>;
  /** Index w filtered list dla keyboard nav. */
  focusIndex: number;
  previousActiveElement: Element | null;
}

export default class TagPicker extends React.Component<{}, State> {
  state: State = {
    open: false,
    threadId: null,
    query: '',
    allTags: [],
    assigned: new Set(),
    focusIndex: 0,
    previousActiveElement: null,
  };

  private _unsubscribeBus: (() => void) | null = null;
  private _unsubscribeStore: (() => void) | null = null;
  private _inputRef = React.createRef<HTMLInputElement>();

  componentDidMount() {
    this._unsubscribeBus = TagSystemUIBus.listen(() => this._sync());
    this._unsubscribeStore = TagStore.listen(() => this._syncStore());
    this._sync();
  }

  componentWillUnmount() {
    if (this._unsubscribeBus) this._unsubscribeBus();
    if (this._unsubscribeStore) this._unsubscribeStore();
  }

  componentDidUpdate(_: {}, prev: State) {
    if (this.state.open && !prev.open) {
      setTimeout(() => this._inputRef.current?.focus(), 0);
    }
    if (!this.state.open && prev.open && prev.previousActiveElement) {
      const el = prev.previousActiveElement as HTMLElement;
      if (el && typeof el.focus === 'function') {
        try { el.focus(); } catch (e) { /* el out of DOM */ }
      }
    }
  }

  private _sync = (): void => {
    const open = TagSystemUIBus.isPickerOpen();
    const threadId = TagSystemUIBus.getPickerThreadId();
    const previousActiveElement = open && !this.state.open
      ? document.activeElement
      : this.state.previousActiveElement;
    const allTags = TagStore.list();
    const assigned = new Set(threadId ? TagStore.getTagIds(threadId) : []);
    this.setState({ open, threadId, allTags, assigned, query: open && !this.state.open ? '' : this.state.query, focusIndex: 0, previousActiveElement });
  };

  private _syncStore = (): void => {
    if (!this.state.open) return;
    const allTags = TagStore.list();
    const assigned = new Set(this.state.threadId ? TagStore.getTagIds(this.state.threadId) : []);
    this.setState({ allTags, assigned });
  };

  private _filtered(): Tag[] {
    const q = this.state.query.toLowerCase().trim();
    if (!q) return this.state.allTags;
    return this.state.allTags.filter(t => t.name.toLowerCase().includes(q));
  }

  private _onQueryChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ query: e.target.value, focusIndex: 0 });
  };

  private _onToggleTag = (tag: Tag, e?: React.SyntheticEvent): void => {
    if (e) e.stopPropagation();
    if (!this.state.threadId) return;
    TagStore.toggle(this.state.threadId, tag.id);
  };

  private _createUserTag = (): void => {
    const name = this.state.query.trim();
    if (!name) return;
    // Slug from name + timestamp to avoid collision.
    const id = `user_${name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}_${Date.now().toString(36)}`;
    const colorIdx = TagStore.list().filter(t => !t.systemManaged).length % DEFAULT_COLORS.length;
    TagStore.register({
      id,
      name,
      color: DEFAULT_COLORS[colorIdx],
      source: 'user',
    });
    if (this.state.threadId) {
      TagStore.apply(this.state.threadId, id);
    }
    this.setState({ query: '', focusIndex: 0 });
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const filtered = this._filtered();
    if (e.key === 'Escape') {
      e.preventDefault();
      TagSystemUIBus.closePicker();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      this.setState({ focusIndex: (this.state.focusIndex + 1) % filtered.length });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      this.setState({ focusIndex: (this.state.focusIndex - 1 + filtered.length) % filtered.length });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length === 0 && this.state.query.trim()) {
        // Create new tag z query as name.
        this._createUserTag();
        return;
      }
      const tag = filtered[this.state.focusIndex];
      if (tag) this._onToggleTag(tag);
      return;
    }
    if (e.key === ' ' && document.activeElement !== this._inputRef.current) {
      // Space on row toggles (not on input).
      e.preventDefault();
      const tag = filtered[this.state.focusIndex];
      if (tag) this._onToggleTag(tag);
      return;
    }
  };

  private _onBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      TagSystemUIBus.closePicker();
    }
  };

  render() {
    if (!this.state.open) return null;
    const filtered = this._filtered();
    const ariaLabel = localized('Wybierz tagi do wątku / Pick tags for thread');
    const placeholder = localized('Szukaj tagów lub wpisz nazwę nowego… / Search tags or type new name…');
    const createHint = localized('Enter aby utworzyć nowy tag / Enter to create new tag');
    const emptyHint = localized('Brak tagów. Wpisz nazwę i naciśnij Enter. / No tags. Type a name and press Enter.');
    return (
      <div className="tag-picker-backdrop" onClick={this._onBackdropClick}>
        <div
          className="tag-picker actuna-glass actuna-glass--medium"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          onKeyDown={this._onKeyDown}
        >
          <div className="tag-picker-search">
            <input
              ref={this._inputRef}
              type="text"
              className="tag-picker-input"
              placeholder={placeholder}
              value={this.state.query}
              onChange={this._onQueryChange}
              aria-label={ariaLabel}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div
            className="tag-picker-list"
            role="listbox"
            aria-multiselectable="true"
            aria-label={ariaLabel}
          >
            {filtered.length === 0 ? (
              <div className="tag-picker-empty">{emptyHint}</div>
            ) : (
              filtered.map((tag, idx) => {
                const checked = this.state.assigned.has(tag.id);
                const focused = idx === this.state.focusIndex;
                return (
                  <div
                    key={tag.id}
                    className={`tag-picker-row${focused ? ' focused' : ''}${tag.systemManaged ? ' system' : ''}`}
                    role="option"
                    aria-selected={checked}
                    onClick={(e) => this._onToggleTag(tag, e)}
                    onMouseEnter={() => this.setState({ focusIndex: idx })}
                  >
                    <span
                      className="tag-picker-checkbox"
                      aria-hidden="true"
                      data-checked={checked ? 'true' : 'false'}
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <span
                      className="tag-picker-swatch"
                      style={{ background: tag.color }}
                      aria-hidden="true"
                    />
                    <span className="tag-picker-name">{tag.name}</span>
                    {tag.systemManaged && (
                      <span className="tag-picker-system-badge" aria-label={localized('Tag systemowy / System tag')}>
                        {localized('system')}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {filtered.length === 0 && this.state.query.trim() && (
            <div className="tag-picker-create-hint">{createHint}</div>
          )}
        </div>
      </div>
    );
  }
}
