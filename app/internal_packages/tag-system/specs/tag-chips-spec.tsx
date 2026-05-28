/**
 * Bilet MVP #98 — Tag chips (reading pane header) UI tests.
 */

import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { React } from 'actunamail-exports';
import TagChips from '../lib/tag-chips';
import { TagStore } from '../lib/tag-store';

describe('Tag chips — bilet MVP #98', () => {

  beforeEach(() => {
    TagStore._reset();
    TagStore.init();
    TagStore.register({ id: 'q3', name: 'Q3', color: '#f00', source: 'user' });
    TagStore.register({ id: 'urg', name: 'Urgent', color: '#ff0', source: 'user' });
    TagStore.register({ id: '__system_today', name: 'Today', color: '#00f', source: 'system', systemManaged: true });
  });

  afterEach(cleanup);

  it('renders null gdy brak assigned tags', () => {
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    expect(container.querySelector('.tag-chips-row')).toBeNull();
  });

  it('renders chips per assigned tag', () => {
    TagStore.apply('t1', 'q3');
    TagStore.apply('t1', 'urg');
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    const chips = container.querySelectorAll('.tag-chip');
    expect(chips.length).toBe(2);
  });

  it('chip aria-label PL+EN (dual-language)', () => {
    TagStore.apply('t1', 'q3');
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    const chip = container.querySelector('.tag-chip') as HTMLElement;
    const label = chip.getAttribute('aria-label') || '';
    expect(label).toContain('Q3');
    expect(label).toMatch(/\//); // PL / EN separator
  });

  it('system tag ma --system modifier class', () => {
    TagStore.apply('t1', '__system_today');
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    expect(container.querySelector('.tag-chip--system')).not.toBeNull();
  });

  it('click on ✕ remove button removes tag', () => {
    TagStore.apply('t1', 'q3');
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    const removeBtn = container.querySelector('.tag-chip-remove') as HTMLElement;
    act(() => { fireEvent.click(removeBtn); });
    expect(TagStore.hasTag('t1', 'q3')).toBe(false);
  });

  it('remove button aria-label zawiera tag name', () => {
    TagStore.apply('t1', 'q3');
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    const removeBtn = container.querySelector('.tag-chip-remove') as HTMLElement;
    expect(removeBtn.getAttribute('aria-label')).toContain('Q3');
  });

  it('Backspace / Delete na chip removes', () => {
    TagStore.apply('t1', 'q3');
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    const chip = container.querySelector('.tag-chip') as HTMLElement;
    act(() => { fireEvent.keyDown(chip, { key: 'Backspace' }); });
    expect(TagStore.hasTag('t1', 'q3')).toBe(false);
  });

  it('re-renders on TagStore changes', () => {
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    expect(container.querySelector('.tag-chips-row')).toBeNull();
    act(() => { TagStore.apply('t1', 'q3'); });
    expect(container.querySelectorAll('.tag-chip').length).toBe(1);
    act(() => { TagStore.apply('t1', 'urg'); });
    expect(container.querySelectorAll('.tag-chip').length).toBe(2);
  });

  it('list role + listitem na chip (semantic)', () => {
    TagStore.apply('t1', 'q3');
    const { container } = render(<TagChips thread={{ id: 't1' }} />);
    expect(container.querySelector('[role="list"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(1);
  });

  it('accepts threadId prop alternative', () => {
    TagStore.apply('legacy', 'q3');
    const { container } = render(<TagChips threadId="legacy" />);
    expect(container.querySelectorAll('.tag-chip').length).toBe(1);
  });

  it('unmount cleans subscription', () => {
    const { unmount } = render(<TagChips thread={{ id: 't1' }} />);
    unmount();
    expect(() => { TagStore.apply('t1', 'q3'); }).not.toThrow();
  });

  it('thread prop change resubscribes', () => {
    TagStore.apply('t1', 'q3');
    const { container, rerender } = render(<TagChips thread={{ id: 't1' }} />);
    expect(container.querySelectorAll('.tag-chip').length).toBe(1);
    rerender(<TagChips thread={{ id: 't2' }} />);
    expect(container.querySelectorAll('.tag-chip').length).toBe(0);
  });
});
