/**
 * Test — ColoredFlagButton: menu 7 kolorów (override-aware) + „Wymaż flagę";
 * wybór koloru kolejkuje (Actions.queueTasks); Escape zamyka; pozycje dostępne
 * z klawiatury (role menuitemradio + Enter/Spacja).
 */

import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Actions } from 'actunamail-exports';
import { ColoredFlagButton } from '../internal_packages/thread-list/lib/thread-toolbar-buttons';

describe('ColoredFlagButton', () => {
  afterEach(() => cleanup());

  it('otwiera menu z 7 kolorami (role menuitemradio) + Wymaż', () => {
    const { container, getByLabelText } = render(
      <ColoredFlagButton items={[{ id: 't1' }] as any} />
    );
    fireEvent.click(getByLabelText('Flag'));
    expect(container.querySelectorAll('.flag-color-swatch').length).toBe(7);
    expect(container.querySelectorAll('[role="menuitemradio"]').length).toBe(7);
    expect(container.querySelector('.flag-color-menu-clear')).toBeTruthy();
  });

  it('wybór koloru kolejkuje jeden blok zadań (queueTasks)', () => {
    spyOn(Actions, 'queueTasks');
    const { container, getByLabelText } = render(
      <ColoredFlagButton items={[{ id: 't1' }] as any} />
    );
    fireEvent.click(getByLabelText('Flag'));
    const items = container.querySelectorAll('.flag-color-menu-item');
    fireEvent.click(items[4]); // blue (value 4)
    expect((Actions.queueTasks as any).callCount).toBe(1);
  });

  it('Enter na pozycji aktywuje (dostępność z klawiatury)', () => {
    spyOn(Actions, 'queueTasks');
    const { container, getByLabelText } = render(
      <ColoredFlagButton items={[{ id: 't1' }] as any} />
    );
    fireEvent.click(getByLabelText('Flag'));
    const item = container.querySelector('[role="menuitemradio"]') as HTMLElement;
    expect(item.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(item, { key: 'Enter' });
    expect((Actions.queueTasks as any).callCount).toBe(1);
  });

  it('Escape zamyka menu', () => {
    const { container, getByLabelText } = render(
      <ColoredFlagButton items={[{ id: 't1' }] as any} />
    );
    fireEvent.click(getByLabelText('Flag'));
    expect(container.querySelector('.flag-color-menu')).toBeTruthy();
    fireEvent.keyDown(container.querySelector('.flag-color-button')!, { key: 'Escape' });
    expect(container.querySelector('.flag-color-menu')).toBeFalsy();
  });
});
