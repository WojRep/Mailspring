/**
 * RED test (TDD #1) — QuickStepsToolbar component (#101 UI).
 *
 * Plan v1.0 #101 (acceptance criteria):
 * "Akcje seryjne — compound action shortcuts (Ctrl+Shift+1..9)" + UI panel
 * pokazujący toolbar buttons dla compound actions z showInToolbar=true.
 *
 * Mockup ref: design/mockups/15-compound-actions.html.
 *
 * Cycle:
 *  - RED: component nie istnieje
 *  - GREEN: minimal React component renderujący CompoundActionStore.toolbarFor()
 *  - REFACTOR: extract Button sub-component gdy duplikacja
 *
 * Per user 2026-05-30 mandate ("automatycznie z TDD" + "100% e2e coverage" +
 * "agile z tdd i ddd").
 */

import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

// Component będzie pisany w GREEN phase.
let QuickStepsToolbar: any = null;
try {
  QuickStepsToolbar = require('../internal_packages/akcje-seryjne/lib/quick-steps-toolbar').default;
} catch (e) {
  // RED phase — component nie istnieje jeszcze
}

const { CompoundActionStore } = require('../internal_packages/akcje-seryjne/lib/compound-action-store');

describe('QuickStepsToolbar UI — #101 plan v1.0', () => {
  beforeEach(() => {
    if (CompoundActionStore._reset) {
      CompoundActionStore._reset();
      CompoundActionStore.init();
    }
  });

  afterEach(() => { cleanup(); });

  it('component exists + jest komponentem React', () => {
    expect(QuickStepsToolbar).not.toBeNull();
    expect(typeof QuickStepsToolbar).toBe('function');
  });

  it('renderuje 0 buttonów gdy brak toolbar compound actions', () => {
    if (!QuickStepsToolbar) return; // RED phase fail above
    const { container } = render(<QuickStepsToolbar />);
    const btns = container.querySelectorAll('.quick-step-btn');
    expect(btns.length).toBe(0);
  });

  it('renderuje 1 button gdy 1 compound action z showInToolbar=true', () => {
    if (!QuickStepsToolbar) return;
    CompoundActionStore.create({
      name: 'Archive + Mark Read',
      shortcut: 1,
      actions: [{ type: 'mark_read', value: true }],
      showInToolbar: true,
      toolbarOrder: 1,
    });
    const { container } = render(<QuickStepsToolbar />);
    const btns = container.querySelectorAll('.quick-step-btn');
    expect(btns.length).toBe(1);
    const html = container.innerHTML;
    expect(html).toMatch(/Archive \+ Mark Read/);
  });

  it('renderuje number-key indicator (1-9) per shortcut przy compound action', () => {
    if (!QuickStepsToolbar) return;
    CompoundActionStore.create({
      name: 'Move to Project',
      shortcut: 3,
      actions: [{ type: 'move', value: 'folder-x' }],
      showInToolbar: true,
      toolbarOrder: 1,
    });
    const { container } = render(<QuickStepsToolbar />);
    const indicator = container.querySelector('.quick-step-shortcut');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toMatch(/3/);
  });

  it('button ma role="button" + aria-label PL+EN', () => {
    if (!QuickStepsToolbar) return;
    CompoundActionStore.create({
      name: 'Snooze 1d',
      shortcut: 5,
      actions: [{ type: 'snooze', value: 'tomorrow_morning' }],
      showInToolbar: true,
      toolbarOrder: 1,
    });
    const { container } = render(<QuickStepsToolbar />);
    const btn = container.querySelector('.quick-step-btn') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('role')).toBe('button');
    expect(btn.getAttribute('aria-label')).toMatch(/snooze 1d|skrót/i);
  });

  it('click button wykonuje dispatch (sprawdzamy że button jest interactive z onClick handler)', () => {
    if (!QuickStepsToolbar) return;
    CompoundActionStore.create({
      name: 'Quick Tag',
      shortcut: 2,
      actions: [{ type: 'tag', value: 'work' }],
      showInToolbar: true,
      toolbarOrder: 1,
    });
    const { container } = render(<QuickStepsToolbar />);
    const btn = container.querySelector('.quick-step-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    // Click nie powinno rzucić błędu (nawet jeśli wykonanie skutkuje no-op
    // bo brak focused thread w specie).
    expect(() => fireEvent.click(btn)).not.toThrow();
  });
});
