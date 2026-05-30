/**
 * RED test — TrackerProtectionIndicator (#111 UI).
 */
import React from 'react';
import { render, cleanup } from '@testing-library/react';

let TrackerProtectionIndicator: any = null;
try {
  TrackerProtectionIndicator = require('../internal_packages/tracker-blocker/lib/tracker-protection-indicator').default;
} catch (e) { /* RED */ }

describe('TrackerProtectionIndicator — #111 plan v1.0', () => {
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(TrackerProtectionIndicator).not.toBeNull();
    expect(typeof TrackerProtectionIndicator).toBe('function');
  });

  it('renderuje NIC gdy thread bez stripResult', () => {
    if (!TrackerProtectionIndicator) return;
    const { container } = render(<TrackerProtectionIndicator />);
    expect(container.querySelector('.tracker-protection-indicator')).toBeNull();
  });

  it('renderuje badge gdy thread ma trackersBlocked > 0', () => {
    if (!TrackerProtectionIndicator) return;
    const thread = { id: 't1', stripResult: { trackersBlocked: 3, imagesProcessed: 5 } };
    const { container } = render(<TrackerProtectionIndicator thread={thread} />);
    const badge = container.querySelector('.tracker-protection-indicator');
    expect(badge).not.toBeNull();
    const html = container.innerHTML;
    expect(html).toMatch(/3/);
  });

  it('renderuje rolę button + aria-label PL+EN', () => {
    if (!TrackerProtectionIndicator) return;
    const thread = { id: 't2', stripResult: { trackersBlocked: 1, imagesProcessed: 2 } };
    const { container } = render(<TrackerProtectionIndicator thread={thread} />);
    const el = container.querySelector('.tracker-protection-indicator') as HTMLElement;
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('aria-label')).toMatch(/tracker|śledz/i);
  });

  it('renderuje "0 trackerów" gdy trackersBlocked === 0 but imagesProcessed > 0', () => {
    if (!TrackerProtectionIndicator) return;
    const thread = { id: 't3', stripResult: { trackersBlocked: 0, imagesProcessed: 4 } };
    const { container } = render(<TrackerProtectionIndicator thread={thread} />);
    const badge = container.querySelector('.tracker-protection-indicator--clean');
    expect(badge).not.toBeNull();
  });
});
