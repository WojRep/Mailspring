/**
 * SmartFolderWizard UI specs — bilet MVP #99 (UI implementation).
 *
 * Pokrycie:
 *  - Hidden gdy UIBus zamknięty / visible po openWizard.
 *  - role=dialog + aria-modal + aria-label PL+EN.
 *  - Create mode: empty form, add rule, name + save → SmartFolderStore.create.
 *  - Edit mode: load existing folder do form, edit, save → update.
 *  - Edit mode: delete button → SmartFolderStore.delete.
 *  - Validation: Save disabled gdy name pusty.
 *  - Rule rows: add / remove dynamic.
 *  - Field change resetuje operator + value gdy operator nie wspierany.
 *  - Match mode toggle.
 *  - Sort dropdown.
 *  - Escape / Cancel button / backdrop close.
 */

import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import SmartFolderWizard from '../internal_packages/smart-folder/lib/smart-folder-wizard';
import { SmartFolderUIBus } from '../internal_packages/smart-folder/lib/smart-folder-ui-bus';
import { SmartFolderStore } from '../internal_packages/smart-folder/lib/smart-folder-store';

describe('SmartFolderWizard UI — bilet MVP #99', () => {
  beforeEach(() => {
    SmartFolderStore._reset();
    SmartFolderStore.init();
    SmartFolderUIBus._reset();
  });

  afterEach(() => {
    cleanup();
    SmartFolderUIBus._reset();
  });

  it('jest hidden gdy UIBus zamknięty', () => {
    const { container } = render(<SmartFolderWizard />);
    expect(container.querySelector('.smart-folder-wizard')).toBeNull();
  });

  it('renderuje dialog z role + aria-modal + aria-label po openWizard', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    const dialog = container.querySelector('.smart-folder-wizard[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toMatch(/smart folder/i);
  });

  it('Create mode: pusty form, default 1 rule, Save disabled', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    const nameInput = container.querySelector('.smart-folder-wizard-name') as HTMLInputElement;
    expect(nameInput.value).toBe('');
    expect(container.querySelectorAll('.smart-folder-wizard-rule-row').length).toBe(1);
    const save = container.querySelector('.smart-folder-wizard-save') as HTMLButtonElement;
    expect(save.getAttribute('data-disabled')).toBe('true');
  });

  it('Wpisanie name aktywuje Save button', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    const nameInput = container.querySelector('.smart-folder-wizard-name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Klient X' } });
    const save = container.querySelector('.smart-folder-wizard-save') as HTMLButtonElement;
    expect(save.getAttribute('data-disabled')).toBe('false');
  });

  it('Save wywołuje SmartFolderStore.create + zamyka wizard', () => {
    const spy = spyOn(SmartFolderStore, 'create').andCallThrough();
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    fireEvent.change(
      container.querySelector('.smart-folder-wizard-name') as HTMLInputElement,
      { target: { value: 'Newsletter' } }
    );
    fireEvent.click(container.querySelector('.smart-folder-wizard-save') as HTMLButtonElement);
    expect(spy).toHaveBeenCalled();
    // Jasmine 1.x: spy.mostRecentCall.args (NIE spy.calls.mostRecent).
    expect((spy as any).mostRecentCall.args[0].name).toBe('Newsletter');
    expect(SmartFolderUIBus.isWizardOpen()).toBe(false);
  });

  it('Add rule button dodaje nowy rule row', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    expect(container.querySelectorAll('.smart-folder-wizard-rule-row').length).toBe(1);
    fireEvent.click(container.querySelector('.smart-folder-wizard-add-rule') as HTMLButtonElement);
    expect(container.querySelectorAll('.smart-folder-wizard-rule-row').length).toBe(2);
    fireEvent.click(container.querySelector('.smart-folder-wizard-add-rule') as HTMLButtonElement);
    expect(container.querySelectorAll('.smart-folder-wizard-rule-row').length).toBe(3);
  });

  it('Remove rule button usuwa wiersz; minimum 1 row zostaje', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    fireEvent.click(container.querySelector('.smart-folder-wizard-add-rule') as HTMLButtonElement);
    expect(container.querySelectorAll('.smart-folder-wizard-rule-row').length).toBe(2);
    const removes = container.querySelectorAll('.smart-folder-wizard-rule-remove');
    fireEvent.click(removes[0] as HTMLButtonElement);
    expect(container.querySelectorAll('.smart-folder-wizard-rule-row').length).toBe(1);
    // Drugi remove: row replaced empty (minimum 1).
    fireEvent.click(
      container.querySelector('.smart-folder-wizard-rule-remove') as HTMLButtonElement
    );
    expect(container.querySelectorAll('.smart-folder-wizard-rule-row').length).toBe(1);
  });

  it('Field change na has_attachment przełącza value input na select tak/nie', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    const fieldSelect = container.querySelector('.smart-folder-wizard-rule-field') as HTMLSelectElement;
    fireEvent.change(fieldSelect, { target: { value: 'has_attachment' } });
    const valueEl = container.querySelector('.smart-folder-wizard-rule-value') as HTMLElement;
    expect(valueEl.tagName).toBe('SELECT');
    expect((valueEl as HTMLSelectElement).value).toBe('true');
  });

  it('Field change na date przełącza operator na date-aware ops', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    const fieldSelect = container.querySelector('.smart-folder-wizard-rule-field') as HTMLSelectElement;
    fireEvent.change(fieldSelect, { target: { value: 'date' } });
    const opSelect = container.querySelector('.smart-folder-wizard-rule-op') as HTMLSelectElement;
    expect(['before', 'after', 'within_last_days']).toContain(opSelect.value);
  });

  it('Match mode toggle zmienia state', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    const matchSelect = container.querySelector('.smart-folder-wizard-match-select') as HTMLSelectElement;
    expect(matchSelect.value).toBe('all');
    fireEvent.change(matchSelect, { target: { value: 'any' } });
    expect(matchSelect.value).toBe('any');
  });

  it('Edit mode: ładuje folder do form', () => {
    const folder = SmartFolderStore.create({
      name: 'Klient ABC',
      match: 'any',
      rules: [{ field: 'from', op: 'contains', value: 'abc.com' }],
      sort: 'date_asc',
    });
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard(folder.id);
    const nameInput = container.querySelector('.smart-folder-wizard-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Klient ABC');
    const matchSelect = container.querySelector('.smart-folder-wizard-match-select') as HTMLSelectElement;
    expect(matchSelect.value).toBe('any');
    const rule = container.querySelector('.smart-folder-wizard-rule-row');
    expect(rule).not.toBeNull();
    const valueInput = rule!.querySelector('.smart-folder-wizard-rule-value') as HTMLInputElement;
    expect(valueInput.value).toBe('abc.com');
  });

  it('Edit mode: Save wywołuje SmartFolderStore.update', () => {
    const folder = SmartFolderStore.create({
      name: 'Stara',
      match: 'all',
      rules: [{ field: 'from', op: 'contains', value: 'x' }],
    });
    const spy = spyOn(SmartFolderStore, 'update').andCallThrough();
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard(folder.id);
    fireEvent.change(
      container.querySelector('.smart-folder-wizard-name') as HTMLInputElement,
      { target: { value: 'Nowa nazwa' } }
    );
    fireEvent.click(container.querySelector('.smart-folder-wizard-save') as HTMLButtonElement);
    expect(spy).toHaveBeenCalled();
    expect((spy as any).mostRecentCall.args[0]).toBe(folder.id);
    expect((spy as any).mostRecentCall.args[1].name).toBe('Nowa nazwa');
    expect(SmartFolderUIBus.isWizardOpen()).toBe(false);
  });

  it('Edit mode: Delete button wywołuje SmartFolderStore.delete', () => {
    const folder = SmartFolderStore.create({
      name: 'Do skasowania',
      match: 'all',
      rules: [],
    });
    const spy = spyOn(SmartFolderStore, 'delete').andCallThrough();
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard(folder.id);
    const deleteBtn = container.querySelector('.smart-folder-wizard-delete') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    fireEvent.click(deleteBtn);
    expect(spy).toHaveBeenCalledWith(folder.id);
    expect(SmartFolderUIBus.isWizardOpen()).toBe(false);
  });

  it('Create mode: brak Delete button (tylko Save + Cancel)', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    expect(container.querySelector('.smart-folder-wizard-delete')).toBeNull();
  });

  it('Escape zamyka wizard', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    const dialog = container.querySelector('.smart-folder-wizard') as HTMLElement;
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(SmartFolderUIBus.isWizardOpen()).toBe(false);
  });

  it('Cancel button zamyka wizard bez wywoływania create/update', () => {
    const createSpy = spyOn(SmartFolderStore, 'create').andCallThrough();
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    fireEvent.change(
      container.querySelector('.smart-folder-wizard-name') as HTMLInputElement,
      { target: { value: 'Nieukończony' } }
    );
    fireEvent.click(container.querySelector('.smart-folder-wizard-cancel') as HTMLButtonElement);
    expect(SmartFolderUIBus.isWizardOpen()).toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('Backdrop click zamyka wizard (click w dialog NIE zamyka)', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    const dialog = container.querySelector('.smart-folder-wizard') as HTMLElement;
    fireEvent.click(dialog);
    expect(SmartFolderUIBus.isWizardOpen()).toBe(true);
    const backdrop = container.querySelector('.smart-folder-wizard-backdrop') as HTMLElement;
    fireEvent.click(backdrop);
    expect(SmartFolderUIBus.isWizardOpen()).toBe(false);
  });

  it('Preview pokazuje liczbę reguł', () => {
    const { container } = render(<SmartFolderWizard />);
    SmartFolderUIBus.openWizard();
    fireEvent.click(container.querySelector('.smart-folder-wizard-add-rule') as HTMLButtonElement);
    fireEvent.click(container.querySelector('.smart-folder-wizard-add-rule') as HTMLButtonElement);
    const preview = container.querySelector('.smart-folder-wizard-preview');
    expect(preview!.textContent).toMatch(/3/);
  });
});
