/**
 * RED spec — CentrumDniaButton (#95 inline discoverability).
 *
 * Address user-reported gap (verbatim 2026-05-30): 'Nie widzę możliwości ...
 * czy punktu skupienia dla nich'.
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let CentrumDniaButton: any = null;
try {
  CentrumDniaButton = require('../internal_packages/centrum-dnia/lib/centrum-dnia-button').default;
} catch (e) { /* RED */ }

const { CentrumDniaStore } = require('../internal_packages/centrum-dnia/lib/centrum-dnia-store');

describe('CentrumDniaButton — #95 inline discoverability', () => {
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(CentrumDniaButton).not.toBeNull();
    expect(typeof CentrumDniaButton).toBe('function');
  });

  it('renders button z aria-label', () => {
    if (!CentrumDniaButton) return;
    const { container } = render(<CentrumDniaButton />);
    const btn = container.querySelector('.centrum-dnia-button') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toMatch(/centrum|today/i);
  });

  it('click toggle pane via store', () => {
    if (!CentrumDniaButton) return;
    const { container } = render(<CentrumDniaButton />);
    const btn = container.querySelector('.centrum-dnia-button') as HTMLElement;
    const beforeOpen = CentrumDniaStore.isPaneOpen ? CentrumDniaStore.isPaneOpen() : false;
    fireEvent.click(btn);
    const afterOpen = CentrumDniaStore.isPaneOpen ? CentrumDniaStore.isPaneOpen() : false;
    expect(afterOpen).toBe(!beforeOpen);
  });
});
