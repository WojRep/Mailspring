/**
 * RED spec — TagToolbarButton (#98 Wave 5 inline discoverability).
 *
 * Address user-reported gap (verbatim 2026-05-30): 'Nie widzę możliwości
 * dodawania tagów'. TagChips inline pokazuje EXISTING tagi; brak buttona
 * DODAWANIA bez znajomości Cmd+L. TagToolbarButton zapełnia gap.
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let TagToolbarButton: any = null;
try {
  TagToolbarButton = require('../internal_packages/tag-system/lib/tag-toolbar-button').default;
} catch (e) { /* RED */ }

const { TagSystemUIBus } = require('../internal_packages/tag-system/lib/tag-system-ui-bus');

describe('TagToolbarButton — #98 plan v1.0 inline discoverability', () => {
  beforeEach(() => { TagSystemUIBus._reset && TagSystemUIBus._reset(); });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(TagToolbarButton).not.toBeNull();
    expect(typeof TagToolbarButton).toBe('function');
  });

  it('renders nothing gdy brak items', () => {
    if (!TagToolbarButton) return;
    const { container } = render(<TagToolbarButton items={[]} />);
    expect(container.querySelector('.tag-toolbar-button')).toBeNull();
  });

  it('renders button gdy item obecny', () => {
    if (!TagToolbarButton) return;
    const { container } = render(<TagToolbarButton items={[{ id: 't1' }]} />);
    const btn = container.querySelector('.tag-toolbar-button') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toMatch(/tag/i);
  });

  it('click opens picker via UIBus', () => {
    if (!TagToolbarButton) return;
    const { container } = render(<TagToolbarButton items={[{ id: 't42' }]} />);
    const btn = container.querySelector('.tag-toolbar-button') as HTMLElement;
    expect(TagSystemUIBus.isPickerOpen && TagSystemUIBus.isPickerOpen()).toBeFalsy();
    fireEvent.click(btn);
    expect(TagSystemUIBus.isPickerOpen && TagSystemUIBus.isPickerOpen()).toBe(true);
  });
});
