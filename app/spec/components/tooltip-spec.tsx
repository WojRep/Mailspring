import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { Tooltip } from '../../src/components/tooltip';

// Ticket 43b — Tooltip component spec (TDD RED → GREEN).
//
// Coverage:
//   - Render: children visible, tooltip not yet in DOM
//   - Hover behaviour: tooltip appears after delay
//   - ARIA: trigger has aria-describedby pointing at tooltip id
//   - Dismiss: Esc key hides tooltip
//   - Smart positioning (auto-flip near viewport edge) — tested indirectly
//     via floating-ui's own test suite; we just assert placement attribute.

describe('Tooltip', function tooltipSpec() {
  afterEach(cleanup);

  describe('initial render', () => {
    it('renders children without tooltip in DOM', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Send message">
          <button>Send</button>
        </Tooltip>
      );
      expect(container.querySelector('button')).toBeTruthy();
      expect(container.querySelector('button')!.textContent).toBe('Send');
      expect(queryByRole('tooltip')).toBeNull();
    });
  });

  describe('hover behaviour', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });
    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('shows tooltip after default 300ms hover delay', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Send message">
          <button>Send</button>
        </Tooltip>
      );
      const btn = container.querySelector('button')!;
      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(350);
      const tip = queryByRole('tooltip');
      expect(tip).not.toBeNull();
      expect(tip!.textContent).toContain('Send message');
    });

    it('respects custom delay prop', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Quick tip" delay={100}>
          <button>X</button>
        </Tooltip>
      );
      const btn = container.querySelector('button')!;
      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(50);
      expect(queryByRole('tooltip')).toBeNull();
      jasmine.clock().tick(100);
      expect(queryByRole('tooltip')).not.toBeNull();
    });

    it('hides tooltip on mouse leave', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Hover me">
          <button>X</button>
        </Tooltip>
      );
      const btn = container.querySelector('button')!;
      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(350);
      expect(queryByRole('tooltip')).not.toBeNull();
      fireEvent.pointerLeave(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(50);
      expect(queryByRole('tooltip')).toBeNull();
    });
  });

  describe('accessibility (WCAG 1.4.13)', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });
    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('connects trigger and tooltip via aria-describedby', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Aria tip">
          <button>X</button>
        </Tooltip>
      );
      const btn = container.querySelector('button')!;
      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(350);
      const tip = queryByRole('tooltip');
      expect(tip).not.toBeNull();
      const tipId = tip!.id;
      expect(tipId.length).toBeGreaterThan(0);
      expect(btn.getAttribute('aria-describedby')).toBe(tipId);
    });

    it('tooltip has role="tooltip"', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Role check">
          <button>X</button>
        </Tooltip>
      );
      const btn = container.querySelector('button')!;
      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(350);
      expect(queryByRole('tooltip')).not.toBeNull();
    });

    it('dismisses tooltip on Escape key', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Esc to dismiss">
          <button>X</button>
        </Tooltip>
      );
      const btn = container.querySelector('button')!;
      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(350);
      expect(queryByRole('tooltip')).not.toBeNull();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(queryByRole('tooltip')).toBeNull();
    });
  });

  describe('placement', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });
    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('defaults to top placement', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Top default">
          <button>X</button>
        </Tooltip>
      );
      const btn = container.querySelector('button')!;
      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(350);
      const tip = queryByRole('tooltip');
      // floating-ui exposes the active placement via data-placement.
      // Initial placement is what we requested unless auto-flip kicks in.
      expect(tip!.getAttribute('data-placement')).toMatch(/^top/);
    });

    it('respects explicit placement prop', () => {
      const { container, queryByRole } = render(
        <Tooltip content="Right side" placement="right">
          <button>X</button>
        </Tooltip>
      );
      const btn = container.querySelector('button')!;
      fireEvent.pointerEnter(btn, { pointerType: 'mouse' });
      jasmine.clock().tick(350);
      const tip = queryByRole('tooltip');
      expect(tip!.getAttribute('data-placement')).toMatch(/^right/);
    });
  });
});
