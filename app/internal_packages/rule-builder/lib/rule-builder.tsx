/**
 * RuleBuilder — Cmd+Alt+R sentence-based modal dla CRUD automation rules.
 *
 * Bilet MVP #100 (UI implementation). UX wzór: ClickUp sentence builder.
 *
 * Layout (sentence form):
 *   WHEN [trigger ▼]
 *   MATCH [all|any] z poniższych warunków:
 *     [condition rows]  + Dodaj warunek
 *   THEN do:
 *     [action rows]      + Dodaj akcję
 *   EXCEPT IF (any matches):
 *     [exception rows]   + Dodaj wyjątek
 *
 * Plus: name input, enabled toggle, location server/local, save / update / delete / cancel.
 *
 * Conditions + exceptions share rule-engine z #99 — same field × operator catalog.
 * Action rows: type dropdown + value input depends on type (folderId / tagId / boolean / text).
 *
 * MVP: Save/Update/Delete/Cancel + Run Rules Now button.
 * Out-of-scope (osobne tickety): Preferences list view, create-from-email
 * context menu integration, bulk-confirm dialog, action target lookup (folder
 * names / tag names autocomplete) — backend pattern ready w preview().requiresBulkConfirm.
 */

import React from 'react';
import { RuleBuilderUIBus } from './rule-builder-ui-bus';
import { RuleStore } from './rule-store';
import {
  AutomationRule,
  Action,
  ActionType,
  TriggerType,
  RuleLocation,
  ACTION_LABELS_PL,
  ACTION_LABELS_EN,
  TRIGGER_LABELS_PL,
  TRIGGER_LABELS_EN,
} from './rule-types';
import { Rule, RuleField, RuleOperator, MatchMode } from '../../smart-folder/lib/rule-engine';

const { localized } = require('actunamail-exports');

// === Catalogs share z #99 SmartFolderWizard ===

