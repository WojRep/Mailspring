/**
 * Bilet MVP #92 — Glass demo UI tests.
 *
 * Pokrycie: render closed/open, toggle config flag, ARIA role="dialog" +
 * aria-modal, Esc closes, close button closes, 3 intensity tiles obecne.
 */

import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { React } from 'actunamail-exports';
import GlassDemo from '../lib/glass-demo';
import { GlassDemoStore } from '../lib/glass-demo-store';

describe('Glass demo — bilet MVP #92', () => {

  beforeEach(() => {
    GlassDemoStore._reset();
  });

  afterEach(cleanup);

  it('renders null when closed', () => {
    const { container } = render(<GlassDemo />);
    expect(container.querySelector('.glass-demo-backdrop')).toBeNull();
  });

  it('renders dialog overlay when GlassDemoStore.open()', () => {
    const { container } = render(<GlassDemo />);
    act(() => { GlassDemoStore.open(); });
    const backdrop = container.querySelector('.glass-demo-backdrop');
    expect(backdrop).not.toBeNull();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders 3 intensity tiles (subtle/medium/strong)', () => {
    const { container } = render(<GlassDemo />);
    act(() => { GlassDemoStore.open(); });
    const tiles = container.querySelectorAll('.glass-demo-tile');
    expect(tiles.length).toBe(3);
    expect(container.querySelector('.glass-demo-tile--subtle')).not.toBeNull();
    expect(container.querySelector('.glass-demo-tile--medium')).not.toBeNull();
    expect(container.querySelector('.glass-demo-tile--strong')).not.toBeNull();
  });

  it('Esc key closes overlay', () => {
    const { container } = render(<GlassDemo />);
    act(() => { GlassDemoStore.open(); });
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    expect(container.querySelector('.glass-demo-backdrop')).toBeNull();
  });

  it('close button calls GlassDemoStore.close()', () => {
    const { container } = render(<GlassDemo />);
    act(() => { GlassDemoStore.open(); });
    const closeBtn = container.querySelector('.glass-demo-close') as HTMLElement;
    expect(closeBtn).not.toBeNull();
    act(() => { fireEvent.click(closeBtn); });
    expect(GlassDemoStore.isOpen()).toBe(false);
  });

  it('translucency checkbox flips config flag', () => {
    let lastFlag: boolean | undefined;
    (window as any).AppEnv = (window as any).AppEnv || {};
    const configBackup = (window as any).AppEnv.config;
    (window as any).AppEnv.config = {
      get: () => false,
      set: (key: string, value: boolean) => { lastFlag = value; },
      onDidChange: () => () => {},
      setSchema: () => {},
    };
    const { container } = render(<GlassDemo />);
    act(() => { GlassDemoStore.open(); });
    const checkbox = container.querySelector('.glass-demo-toggle input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    act(() => { fireEvent.click(checkbox); });
    expect(lastFlag).toBe(true);
    (window as any).AppEnv.config = configBackup;
  });

  describe('GlassDemoStore', () => {
    it('isOpen toggles via open/close/toggle', () => {
      expect(GlassDemoStore.isOpen()).toBe(false);
      GlassDemoStore.open();
      expect(GlassDemoStore.isOpen()).toBe(true);
      GlassDemoStore.close();
      expect(GlassDemoStore.isOpen()).toBe(false);
      GlassDemoStore.toggle();
      expect(GlassDemoStore.isOpen()).toBe(true);
      GlassDemoStore.toggle();
      expect(GlassDemoStore.isOpen()).toBe(false);
    });

    it('listen emit na zmiany state', () => {
      let count = 0;
      const unsub = GlassDemoStore.listen(() => count++);
      GlassDemoStore.open();
      GlassDemoStore.close();
      expect(count).toBe(2);
      unsub();
      GlassDemoStore.open();
      expect(count).toBe(2);
    });

    it('open idempotent', () => {
      let count = 0;
      const unsub = GlassDemoStore.listen(() => count++);
      GlassDemoStore.open();
      GlassDemoStore.open();
      GlassDemoStore.open();
      expect(count).toBe(1);
      unsub();
    });
  });
});
