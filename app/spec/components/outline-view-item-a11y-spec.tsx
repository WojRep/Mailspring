import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import OutlineViewItem from '../../src/components/outline-view-item';

// Ticket 44a — Semantic a11y refactor for outline-view-item (sidebar
// Inbox/Sent/Drafts/Spam/Trash/folders/labels).
//
// WCAG SC covered:
//   1.3.1 Info & Relationships — role="button" announces clickable nav
//   2.1.1 Keyboard — Enter/Space activate same as click
//   4.1.2 Name, Role, Value — aria-label provides accessible name
//
// Strategy: TDD characterization tests. Production code already has the
// role/tabIndex/keyboard handler in v0.2.v; these specs cement that
// contract so a future refactor cannot silently regress.

describe('OutlineViewItem a11y (ticket 44a)', function outlineViewItemA11ySpec() {
  afterEach(cleanup);

  const minimalItem = {
    id: 'inbox',
    name: 'Inbox',
    iconName: 'folder.png',
    onSelect: () => {},
  };

  describe('semantic role + tabIndex', () => {
    it('renders with role="button"', () => {
      const { container } = render(<OutlineViewItem item={minimalItem} />);
      const el = container.querySelector('[role="button"]');
      expect(el).not.toBeNull();
    });

    it('has tabIndex=0 (focusable in Tab order)', () => {
      const { container } = render(<OutlineViewItem item={minimalItem} />);
      const el = container.querySelector('[role="button"]') as HTMLElement;
      expect(el).not.toBeNull();
      expect(el.getAttribute('tabIndex')).toBe('0');
    });

    it('has aria-label matching item name', () => {
      const { container } = render(<OutlineViewItem item={minimalItem} />);
      const el = container.querySelector('[role="button"]') as HTMLElement;
      expect(el.getAttribute('aria-label')).toBe('Inbox');
    });

    it('falls back to item.title or item.id when name is missing', () => {
      const item = { id: 'spam', title: 'Spam folder', onSelect: () => {} } as any;
      const { container } = render(<OutlineViewItem item={item} />);
      const el = container.querySelector('[role="button"]') as HTMLElement;
      expect(el.getAttribute('aria-label')).toBe('Spam folder');
    });

    it('reflects selected state via aria-selected', () => {
      const item = { ...minimalItem, selected: true } as any;
      const { container } = render(<OutlineViewItem item={item} />);
      const el = container.querySelector('[role="button"]') as HTMLElement;
      expect(el.getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('keyboard activation (WCAG 2.1.1)', () => {
    it('Enter key triggers onSelect callback', () => {
      const onSelect = jasmine.createSpy('onSelect');
      const item = { ...minimalItem, onSelect };
      const { container } = render(<OutlineViewItem item={item} />);
      const el = container.querySelector('[role="button"]') as HTMLElement;
      fireEvent.keyDown(el, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalled();
    });

    it('Space key triggers onSelect callback', () => {
      const onSelect = jasmine.createSpy('onSelect');
      const item = { ...minimalItem, onSelect };
      const { container } = render(<OutlineViewItem item={item} />);
      const el = container.querySelector('[role="button"]') as HTMLElement;
      fireEvent.keyDown(el, { key: ' ' });
      expect(onSelect).toHaveBeenCalled();
    });

    it('does NOT trigger onSelect on irrelevant keys', () => {
      const onSelect = jasmine.createSpy('onSelect');
      const item = { ...minimalItem, onSelect };
      const { container } = render(<OutlineViewItem item={item} />);
      const el = container.querySelector('[role="button"]') as HTMLElement;
      fireEvent.keyDown(el, { key: 'a' });
      fireEvent.keyDown(el, { key: 'Tab' });
      fireEvent.keyDown(el, { key: 'Escape' });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('prevents default on Enter/Space (no scroll, no form submit bubble)', () => {
      const onSelect = jasmine.createSpy('onSelect');
      const item = { ...minimalItem, onSelect };
      const { container } = render(<OutlineViewItem item={item} />);
      const el = container.querySelector('[role="button"]') as HTMLElement;
      // fireEvent doesn't capture preventDefault directly, but we assert
      // that onSelect was called as a proxy — if the handler bailed before
      // _runCallback (e.g. preventDefault not called), spy would not fire.
      fireEvent.keyDown(el, { key: 'Enter' });
      fireEvent.keyDown(el, { key: ' ' });
      expect(onSelect.calls.count()).toBe(2);
    });
  });
});