const CONDITION_FIELD_OPTIONS: { value: RuleField; label: string }[] = [
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

const ACTION_TYPES: ActionType[] = [
  'move', 'copy', 'tag', 'remove_tag',
  'mark_read', 'mark_important', 'pin', 'snooze',
  'delete', 'forward', 'auto_reply', 'notify', 'stop_processing',
];

const TRIGGER_TYPES: TriggerType[] = ['message_arrives', 'message_sent', 'scheduled', 'manual'];

interface ConditionRow extends Rule { _key: string; }
interface ActionRow extends Action { _key: string; }

interface State {
  open: boolean;
  editingRuleId: string | null;
  name: string;
  enabled: boolean;
  location: RuleLocation;
  trigger: TriggerType;
  match: MatchMode;
  conditions: ConditionRow[];
  actions: ActionRow[];
  exceptions: ConditionRow[];
  previousActiveElement: Element | null;
}

function emptyCondition(): ConditionRow {
  return {
    _key: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    field: 'from',
    op: 'contains',
    value: '',
  };
}

function emptyAction(): ActionRow {
  return {
    _key: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'tag',
    value: '',
  };
}

function ruleRowFromRule(r: Rule): ConditionRow {
  return { ...r, _key: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
}

function actionRowFromAction(a: Action): ActionRow {
  return { ...a, _key: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
}

export default class RuleBuilder extends React.Component<{}, State> {
  static displayName = 'RuleBuilder';
  static containerRequired = false;

  state: State = {
    open: false,
    editingRuleId: null,
    name: '',
    enabled: true,
    location: 'local',
    trigger: 'message_arrives',
    match: 'all',
    conditions: [emptyCondition()],
    actions: [emptyAction()],
    exceptions: [],
    previousActiveElement: null,
  };

  private _unsubscribeBus: (() => void) | null = null;
  private _nameRef = React.createRef<HTMLInputElement>();

  componentDidMount() {
    this._unsubscribeBus = RuleBuilderUIBus.listen(() => this._syncFromBus());
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
    const open = RuleBuilderUIBus.isBuilderOpen();
    const editingRuleId = RuleBuilderUIBus.getEditingRuleId();
    const previousActiveElement = open && !this.state.open
      ? document.activeElement
      : this.state.previousActiveElement;
    if (open && editingRuleId) {
      const existing = RuleStore.get(editingRuleId);
      if (existing) {
        this.setState({
          open: true,
          editingRuleId,
          name: existing.name,
          enabled: existing.enabled,
          location: existing.location,
          trigger: existing.trigger,
          match: existing.match,
          conditions: existing.conditions.length
            ? existing.conditions.map(ruleRowFromRule)
            : [emptyCondition()],
          actions: existing.actions.length
            ? existing.actions.map(actionRowFromAction)
            : [emptyAction()],
          exceptions: existing.exceptions.map(ruleRowFromRule),
          previousActiveElement,
        });
        return;
      }
    }
    if (open) {
      this.setState({
        open: true,
        editingRuleId: null,
        name: '',
        enabled: true,
        location: 'local',
        trigger: 'message_arrives',
        match: 'all',
        conditions: [emptyCondition()],
        actions: [emptyAction()],
        exceptions: [],
        previousActiveElement,
      });
    } else {
      this.setState({ open: false, previousActiveElement });
    }
  };

  // === Condition + Exception row handlers (share semantics) ===

  private _updateConditionRow = (which: 'conditions' | 'exceptions', index: number, patch: Partial<Rule>): void => {
    const list = this.state[which].map((r, i) => i === index ? { ...r, ...patch } : r);
    this.setState({ [which]: list } as any);
  };

  private _onConditionFieldChange = (which: 'conditions' | 'exceptions', index: number) => (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newField = e.target.value as RuleField;
    const validOps = operatorsForField(newField);
    const currentOp = this.state[which][index].op;
    const op = validOps.includes(currentOp) ? currentOp : validOps[0];
    this._updateConditionRow(which, index, { field: newField, op, value: defaultValueForField(newField) });
  };

  private _onConditionOpChange = (which: 'conditions' | 'exceptions', index: number) => (e: React.ChangeEvent<HTMLSelectElement>): void => {
    this._updateConditionRow(which, index, { op: e.target.value as RuleOperator });
  };

  private _onConditionValueChange = (which: 'conditions' | 'exceptions', index: number) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    const rule = this.state[which][index];
    let value: any = e.target.value;
    if (['has_attachment', 'starred', 'pinned', 'unread'].includes(rule.field)) {
      value = value === 'true';
    }
    if (rule.op === 'within_last_days') {
      const n = parseInt(value, 10);
      value = Number.isFinite(n) ? n : 0;
    }
    this._updateConditionRow(which, index, { value });
  };

  private _addRow = (which: 'conditions' | 'exceptions'): void => {
    this.setState({ [which]: [...this.state[which], emptyCondition()] } as any);
  };

  private _removeRow = (which: 'conditions' | 'exceptions', index: number): void => {
    const next = this.state[which].filter((_, i) => i !== index);
    if (which === 'conditions' && next.length === 0) {
      this.setState({ conditions: [emptyCondition()] });
    } else {
      this.setState({ [which]: next } as any);
    }
  };

  // === Action row handlers ===

  private _updateActionRow = (index: number, patch: Partial<Action>): void => {
    this.setState({
      actions: this.state.actions.map((a, i) => i === index ? { ...a, ...patch } : a),
    });
  };

  private _onActionTypeChange = (index: number) => (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const newType = e.target.value as ActionType;
    let defaultValue: any = '';
    if (['mark_read', 'mark_important', 'pin'].includes(newType)) defaultValue = true;
    if (['delete', 'stop_processing'].includes(newType)) defaultValue = undefined;
    this._updateActionRow(index, { type: newType, value: defaultValue });
  };

  private _onActionValueChange = (index: number) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    const action = this.state.actions[index];
    let value: any = e.target.value;
    if (['mark_read', 'mark_important', 'pin'].includes(action.type)) {
      value = value === 'true';
    }
    this._updateActionRow(index, { value });
  };

  private _addAction = (): void => {
    this.setState({ actions: [...this.state.actions, emptyAction()] });
  };

  private _removeAction = (index: number): void => {
    const next = this.state.actions.filter((_, i) => i !== index);
    this.setState({ actions: next.length ? next : [emptyAction()] });
  };

  // === Top-level field handlers ===

  private _onNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ name: e.target.value });
  };

  private _onEnabledChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ enabled: e.target.checked });
  };

  private _onLocationChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    this.setState({ location: e.target.value as RuleLocation });
  };

  private _onTriggerChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    this.setState({ trigger: e.target.value as TriggerType });
  };

  private _onMatchChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    this.setState({ match: e.target.value as MatchMode });
  };

  // === Submit / cancel / delete ===

  private _isValid(): boolean {
    if (!this.state.name.trim()) return false;
    if (this.state.actions.length === 0) return false;
    return true;
  }

  private _stripCondKey(r: ConditionRow): Rule {
    const { _key, ...rule } = r;
    return rule;
  }

  private _stripActionKey(a: ActionRow): Action {
    const { _key, ...action } = a;
    return action;
  }

  private _onSave = (): void => {
    if (!this._isValid()) return;
    const conditions = this.state.conditions.map(r => this._stripCondKey(r));
    const actions = this.state.actions.map(a => this._stripActionKey(a));
    const exceptions = this.state.exceptions.map(r => this._stripCondKey(r));
    if (this.state.editingRuleId) {
      RuleStore.update(this.state.editingRuleId, {
        name: this.state.name.trim(),
        enabled: this.state.enabled,
        location: this.state.location,
        trigger: this.state.trigger,
        match: this.state.match,
        conditions,
        actions,
        exceptions,
      });
    } else {
      RuleStore.create({
        name: this.state.name.trim(),
        enabled: this.state.enabled,
        location: this.state.location,
        trigger: this.state.trigger,
        match: this.state.match,
        conditions,
        actions,
        exceptions,
      });
    }
    RuleBuilderUIBus.closeBuilder();
  };

  private _onDelete = (): void => {
    if (!this.state.editingRuleId) return;
    RuleStore.delete(this.state.editingRuleId);
    RuleBuilderUIBus.closeBuilder();
  };

  private _onCancel = (): void => {
    RuleBuilderUIBus.closeBuilder();
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
    const ariaLabel = this.state.editingRuleId
      ? localized('Edytuj regułę / Edit rule')
      : localized('Nowa reguła / New rule');
    const closeLabel = localized('Zamknij / Close');
    const namePlaceholder = localized('Nazwa reguły / Rule name');
    const cancelLabel = localized('Anuluj / Cancel');
    const saveLabel = this.state.editingRuleId
      ? localized('Zapisz zmiany / Save changes')
      : localized('Utwórz regułę / Create rule');
    const deleteLabel = localized('Usuń regułę / Delete rule');
    const enabledLabel = localized('Włączona / Enabled');
    const whenLabel = localized('GDY / WHEN');
    const matchLabel = localized('DOPASUJ / MATCH');
    const matchAllLabel = localized('wszystkie / all');
    const matchAnyLabel = localized('dowolny / any');
    const conditionsHeader = localized('z poniższych warunków / of the following conditions');
    const thenLabel = localized('WTEDY / THEN');
    const actionsHeader = localized('wykonaj akcje / perform actions');
    const exceptLabel = localized('CHYBA ŻE / EXCEPT IF');
    const exceptionsHeader = localized('dowolny wyjątek się dopasuje / any exception matches');
    const addCondLabel = localized('+ Dodaj warunek / Add condition');
    const addActionLabel = localized('+ Dodaj akcję / Add action');
    const addExceptLabel = localized('+ Dodaj wyjątek / Add exception');
    const locationLabel = localized('Lokalizacja / Location');

    return (
      <div className="rule-builder-backdrop" onClick={this._onBackdropClick}>
        <div
          className="rule-builder actuna-glass actuna-glass--medium"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={this._onKeyDown}
        >
          <header className="rule-builder-header">
            <h2 className="rule-builder-title">{ariaLabel}</h2>
            <button
              type="button"
              className="rule-builder-close"
              aria-label={closeLabel}
              onClick={this._onCancel}
            >
              ×
            </button>
          </header>

          <div className="rule-builder-form">
            <div className="rule-builder-top-row">
              <input
                ref={this._nameRef}
                type="text"
                className="rule-builder-name"
                placeholder={namePlaceholder}
                value={this.state.name}
                onChange={this._onNameChange}
                aria-label={namePlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
              <label className="rule-builder-enabled">
                <input
                  type="checkbox"
                  checked={this.state.enabled}
                  onChange={this._onEnabledChange}
                />
                <span>{enabledLabel}</span>
              </label>
              <label className="rule-builder-location">
                <span>{locationLabel}</span>
                <select value={this.state.location} onChange={this._onLocationChange}>
                  <option value="local">local</option>
                  <option value="server">server</option>
                </select>
              </label>
            </div>

            {/* WHEN sentence */}
            <div className="rule-builder-sentence">
              <span className="rule-builder-keyword">{whenLabel}</span>
              <select
                className="rule-builder-trigger"
                value={this.state.trigger}
                onChange={this._onTriggerChange}
                aria-label={whenLabel}
              >
                {TRIGGER_TYPES.map(t => (
                  <option key={t} value={t}>
                    {TRIGGER_LABELS_PL[t]} / {TRIGGER_LABELS_EN[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* MATCH conditions */}
            <div className="rule-builder-section">
              <div className="rule-builder-section-header">
                <span className="rule-builder-keyword">{matchLabel}</span>
                <select
                  className="rule-builder-match"
                  value={this.state.match}
                  onChange={this._onMatchChange}
                  aria-label={matchLabel}
                >
                  <option value="all">{matchAllLabel}</option>
                  <option value="any">{matchAnyLabel}</option>
                </select>
                <span className="rule-builder-section-tail">{conditionsHeader}</span>
              </div>
              {this.state.conditions.map((rule, idx) =>
                renderConditionRow(rule, idx, 'conditions', this)
              )}
              <button
                type="button"
                className="rule-builder-add-row"
                onClick={() => this._addRow('conditions')}
              >
                {addCondLabel}
              </button>
            </div>

            {/* THEN actions */}
            <div className="rule-builder-section">
              <div className="rule-builder-section-header">
                <span className="rule-builder-keyword">{thenLabel}</span>
                <span className="rule-builder-section-tail">{actionsHeader}</span>
              </div>
              {this.state.actions.map((action, idx) =>
                renderActionRow(action, idx, this)
              )}
              <button
                type="button"
                className="rule-builder-add-row"
                onClick={this._addAction}
              >
                {addActionLabel}
              </button>
            </div>

            {/* EXCEPT IF exceptions (optional) */}
            <div className="rule-builder-section rule-builder-section--exceptions">
              <div className="rule-builder-section-header">
                <span className="rule-builder-keyword">{exceptLabel}</span>
                <span className="rule-builder-section-tail">{exceptionsHeader}</span>
              </div>
              {this.state.exceptions.map((rule, idx) =>
                renderConditionRow(rule, idx, 'exceptions', this)
              )}
              <button
                type="button"
                className="rule-builder-add-row"
                onClick={() => this._addRow('exceptions')}
              >
                {addExceptLabel}
              </button>
            </div>
          </div>

          <footer className="rule-builder-footer">
            {this.state.editingRuleId && (
              <button
                type="button"
                className="rule-builder-delete"
                onClick={this._onDelete}
              >
                {deleteLabel}
              </button>
            )}
            <div className="rule-builder-footer-spacer" />
            <button
              type="button"
              className="rule-builder-cancel"
              onClick={this._onCancel}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className="rule-builder-save"
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

function renderConditionRow(
  rule: ConditionRow,
  idx: number,
  which: 'conditions' | 'exceptions',
  self: RuleBuilder
): React.ReactElement {
  const isBool = ['has_attachment', 'starred', 'pinned', 'unread'].includes(rule.field);
  const isDate = rule.field === 'date' && (rule.op === 'before' || rule.op === 'after');
  const isWithinDays = rule.op === 'within_last_days';
  const isImportance = rule.field === 'importance';

  let valueInput: React.ReactNode;
  if (isBool) {
    valueInput = (
      <select
        className="rule-builder-row-value"
        value={String(rule.value)}
        onChange={(self as any)._onConditionValueChange(which, idx)}
        aria-label={localized('Wartość / Value')}
      >
        <option value="true">{localized('tak / yes')}</option>
        <option value="false">{localized('nie / no')}</option>
      </select>
    );
  } else if (isDate) {
    valueInput = (
      <input
        type="date"
        className="rule-builder-row-value"
        value={String(rule.value || '')}
        onChange={(self as any)._onConditionValueChange(which, idx)}
        aria-label={localized('Data / Date')}
      />
    );
  } else if (isWithinDays) {
    valueInput = (
      <input
        type="number"
        min="1" max="365"
        className="rule-builder-row-value"
        value={String(rule.value || '')}
        onChange={(self as any)._onConditionValueChange(which, idx)}
        aria-label={localized('Liczba dni / Number of days')}
      />
    );
  } else if (isImportance) {
    valueInput = (
      <select
        className="rule-builder-row-value"
        value={String(rule.value)}
        onChange={(self as any)._onConditionValueChange(which, idx)}
        aria-label={localized('Ważność / Importance')}
      >
        <option value="high">{localized('wysoka / high')}</option>
        <option value="normal">{localized('normalna / normal')}</option>
        <option value="low">{localized('niska / low')}</option>
      </select>
    );
  } else {
    valueInput = (
      <input
        type="text"
        className="rule-builder-row-value"
        value={String(rule.value || '')}
        onChange={(self as any)._onConditionValueChange(which, idx)}
        aria-label={localized('Wartość / Value')}
        placeholder={localized('wpisz wartość… / type value…')}
      />
    );
  }

  const rowClass = which === 'conditions' ? 'rule-builder-condition-row' : 'rule-builder-exception-row';
  return (
    <div key={rule._key} className={rowClass}>
      <select
        className="rule-builder-row-field"
        value={rule.field}
        onChange={(self as any)._onConditionFieldChange(which, idx)}
        aria-label={localized('Pole / Field')}
      >
        {CONDITION_FIELD_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        className="rule-builder-row-op"
        value={rule.op}
        onChange={(self as any)._onConditionOpChange(which, idx)}
        aria-label={localized('Operator / Operator')}
      >
        {operatorsForField(rule.field).map(op => (
          <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
        ))}
      </select>
      {valueInput}
      <button
        type="button"
        className="rule-builder-row-remove"
        aria-label={localized('Usuń / Remove')}
        onClick={() => (self as any)._removeRow(which, idx)}
      >
        ×
      </button>
    </div>
  );
}

function renderActionRow(
  action: ActionRow,
  idx: number,
  self: RuleBuilder
): React.ReactElement {
  const isBool = ['mark_read', 'mark_important', 'pin'].includes(action.type);
  const hasNoValue = ['delete', 'stop_processing'].includes(action.type);

  let valueInput: React.ReactNode = null;
  if (isBool) {
    valueInput = (
      <select
        className="rule-builder-row-value"
        value={String(action.value)}
        onChange={(self as any)._onActionValueChange(idx)}
        aria-label={localized('Wartość / Value')}
      >
        <option value="true">{localized('tak / yes')}</option>
        <option value="false">{localized('nie / no')}</option>
      </select>
    );
  } else if (!hasNoValue) {
    valueInput = (
      <input
        type="text"
        className="rule-builder-row-value"
        value={String(action.value || '')}
        onChange={(self as any)._onActionValueChange(idx)}
        aria-label={localized('Wartość / Value')}
        placeholder={
          action.type === 'forward' ? 'email@...' :
          action.type === 'notify' ? localized('wiadomość / message') :
          action.type === 'snooze' ? localized('preset lub data / preset or date') :
          action.type === 'auto_reply' ? localized('templateId') :
          localized('id lub nazwa / id or name')
        }
      />
    );
  } else {
    valueInput = <span className="rule-builder-row-value-empty">—</span>;
  }

  return (
    <div key={action._key} className="rule-builder-action-row">
      <select
        className="rule-builder-action-type"
        value={action.type}
        onChange={(self as any)._onActionTypeChange(idx)}
        aria-label={localized('Akcja / Action')}
      >
        {ACTION_TYPES.map(t => (
          <option key={t} value={t}>
            {ACTION_LABELS_PL[t]} / {ACTION_LABELS_EN[t]}
          </option>
        ))}
      </select>
      {valueInput}
      <button
        type="button"
        className="rule-builder-row-remove"
        aria-label={localized('Usuń akcję / Remove action')}
        onClick={() => (self as any)._removeAction(idx)}
      >
        ×
      </button>
    </div>
  );
}
