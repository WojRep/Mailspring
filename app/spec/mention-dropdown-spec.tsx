/**
 * RED test — MentionDropdown (#108 UI).
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let MentionDropdown: any = null;
try {
  MentionDropdown = require('../internal_packages/mention-picker/lib/mention-dropdown').default;
} catch (e) { /* RED */ }

const { MentionUIBus } = require('../internal_packages/mention-picker/lib/mention-ui-bus');

describe('MentionDropdown — #108 plan v1.0', () => {
  beforeEach(() => { MentionUIBus._reset(); });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(MentionDropdown).not.toBeNull();
    expect(typeof MentionDropdown).toBe('function');
  });

  it('hidden gdy UIBus zamknięty', () => {
    if (!MentionDropdown) return;
    const { container } = render(<MentionDropdown />);
    expect(container.querySelector('.mention-dropdown')).toBeNull();
  });

  it('renderuje dropdown z role=listbox + aria-label po open', () => {
    if (!MentionDropdown) return;
    const { container } = render(<MentionDropdown />);
    MentionUIBus.openWithQuery('');
    const list = container.querySelector('.mention-dropdown[role="listbox"]') as HTMLElement;
    expect(list).not.toBeNull();
    expect(list.getAttribute('aria-label')).toMatch(/mention|wzm/i);
  });

  it('Escape zamyka dropdown', () => {
    if (!MentionDropdown) return;
    const { container } = render(<MentionDropdown />);
    MentionUIBus.openWithQuery('jan');
    const list = container.querySelector('.mention-dropdown') as HTMLElement;
    fireEvent.keyDown(list, { key: 'Escape' });
    expect(MentionUIBus.isOpen()).toBe(false);
  });
});
