/**
 * Bilet MVP #98 — Preferences Tag Manager pane UI tests.
 */

import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { React } from 'actunamail-exports';
import PreferencesTags from '../lib/preferences-tags';
import { TagStore } from '../lib/tag-store';

function seedTags() {
  TagStore.register({ id: 'q3', name: 'Q3', color: '#f00', source: 'user' });
  TagStore.register({ id: 'inv', name: 'Invoices', color: '#0f0', source: 'user' });
  TagStore.register({
    id: '__system_today',
    name: 'Today',
    color: '#00f',
    source: 'system',
    systemManaged: true,
  });
}

describe('Preferences Tag Manager — bilet MVP #98', () => {
  beforeEach(() => {
    TagStore._reset();
    TagStore.init();
  });

  afterEach(cleanup);

  it('renders empty state gdy brak tagów', () => {
    const { container } = render(<PreferencesTags />);
    expect(container.querySelector('.preferences-tags-pane')).not.toBeNull();
    // empty list shows "Brak / None"
    const empties = container.querySelectorAll('.preferences-tags-list-empty');
    expect(empties.length).toBe(2); // 2 sections (user + system)
  });

  it('renders user + system tags w osobnych sekcjach', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    const userItems = container.querySelectorAll('.preferences-tags-list-item:not(.system)');
    const sysItems = container.querySelectorAll('.preferences-tags-list-item.system');
    expect(userItems.length).toBe(2);
    expect(sysItems.length).toBe(1);
  });

  it('add new user tag z input + Enter', () => {
    const { container } = render(<PreferencesTags />);
    const input = container.querySelector('.preferences-tags-add-input') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'NewTag' } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    const created = TagStore.list().filter((t) => t.name === 'NewTag');
    expect(created.length).toBe(1);
    expect(created[0].source).toBe('user');
  });

  it('Add button disabled gdy empty name', () => {
    const { container } = render(<PreferencesTags />);
    const btn = container.querySelector('.preferences-tags-add-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const input = container.querySelector('.preferences-tags-add-input') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'X' } });
    });
    expect(btn.disabled).toBe(false);
  });

  it('click user tag → detail panel widoczny + editable', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    const items = container.querySelectorAll('.preferences-tags-list-item:not(.system)');
    act(() => {
      fireEvent.click(items[0]);
    });
    const renameInput = container.querySelector('#tag-rename') as HTMLInputElement;
    expect(renameInput).not.toBeNull();
    expect(renameInput.disabled).toBe(false);
  });

  it('click system tag → detail editable=false + note', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    const sysItem = container.querySelector('.preferences-tags-list-item.system') as HTMLElement;
    act(() => {
      fireEvent.click(sysItem);
    });
    const renameInput = container.querySelector('#tag-rename') as HTMLInputElement;
    expect(renameInput.disabled).toBe(true);
    expect(container.querySelector('.preferences-tags-detail-note')).not.toBeNull();
  });

  it('rename user tag via input + blur commits', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    const userItems = container.querySelectorAll('.preferences-tags-list-item:not(.system)');
    act(() => {
      fireEvent.click(userItems[0]);
    }); // Invoices (alpha first)
    const renameInput = container.querySelector('#tag-rename') as HTMLInputElement;
    act(() => {
      fireEvent.change(renameInput, { target: { value: 'Invoices renamed' } });
    });
    act(() => {
      fireEvent.blur(renameInput);
    });
    expect(TagStore.get('inv')?.name).toBe('Invoices renamed');
  });

  it('color swatch select changes color', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    const userItems = container.querySelectorAll('.preferences-tags-list-item:not(.system)');
    act(() => {
      fireEvent.click(userItems[0]);
    });
    const colorSwatches = container.querySelectorAll(
      '.preferences-tags-color-grid .preferences-tags-color-swatch'
    );
    expect(colorSwatches.length).toBeGreaterThan(1);
    act(() => {
      fireEvent.click(colorSwatches[1]);
    });
    const updated = TagStore.get('inv');
    // Color must be different than original '#0f0' z DEFAULT_COLORS palette
    expect(updated?.color).toMatch(/^var\(/);
  });

  it('merge select pokazuje INNE user tags (excluding selected)', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    const userItems = container.querySelectorAll('.preferences-tags-list-item:not(.system)');
    act(() => {
      fireEvent.click(userItems[0]);
    }); // Invoices
    const mergeSelect = container.querySelector('#tag-merge') as HTMLSelectElement;
    const options = mergeSelect.querySelectorAll('option');
    // 1 placeholder + 1 inny user tag (Q3) — system pominięte
    expect(options.length).toBe(2);
  });

  it('merge button moves source → target + selects target', () => {
    seedTags();
    TagStore.apply('thread-1', 'inv');
    const { container } = render(<PreferencesTags />);
    const userItems = container.querySelectorAll('.preferences-tags-list-item:not(.system)');
    act(() => {
      fireEvent.click(userItems[0]);
    }); // Invoices
    const mergeSelect = container.querySelector('#tag-merge') as HTMLSelectElement;
    act(() => {
      fireEvent.change(mergeSelect, { target: { value: 'q3' } });
    });
    const mergeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Połącz') || b.textContent?.includes('Merge')
    ) as HTMLButtonElement;
    act(() => {
      fireEvent.click(mergeBtn);
    });
    expect(TagStore.get('inv')).toBeUndefined();
    expect(TagStore.hasTag('thread-1', 'q3')).toBe(true);
  });

  it('delete button — pierwszy klik confirm state, drugi delete', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    const userItems = container.querySelectorAll('.preferences-tags-list-item:not(.system)');
    act(() => {
      fireEvent.click(userItems[0]);
    });
    const delBtn = container.querySelector('.preferences-tags-delete') as HTMLButtonElement;
    expect(delBtn.classList.contains('confirm')).toBe(false);
    act(() => {
      fireEvent.click(delBtn);
    });
    // Re-find po re-render
    const delBtn2 = container.querySelector('.preferences-tags-delete') as HTMLButtonElement;
    expect(delBtn2.classList.contains('confirm')).toBe(true);
    expect(TagStore.get('inv')).not.toBeUndefined();
    act(() => {
      fireEvent.click(delBtn2);
    });
    expect(TagStore.get('inv')).toBeUndefined();
  });

  it('listbox + option ARIA roles', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="option"]').length).toBe(3);
    expect(container.querySelectorAll('[role="radiogroup"]').length).toBeGreaterThan(0);
  });

  it('system tag option ma aria-disabled', () => {
    seedTags();
    const { container } = render(<PreferencesTags />);
    const sysOption = container.querySelector('.preferences-tags-list-item.system') as HTMLElement;
    expect(sysOption.getAttribute('aria-disabled')).toBe('true');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<PreferencesTags />);
    unmount();
    expect(() => {
      TagStore.register({ id: 'x', name: 'X', color: '#fff', source: 'user' });
    }).not.toThrow();
  });
});
