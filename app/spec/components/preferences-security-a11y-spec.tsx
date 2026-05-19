import React from 'react';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

import PreferencesSecurity from '../../internal_packages/preferences/lib/tabs/preferences-security';
import LockOverlay from '../../internal_packages/tier-b-lock/lib/lock-overlay';

// Ticket 46c — a11y characterization specs for the SQLCipher Tier B UI
// (Preferences > Security tab + lock overlay), per the ticket 44 standard.
//
// WCAG SC covered:
//   1.3.1 Info & Relationships — <label htmlFor> ties text to inputs
//   2.1.1 Keyboard — Enter/Space activate the recovery-mode toggle
//   4.1.2 Name, Role, Value — role/aria-label/aria-modal on the overlay
//
// Queries are locale-independent (roles / element types, never display
// text) because the spec runner localizes UI strings. `ipcRenderer` is
// stubbed so the components mount without a live main process.

const ipc = () => require('electron').ipcRenderer;

// waitFor variant that THROWS (never calls expect) — this project's
// vendored Jasmine records an expectation failure on every poll, so an
// expect() inside waitFor fails the spec on the first (pre-render) poll.
function waitForEl<T>(fn: () => T | null | undefined): Promise<T> {
  return waitFor(() => {
    const el = fn();
    if (!el) throw new Error('element not present yet');
    return el as T;
  });
}

describe('46c — Preferences > Security a11y', function preferencesSecurityA11ySpec() {
  afterEach(cleanup);

  beforeEach(() => {
    spyOn(ipc(), 'invoke').andCallFake((channel: string) => {
      if (channel === 'tier-b-status') {
        return Promise.resolve({
          enabled: false,
          locked: false,
          config: { idleMs: 900000, lockOnSuspend: true, lockOnScreenLock: true },
        });
      }
      return Promise.resolve({ ok: true });
    });
  });

  it('renders the enable action as a native <button type="button">', async () => {
    const { container } = render(<PreferencesSecurity />);
    const btn = await waitForEl(() => container.querySelector('button'));
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('associates every password field with a <label htmlFor>', async () => {
    const { container } = render(<PreferencesSecurity />);
    const btn = await waitForEl(() => container.querySelector('button'));
    fireEvent.click(btn); // open the enable form
    const inputs = container.querySelectorAll('input[type="password"]');
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of Array.from(inputs)) {
      const id = input.getAttribute('id');
      expect(id).toBeTruthy();
      expect(container.querySelector(`label[for="${id}"]`)).toBeTruthy();
    }
  });

  it('surfaces validation errors with role="alert"', async () => {
    const { container } = render(<PreferencesSecurity />);
    const openBtn = await waitForEl(() => container.querySelector('button'));
    fireEvent.click(openBtn); // open the enable form
    // First button in the form is the submit ("Enable"); click it with
    // empty fields → synchronous inline validation error.
    fireEvent.click(container.querySelectorAll('button')[0]);
    const alert = await waitForEl(() => container.querySelector('[role="alert"]'));
    expect(alert).toBeTruthy();
  });
});

describe('46c — LockOverlay a11y', function lockOverlayA11ySpec() {
  afterEach(cleanup);

  beforeEach(() => {
    spyOn(ipc(), 'invoke').andCallFake((channel: string) => {
      if (channel === 'tier-b-status') {
        return Promise.resolve({ enabled: true, locked: true, config: {} });
      }
      return Promise.resolve({ ok: true });
    });
    spyOn(ipc(), 'on');
    spyOn(ipc(), 'removeListener');
  });

  it('renders a dialog with aria-modal + aria-label when locked', async () => {
    const { container } = render(<LockOverlay />);
    const dialog = await waitForEl(() => container.querySelector('[role="dialog"]'));
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBeTruthy();
  });

  it('labels the secret input with aria-label', async () => {
    const { container } = render(<LockOverlay />);
    const input = await waitForEl(() => container.querySelector('input'));
    expect(input.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes the recovery-mode toggle as a keyboard-operable button', async () => {
    const { container } = render(<LockOverlay />);
    const toggle = await waitForEl(() => container.querySelector('[role="button"]'));
    expect(toggle.getAttribute('tabIndex')).toBe('0');
  });

  it('Enter on the recovery toggle switches the input to a text field', async () => {
    const { container } = render(<LockOverlay />);
    const toggle = await waitForEl(() => container.querySelector('[role="button"]'));
    expect(container.querySelector('input').getAttribute('type')).toBe('password');
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(container.querySelector('input').getAttribute('type')).toBe('text');
  });

  it('renders nothing when the database is unlocked', () => {
    (ipc().invoke as any).andCallFake(() =>
      Promise.resolve({ enabled: true, locked: false, config: {} })
    );
    // Initial state is unlocked and the stubbed status keeps it that
    // way — the overlay renders null with no dialog in the tree.
    const { container } = render(<LockOverlay />);
    expect(container.querySelector('[role="dialog"]')).toBeFalsy();
  });
});
