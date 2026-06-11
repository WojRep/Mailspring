/**
 * Bilet MVP #98 — Tag picker (Cmd+L modal) UI tests.
 */

import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { React } from 'actunamail-exports';
import TagPicker from '../lib/tag-picker';
import { TagStore } from '../lib/tag-store';
import { TagSystemUIBus } from '../lib/tag-system-ui-bus';

function seedTags() {
  TagStore.register({ id: 'q3', name: 'Q3', color: '#f00', source: 'user' });
  TagStore.register({ id: 'invoices', name: 'Invoices', color: '#0f0', source: 'user' });
  TagStore.register({
    id: '__system_today',
    name: 'Today',
    color: '#00f',
    source: 'system',
    systemManaged: true,
  });
}

describe('Tag picker — bilet MVP #98', () => {
  beforeEach(() => {
    TagStore._reset();
    TagSystemUIBus._reset();
    TagStore.init();
  });

  afterEach(cleanup);

  it('renders null when picker closed', () => {
    const { container } = render(<TagPicker />);
    expect(container.querySelector('.tag-picker')).toBeNull();
  });

  it('renders dialog when TagSystemUIBus.openPicker(threadId)', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBeTruthy();
  });

  it('lists all tags z store', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const rows = container.querySelectorAll('.tag-picker-row');
    expect(rows.length).toBe(3);
  });

  it('system tag ma badge + system class', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const systemRows = container.querySelectorAll('.tag-picker-row.system');
    expect(systemRows.length).toBe(1);
    expect(systemRows[0].querySelector('.tag-picker-system-badge')).not.toBeNull();
  });

  it('input filtering case-insensitive', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const input = container.querySelector('.tag-picker-input') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'inv' } });
    });
    const rows = container.querySelectorAll('.tag-picker-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Invoices');
  });

  it('click on row toggles assignment', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    expect(TagStore.hasTag('thread-1', 'q3')).toBe(false);
    const rows = container.querySelectorAll('.tag-picker-row');
    const q3row = Array.from(rows).find((r) => r.textContent?.includes('Q3')) as HTMLElement;
    act(() => {
      fireEvent.click(q3row);
    });
    expect(TagStore.hasTag('thread-1', 'q3')).toBe(true);
    act(() => {
      fireEvent.click(q3row);
    });
    expect(TagStore.hasTag('thread-1', 'q3')).toBe(false);
  });

  it('checked state odpowiada assignments', () => {
    seedTags();
    TagStore.apply('thread-1', 'q3');
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const checkboxes = container.querySelectorAll('.tag-picker-checkbox');
    const checkedNodes = Array.from(checkboxes).filter(
      (c) => c.getAttribute('data-checked') === 'true'
    );
    expect(checkedNodes.length).toBe(1);
  });

  it('Esc closes picker', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    expect(TagSystemUIBus.isPickerOpen()).toBe(false);
  });

  it('backdrop click closes', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const backdrop = container.querySelector('.tag-picker-backdrop') as HTMLElement;
    act(() => {
      fireEvent.click(backdrop);
    });
    expect(TagSystemUIBus.isPickerOpen()).toBe(false);
  });

  it('Enter z empty filter (no match) tworzy nowy user tag z query name', () => {
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const input = container.querySelector('.tag-picker-input') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'newtag' } });
    });
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      fireEvent.keyDown(dialog, { key: 'Enter' });
    });
    const tags = TagStore.list().filter((t) => t.name === 'newtag');
    expect(tags.length).toBe(1);
    // Auto-applied do current thread
    expect(TagStore.getTags('thread-1').some((t) => t.name === 'newtag')).toBe(true);
  });

  it('Enter z focused row toggles tag (no create)', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      fireEvent.keyDown(dialog, { key: 'Enter' });
    });
    // focusIndex=0 = first row (Invoices alfabetic before Q3)
    const first = TagStore.list()[0];
    expect(TagStore.hasTag('thread-1', first.id)).toBe(true);
  });

  it('ArrowDown / ArrowUp moves focusIndex', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    });
    // After ArrowDown focusIndex=1 → second row.focused
    const focused = container.querySelector('.tag-picker-row.focused');
    expect(focused).not.toBeNull();
    expect(Array.from(container.querySelectorAll('.tag-picker-row')).indexOf(focused!)).toBe(1);
  });

  it('listbox + option ARIA roles obecne', () => {
    seedTags();
    const { container } = render(<TagPicker />);
    act(() => {
      TagSystemUIBus.openPicker('thread-1');
    });
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="option"]').length).toBe(3);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<TagPicker />);
    unmount();
    expect(() => {
      TagSystemUIBus.openPicker('t1');
    }).not.toThrow();
  });

  describe('TagSystemUIBus', () => {
    it('openPicker/closePicker idempotent + listen emit', () => {
      let count = 0;
      const unsub = TagSystemUIBus.listen(() => count++);
      TagSystemUIBus.openPicker('t1');
      TagSystemUIBus.openPicker('t1'); // dupe — no emit
      TagSystemUIBus.closePicker();
      TagSystemUIBus.closePicker(); // dupe — no emit
      expect(count).toBe(2);
      unsub();
    });

    it('openPicker pusty threadId ignoruje', () => {
      TagSystemUIBus.openPicker('');
      expect(TagSystemUIBus.isPickerOpen()).toBe(false);
    });

    it('openManager / closeManager', () => {
      expect(TagSystemUIBus.isManagerOpen()).toBe(false);
      TagSystemUIBus.openManager();
      expect(TagSystemUIBus.isManagerOpen()).toBe(true);
      TagSystemUIBus.closeManager();
      expect(TagSystemUIBus.isManagerOpen()).toBe(false);
    });
  });
});
