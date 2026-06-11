/**
 * Bilet #118 — TagChipsCompact: chipy tagów w wierszach listy wątków
 * (slot Thread:MailLabel). RED first per TDD.
 */

import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import TagChipsCompact from '../internal_packages/tag-system/lib/tag-chips-compact';
import { TagStore } from '../internal_packages/tag-system/lib/tag-store';

describe('TagChipsCompact — bilet #118', () => {

  beforeEach(() => {
    TagStore._reset();
    TagStore.init();
    TagStore.register({ id: 'q3', name: 'Q3', color: '#f00', source: 'user' });
    TagStore.register({ id: 'urg', name: 'Urgent', color: '#ff0', source: 'user' });
    TagStore.register({ id: 'foo', name: 'Foo', color: '#0f0', source: 'user' });
    TagStore.register({ id: 'bar', name: 'Bar', color: '#00f', source: 'user' });
    TagStore.register({ id: 'baz', name: 'Baz', color: '#0ff', source: 'user' });
    TagStore.register({ id: '__system_today', name: 'Today', color: '#00f', source: 'system', systemManaged: true });
  });

  afterEach(cleanup);

  it('renders null gdy brak assigned tags', () => {
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    expect(container.querySelector('.tag-chips-compact-row')).toBeNull();
  });

  it('renders chip z color dot + tekstem nazwy per assigned tag (WCAG 1.4.1)', () => {
    TagStore.apply('t1', 'q3');
    TagStore.apply('t1', 'urg');
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    const chips = container.querySelectorAll('.tag-chip-compact');
    expect(chips.length).toBe(2);
    const names = Array.from(chips).map(c => (c.querySelector('.tag-chip-compact-name') as HTMLElement).textContent);
    expect(names).toContain('Q3');
    expect(names).toContain('Urgent');
    const dot = chips[0].querySelector('.tag-chip-compact-dot') as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.getAttribute('aria-hidden')).toBe('true');
  });

  it('cap 3 chipy + overflow chip "+N" z aria-label wymieniającym pozostałe', () => {
    for (const id of ['q3', 'urg', 'foo', 'bar', 'baz']) TagStore.apply('t1', id);
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    expect(container.querySelectorAll('.tag-chip-compact').length).toBe(3);
    const overflow = container.querySelector('.tag-chip-compact-overflow') as HTMLElement;
    expect(overflow).not.toBeNull();
    expect(overflow.textContent).toBe('+2');
    const label = overflow.getAttribute('aria-label') || '';
    // aria-label wymienia ukryte tagi (2 ostatnie alfabetycznie po posortowaniu)
    expect(label.length).toBeGreaterThan(2);
  });

  it('live update po emisji TagStore (apply/remove)', () => {
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    expect(container.querySelector('.tag-chips-compact-row')).toBeNull();
    act(() => { TagStore.apply('t1', 'q3'); });
    expect(container.querySelectorAll('.tag-chip-compact').length).toBe(1);
    act(() => { TagStore.remove('t1', 'q3'); });
    expect(container.querySelector('.tag-chips-compact-row')).toBeNull();
  });

  it('read-only: BRAK przycisku remove (usuwanie zostaje w reading pane/pickerze)', () => {
    TagStore.apply('t1', 'q3');
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.tag-chip-remove')).toBeNull();
  });

  it('aria-label PL+EN na row (dual-language)', () => {
    TagStore.apply('t1', 'q3');
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    const row = container.querySelector('.tag-chips-compact-row') as HTMLElement;
    const label = row.getAttribute('aria-label') || '';
    expect(label).toMatch(/\//); // PL / EN separator
  });

  it('system tag ma modifier class --system', () => {
    TagStore.apply('t1', '__system_today');
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    expect(container.querySelector('.tag-chip-compact--system')).not.toBeNull();
  });

  it('accepts threadId prop alternative (test-friendly jak PinBadge)', () => {
    TagStore.apply('legacy', 'q3');
    const { container } = render(<TagChipsCompact threadId="legacy" />);
    expect(container.querySelectorAll('.tag-chip-compact').length).toBe(1);
  });

  it('thread prop change re-syncs', () => {
    TagStore.apply('t1', 'q3');
    const { container, rerender } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    expect(container.querySelectorAll('.tag-chip-compact').length).toBe(1);
    rerender(<TagChipsCompact thread={{ id: 't2' }} />);
    expect(container.querySelectorAll('.tag-chip-compact').length).toBe(0);
  });

  it('unmount cleans subscription (no leak)', () => {
    const { unmount } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    unmount();
    expect(() => { TagStore.apply('t1', 'q3'); }).not.toThrow();
  });

  it('containerRequired = false (slot injection bez wrappera)', () => {
    expect((TagChipsCompact as any).containerRequired).toBe(false);
  });

  // QA #118: chip ma cienką obramówkę w kolorze kropki tagu (widoczność).
  it('chip ma border w kolorze tagu (border = kolor kropki)', () => {
    TagStore.register({ id: 'vis', name: 'Vis', color: 'rgb(255, 99, 71)', source: 'user' });
    TagStore.apply('t1', 'vis');
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    const chip = container.querySelector('.tag-chip-compact') as HTMLElement;
    expect(chip.style.borderColor).toBe('rgb(255, 99, 71)');
  });

  it('overflow chip "+N" BEZ kolorowej obramówki (neutralny)', () => {
    for (const id of ['q3', 'urg', 'foo', 'bar', 'baz']) TagStore.apply('t1', id);
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    const overflow = container.querySelector('.tag-chip-compact-overflow') as HTMLElement;
    expect(overflow.style.borderColor).toBe('');
  });

  // Bilet #120: tag priorytetowy (preset Eisenhower/ABC) renderowany PIERWSZY.
  it('tag priorytetowy renderuje się przed tagami usera (rank first)', () => {
    const { PriorityPresetStore, PRESETS } =
      require('../internal_packages/tag-system/lib/priority-preset-store');
    PriorityPresetStore._reset();
    PriorityPresetStore.activatePreset('eisenhower');
    const q1 = PRESETS.eisenhower.members[0].id;
    TagStore.apply('t1', 'q3');
    TagStore.apply('t1', q1);
    const { container } = render(<TagChipsCompact thread={{ id: 't1' }} />);
    const names = Array.from(container.querySelectorAll('.tag-chip-compact-name')).map(
      n => (n as HTMLElement).textContent
    );
    expect(names[0]).toBe(PRESETS.eisenhower.members[0].name);
    PriorityPresetStore._reset();
  });
});
