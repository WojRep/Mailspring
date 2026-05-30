/**
 * RED spec — PinToolbarButton (#93 Wave 3 inline discoverability).
 *
 * Address user-reported gap (verbatim 2026-05-30): 'Nie widzę możliwości
 * ... ustawień wazności emaili'. PinBadge w ThreadListIcon pokazuje state
 * ALE nie pozwala USTAWIĆ z toolbar — brak affordance bez znajomości Shift+P.
 *
 * PinToolbarButton jest mounted via ComponentRegistry role='ThreadActionsToolbarButton'
 * obok Star/Archive — discoverable click affordance.
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let PinToolbarButton: any = null;
try {
  PinToolbarButton = require('../internal_packages/priority-inbox-pin/lib/pin-toolbar-button').default;
} catch (e) { /* RED */ }

const { PinStore } = require('../internal_packages/priority-inbox-pin/lib/pin-store');

describe('PinToolbarButton — #93 plan v1.0 inline discoverability', () => {
  beforeEach(() => { PinStore._reset && PinStore._reset(); });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(PinToolbarButton).not.toBeNull();
    expect(typeof PinToolbarButton).toBe('function');
  });

  it('renders nothing gdy brak items', () => {
    if (!PinToolbarButton) return;
    const { container } = render(<PinToolbarButton items={[]} />);
    expect(container.querySelector('.pin-toolbar-button')).toBeNull();
  });

  it('renders button gdy item z id obecny', () => {
    if (!PinToolbarButton) return;
    const { container } = render(<PinToolbarButton items={[{ id: 't1' }]} />);
    const btn = container.querySelector('.pin-toolbar-button') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBeTruthy();
  });

  it('aria-pressed reflects pin state', () => {
    if (!PinToolbarButton) return;
    const { container } = render(<PinToolbarButton items={[{ id: 't2' }]} />);
    const btn = container.querySelector('.pin-toolbar-button') as HTMLElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('click toggles pin state', () => {
    if (!PinToolbarButton) return;
    const { container } = render(<PinToolbarButton items={[{ id: 't3' }]} />);
    const btn = container.querySelector('.pin-toolbar-button') as HTMLElement;
    expect(PinStore.isPinned('t3')).toBe(false);
    fireEvent.click(btn);
    expect(PinStore.isPinned('t3')).toBe(true);
  });
});
