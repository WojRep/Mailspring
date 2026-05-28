/**
 * Bilet MVP #93 — Pin badge UI tests.
 */

import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { React } from 'actunamail-exports';
import PinBadge from '../lib/pin-badge';
import { PinStore } from '../lib/pin-store';

describe('Pin badge — bilet MVP #93', () => {

  beforeEach(() => {
    PinStore._reset();
    PinStore.init();
  });

  afterEach(cleanup);

  it('renders nothing when thread not pinned', () => {
    const { container } = render(<PinBadge thread={{ id: 't1' }} />);
    expect(container.querySelector('.pin-badge')).toBeNull();
  });

  it('renders 📌 icon when thread pinned', () => {
    PinStore.pin('t1');
    const { container } = render(<PinBadge thread={{ id: 't1' }} />);
    const badge = container.querySelector('.pin-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('📌');
    expect(badge?.getAttribute('role')).toBe('img');
    expect(badge?.getAttribute('aria-label')).toBeTruthy();
  });

  it('re-renders when PinStore.pin/unpin', () => {
    const { container } = render(<PinBadge thread={{ id: 't1' }} />);
    expect(container.querySelector('.pin-badge')).toBeNull();
    act(() => { PinStore.pin('t1'); });
    expect(container.querySelector('.pin-badge')).not.toBeNull();
    act(() => { PinStore.unpin('t1'); });
    expect(container.querySelector('.pin-badge')).toBeNull();
  });

  it('click on badge unpins (toggle)', () => {
    PinStore.pin('t1');
    const { container } = render(<PinBadge thread={{ id: 't1' }} />);
    const badge = container.querySelector('.pin-badge') as HTMLElement;
    act(() => { fireEvent.click(badge); });
    expect(PinStore.isPinned('t1')).toBe(false);
  });

  it('keyboard Enter on badge toggles', () => {
    PinStore.pin('t1');
    const { container } = render(<PinBadge thread={{ id: 't1' }} />);
    const badge = container.querySelector('.pin-badge') as HTMLElement;
    act(() => { fireEvent.keyDown(badge, { key: 'Enter' }); });
    expect(PinStore.isPinned('t1')).toBe(false);
  });

  it('keyboard Space on badge toggles', () => {
    PinStore.pin('t1');
    const { container } = render(<PinBadge thread={{ id: 't1' }} />);
    const badge = container.querySelector('.pin-badge') as HTMLElement;
    act(() => { fireEvent.keyDown(badge, { key: ' ' }); });
    expect(PinStore.isPinned('t1')).toBe(false);
  });

  it('does NOT respond do innych keys (ARIA accessibility safe)', () => {
    PinStore.pin('t1');
    const { container } = render(<PinBadge thread={{ id: 't1' }} />);
    const badge = container.querySelector('.pin-badge') as HTMLElement;
    act(() => { fireEvent.keyDown(badge, { key: 'a' }); });
    expect(PinStore.isPinned('t1')).toBe(true);
  });

  it('renders different aria-label for each state (when pinned shows remove hint)', () => {
    PinStore.pin('t1');
    const { container } = render(<PinBadge thread={{ id: 't1' }} />);
    const badge = container.querySelector('.pin-badge') as HTMLElement;
    const label = badge.getAttribute('aria-label') || '';
    expect(label.length).toBeGreaterThan(0);
    // ARIA label musi zawierać PL + EN dual (project policy)
    expect(label).toMatch(/\//);
  });

  it('unsubscribes on unmount (no leak)', () => {
    const { container, unmount } = render(<PinBadge thread={{ id: 't1' }} />);
    expect(container.querySelector('.pin-badge')).toBeNull();
    unmount();
    // After unmount, store changes should not crash
    expect(() => { PinStore.pin('t1'); }).not.toThrow();
  });

  it('threadId prop change resubscribes do nowego state', () => {
    PinStore.pin('t1');
    const { container, rerender } = render(<PinBadge thread={{ id: 't1' }} />);
    expect(container.querySelector('.pin-badge')).not.toBeNull();
    rerender(<PinBadge threadId="t2" />);
    expect(container.querySelector('.pin-badge')).toBeNull();
    act(() => { PinStore.pin('t2'); });
    expect(container.querySelector('.pin-badge')).not.toBeNull();
  });

  it('accepts threadId prop alternative (test-friendly API)', () => {
    PinStore.pin('legacy-1');
    const { container } = render(<PinBadge threadId="legacy-1" />);
    expect(container.querySelector('.pin-badge')).not.toBeNull();
  });

  it('renders null gdy ani thread ani threadId prop', () => {
    const { container } = render(<PinBadge />);
    expect(container.querySelector('.pin-badge')).toBeNull();
  });
});
