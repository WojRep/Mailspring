/**
 * SmartFolderWizard — Cmd+Shift+N modal dla tworzenia / edytowania Smart Folder.
 *
 * Bilet MVP #99 (UI implementation). Mockup: design/mockups/14-smart-folder-wizard.html.
 *
 * Funkcje:
 *  - Name input (required).
 *  - Match mode toggle: all / any.
 *  - Rule rows: field × operator × value (dynamic add/remove).
 *  - Preview placeholder z rule count + valid state (live N matches —
 *    osobny ticket z Mailspring DatabaseStore integration).
 *  - Sort dropdown (date_desc / date_asc / sender_asc / subject_asc).
 *  - Save / Update + Delete (edit mode) + Cancel.
 *  - role="dialog" + aria-modal + aria-label PL+EN + Escape close.
 *  - Glass surface (actuna-glass --medium).
 */

import React from 'react';
import { SmartFolderUIBus } from './smart-folder-ui-bus';
import { SmartFolderStore } from './smart-folder-store';
import { Rule, RuleField, RuleOperator, MatchMode, SmartFolderDefinition } from './rule-engine';

const { localized } = require('actunamail-exports');

// === Field / Operator catalogs (PL+EN combined labels) ===

const FIELD_OPTIONS: { value: RuleField; label: string }[] = [
  { value: 'from',           label: 'Od / From' },
  { value: 'to',             label: 'Do / To' },
  { value: 'cc',             label: 'CC' },
  { value: 'subject',        label: 'Temat / Subject' },
  { value: 'body',           label: 'Treść / Body' },
  { value: 'tag',            label: 'Tag' },
  { value: 'folder',         label: 'Folder' },
  { value: 'account',        label: 'Konto / Account' },
  { value: 'has_attachment', label: 'Załącznik / Attachment' },
  { value: 'starred',        label: 'Oznaczony / Starred' },
  { value: 'pinned',         label: 'Przypięty / Pinned' },
  { value: 'unread',         label: 'Nieprzeczytany / Unread' },
  { value: 'importance',     label: 'Ważność / Importance' },
  { value: 'sender_domain',  label: 'Domena nadawcy / Sender domain' },
  { value: 'date',           label: 'Data / Date' },
];

const TEXT_OPS: RuleOperator[] = ['contains', 'does_not_contain', 'is', 'is_not', 'starts_with', 'ends_with', 'matches_regex'];
const BOOL_OPS: RuleOperator[] = ['is'];
const DATE_OPS: RuleOperator[] = ['before', 'after', 'within_last_days'];
const ENUM_OPS: RuleOperator[] = ['is', 'is_not'];

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  is:                'jest / is',
  is_not:            'nie jest / is not',
  contains:          'zawiera / contains',
  does_not_contain:  'nie zawiera / does not contain',
  starts_with:       'zaczyna się / starts with',
  ends_with:         'kończy się / ends with',
  matches_regex:     'regex',
  before:            'przed / before',
  after:             'po / after',
  within_last_days:  'w ostatnich N dni / within last N days',
  in_group:          'w grupie / in group',
};

function operatorsForField(field: RuleField): RuleOperator[] {
  switch (field) {
    case 'has_attachment':
    case 'starred':
    case 'pinned':
    case 'unread':
      return BOOL_OPS;
    case 'date':
      return DATE_OPS;
    case 'importance':
      return ENUM_OPS;
    default:
      return TEXT_OPS;
  }
}

function defaultValueForField(field: RuleField): any {
  switch (field) {
    case 'has_attachment':
    case 'starred':
    case 'pinned':
    case 'unread':
      return true;
    case 'date':
      return new Date().toISOString().slice(0, 10);
    case 'importance':
      return 'high';
    default:
      return '';
  }
}

interface RuleRow extends Rule {
  _key: string; // local React key
}

interface State {
  open: boolean;
  editingFolderId: string | null;
  name: string;
  match: MatchMode;
  rules: RuleRow[];
  sort: SmartFolderDefinition['sort'];
  previousActiveElement: Element | null;
}

function emptyRule(): RuleRow {
  return {
    _key: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    field: 'from',
    op: 'contains',
    value: '',
  };
}

