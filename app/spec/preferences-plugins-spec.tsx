import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import PreferencesPlugins from '../internal_packages/preferences/lib/tabs/preferences-plugins';

/**
 * Ticket #55 — Preferencje → Wtyczki.
 *
 * Sekcja Plugins w Preferences ujawnia ścieżkę UI dla użytkownika
 * końcowego (po ukryciu menu Developer w prod build v0.3.32).
 *
 * Test cementuje kontrakt:
 *   - render bez crash
 *   - empty state gdy brak user-installed plugins
 *   - przycisk "Install a Plugin" zawsze widoczny (entry point niezależny od listy)
 *   - toggle enable/disable mutuje core.disabledPackages
 */

describe('PreferencesPlugins (ticket #55)', function preferencesPluginsSpec() {
  let originalGet: any;
  let originalSet: any;
  let originalGetAvailablePackages: any;
  let stubbedDisabled: string[];
  let stubbedPackages: any[];

  beforeEach(() => {
    stubbedDisabled = [];
    stubbedPackages = [];

    originalGet = AppEnv.config.get;
    originalSet = AppEnv.config.set;
    originalGetAvailablePackages = (AppEnv as any).packages.getAvailablePackages;

    spyOn(AppEnv.config, 'get').andCallFake((key: string) => {
      if (key === 'core.disabledPackages') return stubbedDisabled;
      return originalGet.call(AppEnv.config, key);
    });
    spyOn(AppEnv.config, 'set').andCallFake((key: string, val: any) => {
      if (key === 'core.disabledPackages') {
        stubbedDisabled = val;
        return;
      }
      return originalSet.call(AppEnv.config, key, val);
    });
    spyOn((AppEnv as any).packages, 'getAvailablePackages').andCallFake(() => stubbedPackages);
  });

  afterEach(() => {
    cleanup();
  });

  it('renderuje bez crash', () => {
    const { container } = render(<PreferencesPlugins />);
    expect(container).not.toBeNull();
    expect(container.querySelector('.container-plugins')).not.toBeNull();
  });

  it('pokazuje empty state gdy brak user-installed plugins', () => {
    const { getByText } = render(<PreferencesPlugins />);
    expect(getByText(/No plugins installed yet/i)).toBeDefined();
  });

  it('zawsze pokazuje przycisk "Install a Plugin" (entry point)', () => {
    const { container } = render(<PreferencesPlugins />);
    const installBtn = container.querySelector('.plugin-install-bar button') as HTMLButtonElement;
    expect(installBtn).not.toBeNull();
    expect(installBtn.textContent || '').toMatch(/Install/i);
  });

  it('renderuje user-installed plugin z toggle "Enabled"', () => {
    const configDir = (AppEnv as any).getConfigDirPath();
    const userPackagesDir = `${configDir}/packages`;
    stubbedPackages = [
      {
        name: 'demo-plugin',
        displayName: 'Demo Plugin',
        json: { description: 'Demo', version: '0.0.1' },
        directory: `${userPackagesDir}/demo-plugin`,
        isOptional: () => true,
      },
    ];

    const { container, getByText } = render(<PreferencesPlugins />);
    expect(getByText('Demo Plugin')).toBeDefined();
    const checkbox = container.querySelector(
      '.plugin-toggle input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(false);
  });

  it('toggle wpisuje plugin do core.disabledPackages', () => {
    const configDir = (AppEnv as any).getConfigDirPath();
    const userPackagesDir = `${configDir}/packages`;
    stubbedPackages = [
      {
        name: 'demo-plugin',
        displayName: 'Demo Plugin',
        json: { description: 'Demo', version: '0.0.1' },
        directory: `${userPackagesDir}/demo-plugin`,
        isOptional: () => true,
      },
    ];

    const { container } = render(<PreferencesPlugins />);
    const checkbox = container.querySelector(
      '.plugin-toggle input[type="checkbox"]'
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(stubbedDisabled).toContain('demo-plugin');
  });

  it('built-in plugins są ukryte (filter user packages only)', () => {
    stubbedPackages = [
      {
        name: 'compose',
        displayName: 'Compose',
        json: { description: 'Built-in', version: '0.0.1' },
        directory: '/some/built-in/path/internal_packages/compose',
        isOptional: () => false,
      },
    ];

    const { queryByText, getByText } = render(<PreferencesPlugins />);
    expect(queryByText('Compose')).toBeNull();
    expect(getByText(/No plugins installed yet/i)).toBeDefined();
  });
});
