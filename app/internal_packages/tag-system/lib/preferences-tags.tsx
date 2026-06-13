/**
 * PreferencesTags — Tag Manager pane w Preferences.
 *
 * Bilet MVP #98. Mockup: design/mockups/04-tag-picker.html.
 *
 * Layout: 2 kolumny — lewa lista tagów, prawa detail panel selected tag.
 *
 * System tags grouped + greyed (read-only). User tags sortable alphabetic.
 *
 * Detail panel: name input (rename), color picker grid z DEFAULT_COLORS,
 * merge into other tag select, delete confirm.
 *
 * Add-tag form na górze: input "Nazwa nowego tagu" + color preview + Add button.
 *
 * Mount via PreferencesUIStore.registerPreferencesTab (TabId='Tags').
 */

import React from 'react';
import { TagStore, Tag, DEFAULT_COLORS } from './tag-store';
import TagSyncStatus from './tag-sync-status';
import { PriorityPresetStore, PRESETS } from './priority-preset-store';

const { localized } = require('actunamail-exports');

interface State {
  selectedId: string | null;
  newName: string;
  newColorIdx: number;
  renameDraft: string;
  mergeTargetId: string;
  confirmDelete: boolean;
}

// Poradnik in-app: macierz Eisenhowera + kolory ISO 3864 + linki do wolnych
// (CC BY-SA) źródeł. Pełny opis: docs/eisenhower-priorities.md.
const EISENHOWER_GUIDE_ROWS = [
  {
    token: 'var(--priority-do)',
    q: 'Q1',
    actionKey: 'Do now',
    axis: 'Pilne i ważne / Urgent + important',
  },
  {
    token: 'var(--priority-schedule)',
    q: 'Q2',
    actionKey: 'Schedule',
    axis: 'Ważne, niepilne / Important, not urgent',
  },
  {
    token: 'var(--priority-delegate)',
    q: 'Q3',
    actionKey: 'Delegate',
    axis: 'Pilne, nieważne / Urgent, not important',
  },
  {
    token: 'var(--priority-defer)',
    q: 'Q4',
    actionKey: 'Defer',
    axis: 'Niepilne i nieważne / Neither urgent nor important',
  },
];
const EISENHOWER_GUIDE_LINKS = [
  {
    label: 'Wikipedia: Eisenhower method',
    url: 'https://en.wikipedia.org/wiki/Time_management#Eisenhower_method',
  },
  { label: 'Wikipedia: ISO 3864', url: 'https://en.wikipedia.org/wiki/ISO_3864' },
];

function openExternalLink(url: string) {
  try {
    require('electron').shell.openExternal(url);
  } catch (e) {
    /* poza Electronem */
  }
}

const EisenhowerGuide = () => (
  <details className="eisenhower-guide" style={{ marginBottom: 16 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
      {localized('Jak działa macierz Eisenhowera? / How the Eisenhower matrix works')}
    </summary>
    <div style={{ paddingTop: 8, fontSize: '0.9em', lineHeight: 1.5 }}>
      <p>
        {localized(
          'Zadania ocenia się wg ważności i pilności → cztery ćwiartki, każda z akcją. Kolor flagi Apple automatycznie wpada do właściwej ćwiartki. / Tasks are rated by importance and urgency into four quadrants, each with an action; an Apple flag color maps to its quadrant automatically.'
        )}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
        {EISENHOWER_GUIDE_ROWS.map((r) => (
          <li key={r.q} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: r.token,
                flexShrink: 0,
                display: 'inline-block',
              }}
            />
            <strong>
              {r.q} · {localized(r.actionKey)}
            </strong>
            <span style={{ opacity: 0.7 }}>— {localized(r.axis)}</span>
          </li>
        ))}
      </ul>
      <p style={{ opacity: 0.8 }}>
        {localized(
          'Q4 = „Odłóż", nie „Usuń" — nic nie kasujemy, bo zadania z czasem migrują. Kolory wg standardu ISO 3864. / Q4 = "Defer", not "Delete" — nothing is deleted; tasks migrate over time. Colors follow the ISO 3864 standard.'
        )}
      </p>
      <div style={{ marginTop: 8 }}>
        {EISENHOWER_GUIDE_LINKS.map((l) => (
          <a
            key={l.url}
            href={l.url}
            onClick={(e) => {
              e.preventDefault();
              openExternalLink(l.url);
            }}
            style={{ display: 'block' }}
          >
            {l.label} ↗
          </a>
        ))}
      </div>
    </div>
  </details>
);

export default class PreferencesTags extends React.Component<{}, State> {
  static displayName = 'PreferencesTags';

