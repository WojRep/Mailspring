/**
 * RED tests (TDD) — jawne kontrolki wyglądu:
 *  - AppearanceThemeModeSwitch: Systemowy/Jasny/Ciemny → core.theme
 *    (ui-automatic/ui-light/ui-dark; istniejące motywy, tylko jawny przełącznik)
 *  - EyeStrainSwitch: Off/Gentle/Strong → core.appearance.eyeStrainReduction
 *
 * RED tu (komponenty jeszcze nie eksportowane) → GREEN: dodać + wyeksportować
 * z preferences-appearance.tsx.
 */

import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  AppearanceThemeModeSwitch,
  EyeStrainSwitch,
} from '../internal_packages/preferences/lib/tabs/preferences-appearance';

function fakeConfig(initial: Record<string, any>) {
  const store = { ...initial };
  return {
    get: (k: string) => store[k],
    set: jasmine.createSpy('set').andCallFake((k: string, v: any) => {
      store[k] = v;
    }),
  };
}

describe('AppearanceThemeModeSwitch — Systemowy/Jasny/Ciemny → core.theme', () => {
  afterEach(() => cleanup());

  it('renderuje trzy tryby (Light, Dark, System)', () => {
    const cfg = fakeConfig({ 'core.theme': 'ui-light' });
    const { getByText } = render(<AppearanceThemeModeSwitch config={cfg as any} />);
    expect(getByText('Light')).toBeTruthy();
    expect(getByText('Dark')).toBeTruthy();
    expect(getByText(/System/i)).toBeTruthy();
  });

  it('podświetla aktywny tryb wg core.theme', () => {
    const cfg = fakeConfig({ 'core.theme': 'ui-dark' });
    const { container } = render(<AppearanceThemeModeSwitch config={cfg as any} />);
    const active = container.querySelector('.appearance-mode.active');
    expect(active).toBeTruthy();
    expect((active as HTMLElement).getAttribute('aria-label')).toMatch(/dark/i);
  });

  it('klik Dark ustawia core.theme=ui-dark', () => {
    const cfg = fakeConfig({ 'core.theme': 'ui-automatic' });
    const { getByText } = render(<AppearanceThemeModeSwitch config={cfg as any} />);
    fireEvent.click(getByText('Dark'));
    expect(cfg.set).toHaveBeenCalledWith('core.theme', 'ui-dark');
  });

  it('klik System ustawia core.theme=ui-automatic', () => {
    const cfg = fakeConfig({ 'core.theme': 'ui-light' });
    const { getByText } = render(<AppearanceThemeModeSwitch config={cfg as any} />);
    fireEvent.click(getByText(/System/i));
    expect(cfg.set).toHaveBeenCalledWith('core.theme', 'ui-automatic');
  });
});

describe('EyeStrainSwitch — off/low/high → core.appearance.eyeStrainReduction', () => {
  afterEach(() => cleanup());

  it('renderuje trzy poziomy', () => {
    const cfg = fakeConfig({ 'core.appearance.eyeStrainReduction': 'off' });
    const { container } = render(<EyeStrainSwitch config={cfg as any} />);
    expect(container.querySelectorAll('.appearance-mode').length).toBe(3);
  });

  it('podświetla aktywny poziom', () => {
    const cfg = fakeConfig({ 'core.appearance.eyeStrainReduction': 'high' });
    const { container } = render(<EyeStrainSwitch config={cfg as any} />);
    const active = container.querySelector('.appearance-mode.active');
    expect(active).toBeTruthy();
  });

  it('klik Strong ustawia poziom high', () => {
    const cfg = fakeConfig({ 'core.appearance.eyeStrainReduction': 'off' });
    const { getByText } = render(<EyeStrainSwitch config={cfg as any} />);
    fireEvent.click(getByText(/Strong/i));
    expect(cfg.set).toHaveBeenCalledWith('core.appearance.eyeStrainReduction', 'high');
  });

  it('Spacja na segmencie aktywuje go (dostępność z klawiatury)', () => {
    const cfg = fakeConfig({ 'core.appearance.eyeStrainReduction': 'off' });
    const { container } = render(<EyeStrainSwitch config={cfg as any} />);
    const seg = container.querySelector('[aria-label="Strong"]') as HTMLElement;
    expect(seg).toBeTruthy();
    fireEvent.keyDown(seg, { key: ' ' });
    expect(cfg.set).toHaveBeenCalledWith('core.appearance.eyeStrainReduction', 'high');
  });
});
