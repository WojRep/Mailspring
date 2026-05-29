/**
 * RuleBuilder UI specs — bilet MVP #100 (UI implementation).
 *
 * Pokrycie:
 *  - Hidden gdy UIBus zamknięty / visible po openBuilder.
 *  - role=dialog + aria-modal + aria-label.
 *  - Create flow: form pusty, default 1 condition + 1 action, Save → RuleStore.create.
 *  - Edit flow: load existing rule do form, modify, Save → RuleStore.update + Delete.
 *  - Validation: Save disabled gdy name pusty.
 *  - Dynamic rows: add/remove conditions, actions, exceptions.
 *  - Action type change resetuje value (boolean default true; delete/stop_processing brak value).
 *  - Trigger/match/location dropdowns.
 *  - Escape / Cancel / Backdrop close.
 */

import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import RuleBuilder from '../internal_packages/rule-builder/lib/rule-builder';
import { RuleBuilderUIBus } from '../internal_packages/rule-builder/lib/rule-builder-ui-bus';
import { RuleStore } from '../internal_packages/rule-builder/lib/rule-store';

describe('RuleBuilder UI — bilet MVP #100', () => {
  beforeEach(() => {
    RuleStore._reset();
    RuleStore.init();
    RuleBuilderUIBus._reset();
  });

  afterEach(() => {
    cleanup();
    RuleBuilderUIBus._reset();
  });

  it('jest hidden gdy UIBus zamknięty', () => {
    const { container } = render(<RuleBuilder />);
    expect(container.querySelector('.rule-builder')).toBeNull();
  });

  it('otwiera dialog z role + aria-modal + aria-label po openBuilder', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    const dialog = container.querySelector('.rule-builder[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toMatch(/reguł|rule/i);
  });

  it('Create mode: pusty form, default 1 condition + 1 action, brak exceptions, Save disabled', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    const nameInput = container.querySelector('.rule-builder-name') as HTMLInputElement;
    expect(nameInput.value).toBe('');
    expect(container.querySelectorAll('.rule-builder-condition-row').length).toBe(1);
    expect(container.querySelectorAll('.rule-builder-action-row').length).toBe(1);
    expect(container.querySelectorAll('.rule-builder-exception-row').length).toBe(0);
    const save = container.querySelector('.rule-builder-save') as HTMLButtonElement;
    expect(save.getAttribute('data-disabled')).toBe('true');
  });

  it('Wpisanie name aktywuje Save button', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    fireEvent.change(
      container.querySelector('.rule-builder-name') as HTMLInputElement,
      { target: { value: 'Newsletter rule' } }
    );
    expect((container.querySelector('.rule-builder-save') as HTMLButtonElement).getAttribute('data-disabled')).toBe('false');
  });

  it('Save wywołuje RuleStore.create + zamyka builder', () => {
    const spy = spyOn(RuleStore, 'create').andCallThrough();
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    fireEvent.change(
      container.querySelector('.rule-builder-name') as HTMLInputElement,
      { target: { value: 'Reguła klienta' } }
    );
    fireEvent.click(container.querySelector('.rule-builder-save') as HTMLButtonElement);
    expect(spy).toHaveBeenCalled();
    expect((spy as any).mostRecentCall.args[0].name).toBe('Reguła klienta');
    expect(RuleBuilderUIBus.isBuilderOpen()).toBe(false);
  });

  it('Add condition / action / exception button dodaje wiersze', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    expect(container.querySelectorAll('.rule-builder-condition-row').length).toBe(1);
    expect(container.querySelectorAll('.rule-builder-action-row').length).toBe(1);
    expect(container.querySelectorAll('.rule-builder-exception-row').length).toBe(0);

    const addBtns = container.querySelectorAll('.rule-builder-add-row');
    // 3 add buttons: condition, action, exception.
    expect(addBtns.length).toBe(3);
    fireEvent.click(addBtns[0] as HTMLButtonElement); // add condition
    fireEvent.click(addBtns[1] as HTMLButtonElement); // add action
    fireEvent.click(addBtns[2] as HTMLButtonElement); // add exception
    expect(container.querySelectorAll('.rule-builder-condition-row').length).toBe(2);
    expect(container.querySelectorAll('.rule-builder-action-row').length).toBe(2);
    expect(container.querySelectorAll('.rule-builder-exception-row').length).toBe(1);
  });

  it('Action type change resetuje value (bool default, delete brak value)', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    const actionSelect = container.querySelector('.rule-builder-action-type') as HTMLSelectElement;
    fireEvent.change(actionSelect, { target: { value: 'mark_read' } });
    const valueEl = container.querySelector('.rule-builder-action-row .rule-builder-row-value') as HTMLElement;
    expect(valueEl.tagName).toBe('SELECT');
    expect((valueEl as HTMLSelectElement).value).toBe('true');

    fireEvent.change(actionSelect, { target: { value: 'delete' } });
    // delete = no value → renderuje empty placeholder span
    const empty = container.querySelector('.rule-builder-row-value-empty');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toBe('—');
  });

  it('Condition field=date przełącza operator na date-aware ops', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    const fieldSelect = container.querySelector('.rule-builder-row-field') as HTMLSelectElement;
    fireEvent.change(fieldSelect, { target: { value: 'date' } });
    const opSelect = container.querySelector('.rule-builder-row-op') as HTMLSelectElement;
    expect(['before', 'after', 'within_last_days']).toContain(opSelect.value);
  });

  it('Trigger / match / location dropdowns updateuje state', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    const trigger = container.querySelector('.rule-builder-trigger') as HTMLSelectElement;
    fireEvent.change(trigger, { target: { value: 'manual' } });
    expect(trigger.value).toBe('manual');

    const match = container.querySelector('.rule-builder-match') as HTMLSelectElement;
    fireEvent.change(match, { target: { value: 'any' } });
    expect(match.value).toBe('any');

    const location = container.querySelector('.rule-builder-location select') as HTMLSelectElement;
    fireEvent.change(location, { target: { value: 'server' } });
    expect(location.value).toBe('server');
  });

  it('Edit mode: ładuje rule do form', () => {
    const rule = RuleStore.create({
      name: 'Mark VIP',
      enabled: true,
      location: 'local',
      trigger: 'message_arrives',
      match: 'all',
      conditions: [{ field: 'from', op: 'contains', value: 'vip.com' }],
      actions: [{ type: 'mark_important', value: true }],
      exceptions: [],
    });
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder(rule.id);
    const nameInput = container.querySelector('.rule-builder-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Mark VIP');
    const value = container.querySelector('.rule-builder-condition-row .rule-builder-row-value') as HTMLInputElement;
    expect(value.value).toBe('vip.com');
  });

  it('Edit mode: Save wywołuje RuleStore.update', () => {
    const rule = RuleStore.create({
      name: 'Stara',
      enabled: true,
      location: 'local',
      trigger: 'message_arrives',
      match: 'all',
      conditions: [{ field: 'from', op: 'contains', value: 'x' }],
      actions: [{ type: 'tag', value: 't1' }],
      exceptions: [],
    });
    const spy = spyOn(RuleStore, 'update').andCallThrough();
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder(rule.id);
    fireEvent.change(
      container.querySelector('.rule-builder-name') as HTMLInputElement,
      { target: { value: 'Nowa nazwa' } }
    );
    fireEvent.click(container.querySelector('.rule-builder-save') as HTMLButtonElement);
    expect(spy).toHaveBeenCalled();
    expect((spy as any).mostRecentCall.args[0]).toBe(rule.id);
    expect((spy as any).mostRecentCall.args[1].name).toBe('Nowa nazwa');
    expect(RuleBuilderUIBus.isBuilderOpen()).toBe(false);
  });

  it('Edit mode: Delete button wywołuje RuleStore.delete', () => {
    const rule = RuleStore.create({
      name: 'Do skasowania',
      enabled: true,
      location: 'local',
      trigger: 'message_arrives',
      match: 'all',
      conditions: [],
      actions: [{ type: 'mark_read', value: true }],
      exceptions: [],
    });
    const spy = spyOn(RuleStore, 'delete').andCallThrough();
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder(rule.id);
    const deleteBtn = container.querySelector('.rule-builder-delete') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    fireEvent.click(deleteBtn);
    expect(spy).toHaveBeenCalledWith(rule.id);
    expect(RuleBuilderUIBus.isBuilderOpen()).toBe(false);
  });

  it('Create mode: brak Delete button', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    expect(container.querySelector('.rule-builder-delete')).toBeNull();
  });

  it('Escape zamyka builder', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    const dialog = container.querySelector('.rule-builder') as HTMLElement;
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(RuleBuilderUIBus.isBuilderOpen()).toBe(false);
  });

  it('Cancel button zamyka builder bez create', () => {
    const spy = spyOn(RuleStore, 'create').andCallThrough();
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    fireEvent.change(
      container.querySelector('.rule-builder-name') as HTMLInputElement,
      { target: { value: 'X' } }
    );
    fireEvent.click(container.querySelector('.rule-builder-cancel') as HTMLButtonElement);
    expect(RuleBuilderUIBus.isBuilderOpen()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Backdrop click zamyka (click w dialog NIE)', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    const dialog = container.querySelector('.rule-builder') as HTMLElement;
    fireEvent.click(dialog);
    expect(RuleBuilderUIBus.isBuilderOpen()).toBe(true);
    const backdrop = container.querySelector('.rule-builder-backdrop') as HTMLElement;
    fireEvent.click(backdrop);
    expect(RuleBuilderUIBus.isBuilderOpen()).toBe(false);
  });

  it('Enabled checkbox toggle zmienia state', () => {
    const { container } = render(<RuleBuilder />);
    RuleBuilderUIBus.openBuilder();
    const checkbox = container.querySelector('.rule-builder-enabled input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });
});