  state: State = {
    selectedId: null,
    newName: '',
    newColorIdx: 0,
    renameDraft: '',
    mergeTargetId: '',
    confirmDelete: false,
  };

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._unsubscribe = TagStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  private _onPresetChange = (presetId: string | null): void => {
    const current = PriorityPresetStore.activePreset();
    if (presetId === current) return;
    if (current) {
      const ok = window.confirm(
        localized(
          'Zmiana presetu wyczyści przypisane priorytety. Kontynuować? / Changing the preset clears assigned priorities. Continue?'
        )
      );
      if (!ok) return;
    }
    PriorityPresetStore.activatePreset(presetId);
    this.forceUpdate();
  };

  private _selectTag = (id: string): void => {
    const tag = TagStore.get(id);
    this.setState({
      selectedId: id,
      renameDraft: tag?.name || '',
      mergeTargetId: '',
      confirmDelete: false,
    });
  };

  private _addTag = (): void => {
    const name = this.state.newName.trim();
    if (!name) return;
    const id = `user_${name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}_${Date.now().toString(36)}`;
    TagStore.register({
      id,
      name,
      color: DEFAULT_COLORS[this.state.newColorIdx],
      source: 'user',
    });
    this.setState({ newName: '', newColorIdx: 0, selectedId: id, renameDraft: name });
  };

  private _commitRename = (): void => {
    if (!this.state.selectedId) return;
    const name = this.state.renameDraft.trim();
    if (name) TagStore.rename(this.state.selectedId, name);
  };

  private _setColor = (color: string): void => {
    if (!this.state.selectedId) return;
    TagStore.setColor(this.state.selectedId, color);
  };

  private _mergeInto = (): void => {
    if (!this.state.selectedId || !this.state.mergeTargetId) return;
    if (TagStore.merge(this.state.selectedId, this.state.mergeTargetId)) {
      this.setState({
        selectedId: this.state.mergeTargetId,
        mergeTargetId: '',
        confirmDelete: false,
      });
    }
  };

  private _deleteSelected = (): void => {
    if (!this.state.selectedId) return;
    if (!this.state.confirmDelete) {
      this.setState({ confirmDelete: true });
      return;
    }
    TagStore.delete(this.state.selectedId);
    this.setState({ selectedId: null, renameDraft: '', confirmDelete: false });
  };

