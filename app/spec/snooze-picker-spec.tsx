/**
 * SnoozePicker UI specs — bilet MVP #104 (UI implementation).
 *
 * Pokrycie:
 *  - Initial state hidden gdy UIBus.isPickerOpen() === false.
 *  - Open visible (role=dialog + aria-modal + aria-label).
 *  - 7 preset buttons rendered z PL+EN labels.
 *  - Click presetu → SnoozeStore.snoozeByPreset + close.
 *  - Existing entry display + Un-snooze button + modify path.
 *  - Custom datetime toggle + future-only validation.
 *  - Escape closes; backdrop click closes; close button works.
 *  - Local-only warning gdy serverSupport === 'local_only'.
 */

import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import SnoozePicker from '../internal_packages/snooze/lib/snooze-picker';
import { SnoozeUIBus } from '../internal_packages/snooze/lib/snooze-ui-bus';
import { SnoozeStore } from '../internal_packages/snooze/lib/snooze-store';

describe('SnoozePicker UI — bilet MVP #104', () => {
  beforeEach(() => {
    SnoozeStore._reset();
    SnoozeStore.init();
    SnoozeUIBus._reset();
  });

  afterEach(() => {
    cleanup();
    SnoozeUIBus._reset();
  });

  it('jest hidden gdy UIBus zamknięty', () => {
    const { container } = render(<SnoozePicker />);
    expect(container.querySelector('.snooze-picker')).toBeNull();
  });

  it('renderuje dialog z role + aria-modal + aria-label gdy otwarty', () => {
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-1');
    // React batch — trigger sync
    const dialog = container.querySelector('.snooze-picker[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toMatch(/snooze/i);
  });

  it('renderuje 7 preset buttons z PL+EN labels', () => {
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-2');
    const buttons = container.querySelectorAll('.snooze-preset-btn');
    expect(buttons.length).toBe(7);
    const labels = Array.from(buttons).map(b => (b.textContent || '').toLowerCase());
    expect(labels.some(t => t.includes('później dziś') && t.includes('later today'))).toBe(true);
    expect(labels.some(t => t.includes('jutro rano') && t.includes('tomorrow morning'))).toBe(true);
    expect(labels.some(t => t.includes('kiedyś') && t.includes('someday'))).toBe(true);
  });

  it('click presetu wywołuje snoozeByPreset i zamyka dialog', () => {
    const spy = spyOn(SnoozeStore, 'snoozeByPreset').andCallThrough();
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-3');
    const tomorrow = container.querySelector('[data-preset="tomorrow_morning"]') as HTMLButtonElement;
    expect(tomorrow).not.toBeNull();
    fireEvent.click(tomorrow);
    expect(spy).toHaveBeenCalledWith('thread-3', 'tomorrow_morning');
    expect(SnoozeUIBus.isPickerOpen()).toBe(false);
  });

  it('Existing entry display + Un-snooze button widoczne dla snoozed threadu', () => {
    SnoozeStore.snoozeByPreset('thread-4', 'tomorrow_morning');
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-4');
    expect(container.querySelector('.snooze-picker-existing')).not.toBeNull();
    expect(container.querySelector('.snooze-picker-unsnooze')).not.toBeNull();
  });

  it('Un-snooze button wywołuje SnoozeStore.unsnooze i zamyka dialog', () => {
    SnoozeStore.snoozeByPreset('thread-5', 'next_week');
    const spy = spyOn(SnoozeStore, 'unsnooze').andCallThrough();
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-5');
    const btn = container.querySelector('.snooze-picker-unsnooze') as HTMLButtonElement;
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledWith('thread-5');
    expect(SnoozeUIBus.isPickerOpen()).toBe(false);
  });

  it('Modify path: click presetu na istniejącym threadzie wywołuje modify', () => {
    SnoozeStore.snoozeByPreset('thread-6', 'later_today');
    const modSpy = spyOn(SnoozeStore, 'modify').andCallThrough();
    const presetSpy = spyOn(SnoozeStore, 'snoozeByPreset').andCallThrough();
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-6');
    const next = container.querySelector('[data-preset="next_week"]') as HTMLButtonElement;
    fireEvent.click(next);
    expect(modSpy).toHaveBeenCalled();
    expect(presetSpy).not.toHaveBeenCalled();
  });

  it('Custom toggle pokazuje datetime-local input + Confirm', () => {
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-7');
    const toggle = container.querySelector('.snooze-picker-custom-toggle') as HTMLButtonElement;
    fireEvent.click(toggle);
    const input = container.querySelector('.snooze-picker-custom-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe('datetime-local');
    expect(container.querySelector('.snooze-picker-custom-confirm')).not.toBeNull();
  });

  it('Custom Confirm wywołuje snoozeUntil dla future wakeAt', () => {
    const spy = spyOn(SnoozeStore, 'snoozeUntil').andCallThrough();
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-8');
    fireEvent.click(container.querySelector('.snooze-picker-custom-toggle') as HTMLButtonElement);
    const input = container.querySelector('.snooze-picker-custom-input') as HTMLInputElement;
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const futureStr = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
    fireEvent.change(input, { target: { value: futureStr } });
    fireEvent.click(container.querySelector('.snooze-picker-custom-confirm') as HTMLButtonElement);
    expect(spy).toHaveBeenCalled();
    expect(SnoozeUIBus.isPickerOpen()).toBe(false);
  });

  it('Custom Confirm IGNORUJE past wakeAt (guard)', () => {
    const spy = spyOn(SnoozeStore, 'snoozeUntil').andCallThrough();
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-9');
    fireEvent.click(container.querySelector('.snooze-picker-custom-toggle') as HTMLButtonElement);
    const input = container.querySelector('.snooze-picker-custom-input') as HTMLInputElement;
    // React tracks lastNotifiedValue — bezpośrednie input.value = X NIE dispatcha
    // onChange. Pass target.value explicit dla fireEvent.change żeby React state
    // update (customValue) faktycznie się odpalił przed click Confirm.
    fireEvent.change(input, { target: { value: '2020-01-01T09:00' } });
    fireEvent.click(container.querySelector('.snooze-picker-custom-confirm') as HTMLButtonElement);
    expect(spy).not.toHaveBeenCalled();
    expect(SnoozeUIBus.isPickerOpen()).toBe(true);
  });

  it('Escape zamyka dialog', () => {
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-10');
    const dialog = container.querySelector('.snooze-picker') as HTMLElement;
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(SnoozeUIBus.isPickerOpen()).toBe(false);
  });

  it('Close button (×) zamyka dialog', () => {
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-11');
    fireEvent.click(container.querySelector('.snooze-picker-close') as HTMLButtonElement);
    expect(SnoozeUIBus.isPickerOpen()).toBe(false);
  });

  it('Backdrop click zamyka dialog (ale click w dialog NIE)', () => {
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-12');
    const dialog = container.querySelector('.snooze-picker') as HTMLElement;
    fireEvent.click(dialog); // click NA dialog — NIE close
    expect(SnoozeUIBus.isPickerOpen()).toBe(true);
    const backdrop = container.querySelector('.snooze-picker-backdrop') as HTMLElement;
    fireEvent.click(backdrop); // click NA backdrop — close
    expect(SnoozeUIBus.isPickerOpen()).toBe(false);
  });

  it('Local-only warning wyświetla się dla serverSupport=local_only', () => {
    SnoozeStore.snoozeByPreset('thread-13', 'tomorrow_morning', { serverSupport: 'local_only' });
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-13');
    expect(container.querySelector('.snooze-picker-warning')).not.toBeNull();
  });

  it('Local-only warning NIE wyświetla się dla serverSupport=gmail', () => {
    SnoozeStore.snoozeByPreset('thread-14', 'tomorrow_morning', { serverSupport: 'gmail' });
    const { container } = render(<SnoozePicker />);
    SnoozeUIBus.openPicker('thread-14');
    expect(container.querySelector('.snooze-picker-warning')).toBeNull();
  });
});