function ruleRowFromRule(r: Rule): RuleRow {
  return { ...r, _key: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
}

export default class SmartFolderWizard extends React.Component<{}, State> {
  static displayName = 'SmartFolderWizard';
  static containerRequired = false;

  state: State = {
    open: false,
    editingFolderId: null,
    name: '',
    match: 'all',
    rules: [emptyRule()],
    sort: 'date_desc',
    previousActiveElement: null,
  };

  private _unsubscribeBus: (() => void) | null = null;
  private _dialogRef = React.createRef<HTMLDivElement>();
  private _nameRef = React.createRef<HTMLInputElement>();

  componentDidMount() {
    this._unsubscribeBus = SmartFolderUIBus.listen(() => this._syncFromBus());
    this._syncFromBus();
  }

  componentWillUnmount() {
    if (this._unsubscribeBus) this._unsubscribeBus();
  }

  componentDidUpdate(_: {}, prev: State) {
    if (this.state.open && !prev.open) {
      setTimeout(() => this._nameRef.current?.focus(), 0);
    }
    if (!this.state.open && prev.open && prev.previousActiveElement) {
      const el = prev.previousActiveElement as HTMLElement;
      if (el && typeof el.focus === 'function') {
        try { el.focus(); } catch (e) { /* el out of DOM */ }
      }
    }
  }

  private _syncFromBus = (): void => {
    const open = SmartFolderUIBus.isWizardOpen();
    const editingFolderId = SmartFolderUIBus.getEditingFolderId();
    const previousActiveElement = open && !this.state.open
      ? document.activeElement
      : this.state.previousActiveElement;
    if (open && editingFolderId) {
      const existing = SmartFolderStore.get(editingFolderId);
      if (existing) {
        this.setState({
          open: true,
          editingFolderId,
          name: existing.name,
          match: existing.match,
          rules: existing.rules.length
            ? existing.rules.map(ruleRowFromRule)
            : [emptyRule()],
          sort: existing.sort || 'date_desc',
          previousActiveElement,
        });
        return;
      }
    }
    if (open) {
      this.setState({
        open: true,
        editingFolderId: null,
        name: '',
        match: 'all',
        rules: [emptyRule()],
        sort: 'date_desc',
        previousActiveElement,
      });
    } else {
      this.setState({ open: false, previousActiveElement });
    }
  };

  // === Field handlers ===

  private _onNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ name: e.target.value });
  };

  private _onMatchChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    this.setState({ match: e.target.value as MatchMode });
  };

  private _onSortChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    this.setState({ sort: e.target.value as SmartFolderDefinition['sort'] });
  };

  private _updateRule = (index: number, patch: Partial<Rule>): void => {
    this.setState({
      rules: this.state.rules.map((r, i) => i === index ? { ...r, ...patch } : r),
    });
  };

  private _onFieldChange = (index: number) => (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newField = e.target.value as RuleField;
    const validOps = operatorsForField(newField);
    const currentOp = this.state.rules[index].op;
    const op = validOps.includes(currentOp) ? currentOp : validOps[0];
    this._updateRule(index, {
      field: newField,
      op,
      value: defaultValueForField(newField),
    });
  };

  private _onOpChange = (index: number) => (e: React.ChangeEvent<HTMLSelectElement>): void => {
    this._updateRule(index, { op: e.target.value as RuleOperator });
  };

  private _onValueChange = (index: number) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    const rule = this.state.rules[index];
    let value: any = e.target.value;
    // Boolean coerce dla bool fields
    if (['has_attachment', 'starred', 'pinned', 'unread'].includes(rule.field)) {
      value = value === 'true';
    }
    if (rule.op === 'within_last_days') {
      const n = parseInt(value, 10);
      value = Number.isFinite(n) ? n : 0;
    }
    this._updateRule(index, { value });
  };

  private _addRule = (): void => {
    this.setState({ rules: [...this.state.rules, emptyRule()] });
  };

  private _removeRule = (index: number): void => {
    const next = this.state.rules.filter((_, i) => i !== index);
    this.setState({ rules: next.length ? next : [emptyRule()] });
  };

  // === Submit / cancel / delete ===

  private _isValid(): boolean {
    if (!this.state.name.trim()) return false;
    return true;
  }

  private _stripKey(r: RuleRow): Rule {
    const { _key, ...rule } = r;
    return rule;
  }

  private _onSave = (): void => {
    if (!this._isValid()) return;
    const cleanRules = this.state.rules.map(r => this._stripKey(r));
    if (this.state.editingFolderId) {
      SmartFolderStore.update(this.state.editingFolderId, {
        name: this.state.name.trim(),
        match: this.state.match,
        rules: cleanRules,
        sort: this.state.sort,
      });
    } else {
      SmartFolderStore.create({
        name: this.state.name.trim(),
        match: this.state.match,
        rules: cleanRules,
        sort: this.state.sort,
      });
    }
    SmartFolderUIBus.closeWizard();
  };

  private _onDelete = (): void => {
    if (!this.state.editingFolderId) return;
    SmartFolderStore.delete(this.state.editingFolderId);
    SmartFolderUIBus.closeWizard();
  };

  private _onCancel = (): void => {
    SmartFolderUIBus.closeWizard();
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._onCancel();
    }
  };

  private _onBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      this._onCancel();
    }
  };

  // === Render ===

  render() {
    if (!this.state.open) return null;
    const ariaLabel = this.state.editingFolderId
      ? localized('Edytuj Smart Folder / Edit Smart Folder')
      : localized('Nowy Smart Folder / New Smart Folder');
    const closeLabel = localized('Zamknij / Close');
    const namePlaceholder = localized('Nazwa folderu / Folder name');
    const matchAllLabel = localized('wszystkie / all');
    const matchAnyLabel = localized('dowolny / any');
    const matchPrefix = localized('Dopasuj / Match');
    const rulesHeader = localized('Reguły / Rules');
    const addRuleLabel = localized('+ Dodaj regułę / Add rule');
    const removeRuleLabel = localized('Usuń regułę / Remove rule');
    const sortLabel = localized('Sortuj / Sort');
    const previewLabel = localized('Podgląd / Preview');
    const previewHint = localized('{N} reguł / {N} rules').replace(/\{N\}/g, String(this.state.rules.length));
    const cancelLabel = localized('Anuluj / Cancel');
    const saveLabel = this.state.editingFolderId
      ? localized('Zapisz zmiany / Save changes')
      : localized('Utwórz folder / Create folder');
    const deleteLabel = localized('Usuń folder / Delete folder');

    const sortOptions: { value: SmartFolderDefinition['sort']; label: string }[] = [
      { value: 'date_desc', label: localized('Data malejąco / Date newest') },
      { value: 'date_asc',  label: localized('Data rosnąco / Date oldest') },
      { value: 'sender_asc', label: localized('Nadawca A–Z / Sender A–Z') },
      { value: 'subject_asc', label: localized('Temat A–Z / Subject A–Z') },
    ];

    return (
      <div className="smart-folder-wizard-backdrop" onClick={this._onBackdropClick}>
        <div
          ref={this._dialogRef}
          className="smart-folder-wizard actuna-glass actuna-glass--medium"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={this._onKeyDown}
        >
          <header className="smart-folder-wizard-header">
            <h2 className="smart-folder-wizard-title">{ariaLabel}</h2>
            <button
              type="button"
              className="smart-folder-wizard-close"
              aria-label={closeLabel}
              onClick={this._onCancel}
            >
              ×
            </button>
          </header>

          <div className="smart-folder-wizard-form">
            <div className="smart-folder-wizard-field">
              <input
                ref={this._nameRef}
                type="text"
                className="smart-folder-wizard-name"
                placeholder={namePlaceholder}
                value={this.state.name}
                onChange={this._onNameChange}
                aria-label={namePlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="smart-folder-wizard-match">
              <span className="smart-folder-wizard-match-prefix">{matchPrefix}</span>
              <select
                className="smart-folder-wizard-match-select"
                value={this.state.match}
                onChange={this._onMatchChange}
                aria-label={matchPrefix}
              >
                <option value="all">{matchAllLabel}</option>
                <option value="any">{matchAnyLabel}</option>
              </select>
            </div>

            <div className="smart-folder-wizard-rules" role="group" aria-label={rulesHeader}>
              <div className="smart-folder-wizard-rules-header">{rulesHeader}</div>
              {this.state.rules.map((rule, idx) => (
                <div key={rule._key} className="smart-folder-wizard-rule-row">
                  <select
                    className="smart-folder-wizard-rule-field"
                    value={rule.field}
                    onChange={this._onFieldChange(idx)}
                    aria-label={localized('Pole / Field')}
                  >
                    {FIELD_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <select
                    className="smart-folder-wizard-rule-op"
                    value={rule.op}
                    onChange={this._onOpChange(idx)}
                    aria-label={localized('Operator / Operator')}
                  >
                    {operatorsForField(rule.field).map(op => (
                      <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                    ))}
                  </select>
                  {renderValueInput(rule, idx, this._onValueChange(idx))}
                  <button
                    type="button"
                    className="smart-folder-wizard-rule-remove"
                    aria-label={removeRuleLabel}
                    onClick={() => this._removeRule(idx)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="smart-folder-wizard-add-rule"
                onClick={this._addRule}
              >
                {addRuleLabel}
              </button>
            </div>

            <div className="smart-folder-wizard-sort">
              <label htmlFor="smart-folder-wizard-sort-select">{sortLabel}</label>
              <select
                id="smart-folder-wizard-sort-select"
                value={this.state.sort}
                onChange={this._onSortChange}
              >
                {sortOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="smart-folder-wizard-preview" aria-live="polite">
              <strong>{previewLabel}:</strong> {previewHint}
            </div>
          </div>

          <footer className="smart-folder-wizard-footer">
            {this.state.editingFolderId && (
              <button
                type="button"
                className="smart-folder-wizard-delete"
                onClick={this._onDelete}
              >
                {deleteLabel}
              </button>
            )}
            <div className="smart-folder-wizard-footer-spacer" />
            <button
              type="button"
              className="smart-folder-wizard-cancel"
              onClick={this._onCancel}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className="smart-folder-wizard-save"
              onClick={this._onSave}
              disabled={!this._isValid()}
              data-disabled={!this._isValid()}
            >
              {saveLabel}
            </button>
          </footer>
        </div>
      </div>
    );
  }
}

function renderValueInput(
  rule: Rule,
  _idx: number,
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
): React.ReactNode {
  const isBool = ['has_attachment', 'starred', 'pinned', 'unread'].includes(rule.field);
  const isDate = rule.field === 'date' && (rule.op === 'before' || rule.op === 'after');
  const isWithinDays = rule.op === 'within_last_days';
  const isImportance = rule.field === 'importance';
  if (isBool) {
    return (
      <select
        className="smart-folder-wizard-rule-value"
        value={String(rule.value)}
        onChange={onChange}
        aria-label={localized('Wartość / Value')}
      >
        <option value="true">{localized('tak / yes')}</option>
        <option value="false">{localized('nie / no')}</option>
      </select>
    );
  }
  if (isDate) {
    return (
      <input
        type="date"
        className="smart-folder-wizard-rule-value"
        value={String(rule.value || '')}
        onChange={onChange}
        aria-label={localized('Data / Date')}
      />
    );
  }
  if (isWithinDays) {
    return (
      <input
        type="number"
        min="1"
        max="365"
        className="smart-folder-wizard-rule-value"
        value={String(rule.value || '')}
        onChange={onChange}
        aria-label={localized('Liczba dni / Number of days')}
      />
    );
  }
  if (isImportance) {
    return (
      <select
        className="smart-folder-wizard-rule-value"
        value={String(rule.value)}
        onChange={onChange}
        aria-label={localized('Ważność / Importance')}
      >
        <option value="high">{localized('wysoka / high')}</option>
        <option value="normal">{localized('normalna / normal')}</option>
        <option value="low">{localized('niska / low')}</option>
      </select>
    );
  }
  return (
    <input
      type="text"
      className="smart-folder-wizard-rule-value"
      value={String(rule.value || '')}
      onChange={onChange}
      aria-label={localized('Wartość / Value')}
      placeholder={localized('wpisz wartość… / type value…')}
    />
  );
}
