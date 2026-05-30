/**
 * RED test — CheatSheetOverlay (#109 UI).
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let CheatSheetOverlay: any = null;
try {
  CheatSheetOverlay = require('../internal_packages/keyboard-mapping/lib/cheatsheet-overlay').default;
} catch (e) { /* RED */ }

const { CheatSheetUIBus } = require('../internal_packages/keyboard-mapping/lib/cheatsheet-ui-bus');

describe('CheatSheetOverlay — #109 plan v1.0', () => {
  beforeEach(() => { CheatSheetUIBus._reset(); });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(CheatSheetOverlay).not.toBeNull();
    expect(typeof CheatSheetOverlay).toBe('function');
  });

  it('hidden by default', () => {
    if (!CheatSheetOverlay) return;
    const { container } = render(<CheatSheetOverlay />);
    expect(container.querySelector('.cheatsheet-overlay')).toBeNull();
  });

  it('open → renderuje dialog z aria', () => {
    if (!CheatSheetOverlay) return;
    const { container } = render(<CheatSheetOverlay />);
    CheatSheetUIBus.open();
    const d = container.querySelector('.cheatsheet-overlay[role="dialog"]') as HTMLElement;
    expect(d).not.toBeNull();
    expect(d.getAttribute('aria-modal')).toBe('true');
  });

  it('renderuje bindings sekcje (Mail / Navigation / Compose itp.)', () => {
    if (!CheatSheetOverlay) return;
    const { container } = render(<CheatSheetOverlay />);
    CheatSheetUIBus.open();
    const sections = container.querySelectorAll('.cheatsheet-section');
    expect(sections.length).toBeGreaterThan(0);
  });

  it('Escape close', () => {
    if (!CheatSheetOverlay) return;
    const { container } = render(<CheatSheetOverlay />);
    CheatSheetUIBus.open();
    const d = container.querySelector('.cheatsheet-overlay') as HTMLElement;
    fireEvent.keyDown(d, { key: 'Escape' });
    expect(CheatSheetUIBus.isOpen()).toBe(false);
  });
});