  render() {
    const all = TagStore.list();
    const userTags = all.filter((t) => !t.systemManaged);
    const systemTags = all.filter((t) => t.systemManaged);
    const selected = this.state.selectedId ? TagStore.get(this.state.selectedId) : null;
    const isSystem = !!selected?.systemManaged;
    const sysReadOnly = localized('Tag systemowy — niedostępny do edycji / System tag — read-only');

    return (
      <div className="preferences-tags-pane">
        <h2 className="preferences-tags-title">{localized('Zarządzaj tagami / Manage Tags')}</h2>

        <TagSyncStatus />

        {/* #120: preset priorytetów — Eisenhower (Q1–Q4) / A-B-C / brak.
            Jeden aktywny naraz; zmiana czyści przypisania po confirm. */}
        <div className="preferences-tags-preset">
          <div className="preferences-tags-preset-title">
            {localized('Preset priorytetów / Priority preset')}
          </div>
          <select
            className="preferences-tags-preset-select"
            aria-label={localized('Preset priorytetów / Priority preset')}
            value={PriorityPresetStore.activePreset() || ''}
            onChange={(e) => this._onPresetChange(e.target.value || null)}
          >
            <option value="">{localized('Brak / None')}</option>
            {Object.values(PRESETS).map((p) => (
              <option key={p.id} value={p.id}>
                {localized(p.label)}
              </option>
            ))}
          </select>
        </div>

        <EisenhowerGuide />

        <div className="preferences-tags-add">
          <input
            type="text"
            className="preferences-tags-add-input"
            placeholder={localized('Nazwa nowego tagu / New tag name')}
            value={this.state.newName}
            onChange={(e) => this.setState({ newName: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') this._addTag();
            }}
          />
          <div
            className="preferences-tags-add-colors"
            role="radiogroup"
            aria-label={localized('Kolor tagu / Tag color')}
          >
            {DEFAULT_COLORS.map((color, idx) => (
              <button
                key={idx}
                type="button"
                role="radio"
                aria-checked={this.state.newColorIdx === idx}
                aria-label={`${localized('Kolor / Color')} ${idx + 1}`}
                className={`preferences-tags-color-swatch${this.state.newColorIdx === idx ? ' selected' : ''}`}
                style={{ background: color }}
                onClick={() => this.setState({ newColorIdx: idx })}
              />
            ))}
          </div>
          <button
            type="button"
            className="preferences-tags-add-btn"
            onClick={this._addTag}
            disabled={!this.state.newName.trim()}
          >
            {localized('Dodaj / Add')}
          </button>
        </div>

        <div className="preferences-tags-grid">
          <div
            className="preferences-tags-list"
            role="listbox"
            aria-label={localized('Lista tagów / Tag list')}
          >
            <div className="preferences-tags-list-section">
              <div className="preferences-tags-list-heading">
                {localized('Twoje tagi / Your tags')}
              </div>
              {userTags.length === 0 ? (
                <div className="preferences-tags-list-empty">{localized('Brak / None')}</div>
              ) : (
                userTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    role="option"
                    aria-selected={this.state.selectedId === tag.id}
                    className={`preferences-tags-list-item${this.state.selectedId === tag.id ? ' selected' : ''}`}
                    onClick={() => this._selectTag(tag.id)}
                  >
                    <span
                      className="preferences-tags-list-dot"
                      style={{ background: tag.color }}
                      aria-hidden="true"
                    />
                    <span className="preferences-tags-list-name">{tag.name}</span>
                  </button>
                ))
              )}
            </div>
            <div className="preferences-tags-list-section">
              <div className="preferences-tags-list-heading">
                {localized('Tagi systemowe / System tags')}
              </div>
              {systemTags.length === 0 ? (
                <div className="preferences-tags-list-empty">{localized('Brak / None')}</div>
              ) : (
                systemTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    role="option"
                    aria-selected={this.state.selectedId === tag.id}
                    aria-disabled="true"
                    className={`preferences-tags-list-item system${this.state.selectedId === tag.id ? ' selected' : ''}`}
                    onClick={() => this._selectTag(tag.id)}
                    title={sysReadOnly}
                  >
                    <span
                      className="preferences-tags-list-dot"
                      style={{ background: tag.color }}
                      aria-hidden="true"
                    />
                    <span className="preferences-tags-list-name">{tag.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="preferences-tags-detail">
            {!selected ? (
              <div className="preferences-tags-detail-empty">
                {localized('Wybierz tag aby edytować / Select a tag to edit')}
              </div>
            ) : (
              <>
                <div className="preferences-tags-detail-field">
                  <label htmlFor="tag-rename">{localized('Nazwa / Name')}</label>
                  <input
                    id="tag-rename"
                    type="text"
                    value={this.state.renameDraft}
                    disabled={isSystem}
                    onChange={(e) => this.setState({ renameDraft: e.target.value })}
                    onBlur={this._commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') this._commitRename();
                    }}
                  />
                  {isSystem && <div className="preferences-tags-detail-note">{sysReadOnly}</div>}
                </div>

                <div className="preferences-tags-detail-field">
                  <label>{localized('Kolor / Color')}</label>
                  <div className="preferences-tags-color-grid" role="radiogroup">
                    {DEFAULT_COLORS.map((color, idx) => (
                      <button
                        key={idx}
                        type="button"
                        role="radio"
                        aria-checked={selected.color === color}
                        aria-label={`${localized('Kolor / Color')} ${idx + 1}`}
                        disabled={isSystem}
                        className={`preferences-tags-color-swatch${selected.color === color ? ' selected' : ''}`}
                        style={{ background: color }}
                        onClick={() => this._setColor(color)}
                      />
                    ))}
                  </div>
                </div>

                {!isSystem && (
                  <>
                    <div className="preferences-tags-detail-field">
                      <label htmlFor="tag-merge">{localized('Połącz z / Merge into')}</label>
                      <select
                        id="tag-merge"
                        value={this.state.mergeTargetId}
                        onChange={(e) => this.setState({ mergeTargetId: e.target.value })}
                      >
                        <option value="">
                          {localized('— wybierz docelowy tag / pick target tag —')}
                        </option>
                        {userTags
                          .filter((t) => t.id !== selected.id)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={this._mergeInto}
                        disabled={!this.state.mergeTargetId}
                      >
                        {localized('Połącz / Merge')}
                      </button>
                    </div>

                    <div className="preferences-tags-detail-field">
                      <button
                        type="button"
                        className={`preferences-tags-delete${this.state.confirmDelete ? ' confirm' : ''}`}
                        onClick={this._deleteSelected}
                      >
                        {this.state.confirmDelete
                          ? localized('Potwierdź usunięcie / Confirm delete')
                          : localized('Usuń tag / Delete tag')}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}
