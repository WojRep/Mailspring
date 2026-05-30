import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import EditableList from '../../src/components/editable-list';
import EditableTable from '../../src/components/editable-table';
import ScenarioEditorRow from '../../src/components/scenario-editor-row';
import { Template } from '../../src/components/scenario-editor-models';

// Ticket 44g — Semantic a11y refactor final sweep for preferences/rules
// editor components (editable-list, editable-table, scenario-editor-row).
//
// Each component previously rendered <div className="btn ..." onClick={...}>
// for its action buttons (Add/Remove column, Create/Delete item, Insert/
// Remove condition). After 44g they ship with role="button" + tabIndex={0}
// + aria-label + Enter/Space keyboard handler.
//
// WCAG SC covered:
//   1.3.1 Info & Relationships — role announces clickable action
//   2.1.1 Keyboard — Enter/Space activate same as click
//   4.1.2 Name, Role, Value — aria-label provides accessible name
//
// Strategy mirrors outline-view-item-a11y-spec.tsx (44a): characterization
// tests that cement the contract for future refactors.

describe('44g — EditableTable action buttons a11y', function editableTableA11ySpec() {
  afterEach(cleanup);

  // Użyć prawdziwego TableDataSource żeby spełnić instanceOf prop-type check
  // (in. PropTypes warning cascade + console pollution w spec output).
  const TableDataSource = require('../../src/components/table/table-data-source').default;
  const dataSource = new TableDataSource();
  dataSource.rows = () => [['a']];
  dataSource.columns = () => ['Col1'];
  dataSource.cellAt = ({ rowIdx, colIdx }: any) => ['a'][colIdx];
  dataSource.isHeaderRow = (idx: any) => idx === 0;
  dataSource.rowAt = (_idx: any) => ['a'];
  dataSource.colAt = (_idx: any) => 'Col1';
  dataSource.isEqual = () => false;

  const baseProps = {
    tableDataSource: dataSource,
    onCellEdited: () => {},
    onAddColumn: () => {},
    onRemoveColumn: () => {},
  };

  it('renders Add column button with role="button" + tabIndex=0 + aria-label', () => {
    const { container } = render(<EditableTable {...baseProps} />);
    const buttons = container.querySelectorAll('.column-actions [role="button"]');
    expect(buttons.length).toBe(2);
    const add = buttons[0] as HTMLElement;
    expect(add.getAttribute('tabIndex')).toBe('0');
    expect(add.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders Remove column button with role="button" + tabIndex=0 + aria-label', () => {
    const { container } = render(<EditableTable {...baseProps} />);
    const buttons = container.querySelectorAll('.column-actions [role="button"]');
    const remove = buttons[1] as HTMLElement;
    expect(remove.getAttribute('tabIndex')).toBe('0');
    expect(remove.getAttribute('aria-label')).toBeTruthy();
  });

  it('Enter on Add column triggers onAddColumn', () => {
    const onAddColumn = jasmine.createSpy('onAddColumn');
    const { container } = render(<EditableTable {...baseProps} onAddColumn={onAddColumn} />);
    const add = container.querySelectorAll('.column-actions [role="button"]')[0] as HTMLElement;
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(onAddColumn).toHaveBeenCalled();
  });

  it('Space on Remove column triggers onRemoveColumn', () => {
    const onRemoveColumn = jasmine.createSpy('onRemoveColumn');
    const { container } = render(<EditableTable {...baseProps} onRemoveColumn={onRemoveColumn} />);
    const remove = container.querySelectorAll('.column-actions [role="button"]')[1] as HTMLElement;
    fireEvent.keyDown(remove, { key: ' ' });
    expect(onRemoveColumn).toHaveBeenCalled();
  });

  it('does NOT trigger handler on irrelevant keys (Tab/Escape/letter)', () => {
    const onAddColumn = jasmine.createSpy('onAddColumn');
    const { container } = render(<EditableTable {...baseProps} onAddColumn={onAddColumn} />);
    const add = container.querySelectorAll('.column-actions [role="button"]')[0] as HTMLElement;
    fireEvent.keyDown(add, { key: 'Tab' });
    fireEvent.keyDown(add, { key: 'Escape' });
    fireEvent.keyDown(add, { key: 'a' });
    expect(onAddColumn).not.toHaveBeenCalled();
  });
});

describe('44g — EditableList action buttons a11y', function editableListA11ySpec() {
  afterEach(cleanup);

  const baseProps = {
    items: ['first'],
    itemContent: item => item,
    onCreateItem: () => {},
    onDeleteItem: () => {},
  };

  it('renders Create + Delete buttons with role="button" + tabIndex=0 + aria-label', () => {
    const { container } = render(<EditableList {...baseProps} />);
    const buttons = container.querySelectorAll('.buttons-wrapper [role="button"]');
    expect(buttons.length).toBe(2);
    for (const btn of Array.from(buttons)) {
      const el = btn as HTMLElement;
      expect(el.getAttribute('tabIndex')).toBe('0');
      expect(el.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('Enter on Create button triggers onCreateItem', () => {
    const onCreateItem = jasmine.createSpy('onCreateItem');
    const { container } = render(<EditableList {...baseProps} onCreateItem={onCreateItem} />);
    const create = container.querySelectorAll('.buttons-wrapper [role="button"]')[0] as HTMLElement;
    fireEvent.keyDown(create, { key: 'Enter' });
    expect(onCreateItem).toHaveBeenCalled();
  });

  it('Space on Delete button triggers onDeleteItem after row selection', () => {
    const onDeleteItem = jasmine.createSpy('onDeleteItem');
    const { container } = render(<EditableList {...baseProps} onDeleteItem={onDeleteItem} />);
    // Select first row by clicking it (production: _onItemClick on row <div>)
    const row = container.querySelector('.list-item') as HTMLElement;
    fireEvent.click(row);
    const del = container.querySelectorAll('.buttons-wrapper [role="button"]')[1] as HTMLElement;
    fireEvent.keyDown(del, { key: ' ' });
    expect(onDeleteItem).toHaveBeenCalled();
  });

  it('does NOT trigger handlers on irrelevant keys', () => {
    const onCreateItem = jasmine.createSpy('onCreateItem');
    const { container } = render(<EditableList {...baseProps} onCreateItem={onCreateItem} />);
    const create = container.querySelectorAll('.buttons-wrapper [role="button"]')[0] as HTMLElement;
    fireEvent.keyDown(create, { key: 'Tab' });
    fireEvent.keyDown(create, { key: 'Escape' });
    expect(onCreateItem).not.toHaveBeenCalled();
  });
});

describe('44g — ScenarioEditorRow action buttons a11y', function scenarioEditorRowA11ySpec() {
  afterEach(cleanup);

  const minimalTemplate = {
    key: 'subject',
    name: 'Subject',
    type: Template.Type.String,
    values: [],
  } as any;

  const baseProps = {
    instance: { templateKey: 'subject', value: '', comparatorKey: 'equals' } as any,
    templates: [minimalTemplate],
    removable: true,
    onChange: () => {},
    onRemove: () => {},
    onInsert: () => {},
  };

  it('renders Remove + Insert buttons with role="button" + tabIndex=0 + aria-label', () => {
    const { container } = render(<ScenarioEditorRow {...baseProps} />);
    const buttons = container.querySelectorAll('.actions [role="button"]');
    expect(buttons.length).toBe(2);
    for (const btn of Array.from(buttons)) {
      const el = btn as HTMLElement;
      expect(el.getAttribute('tabIndex')).toBe('0');
      expect(el.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('Enter on Remove triggers onRemove', () => {
    const onRemove = jasmine.createSpy('onRemove');
    const { container } = render(<ScenarioEditorRow {...baseProps} onRemove={onRemove} />);
    const remove = container.querySelectorAll('.actions [role="button"]')[0] as HTMLElement;
    fireEvent.keyDown(remove, { key: 'Enter' });
    expect(onRemove).toHaveBeenCalled();
  });

  it('Space on Insert triggers onInsert', () => {
    const onInsert = jasmine.createSpy('onInsert');
    const { container } = render(<ScenarioEditorRow {...baseProps} onInsert={onInsert} />);
    const insert = container.querySelectorAll('.actions [role="button"]')[1] as HTMLElement;
    fireEvent.keyDown(insert, { key: ' ' });
    expect(onInsert).toHaveBeenCalled();
  });

  it('omits Remove button entirely when removable=false', () => {
    const { container } = render(<ScenarioEditorRow {...baseProps} removable={false} />);
    const buttons = container.querySelectorAll('.actions [role="button"]');
    expect(buttons.length).toBe(1);
  });
});
