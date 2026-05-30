/**
 * RED test — SlashCommandsDropdown (#107 UI).
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let SlashCommandsDropdown: any = null;
try {
  SlashCommandsDropdown = require('../internal_packages/markdown-composer/lib/slash-commands-dropdown').default;
} catch (e) { /* RED */ }

const { SlashUIBus } = require('../internal_packages/markdown-composer/lib/slash-ui-bus');
const { SlashCommandRegistry } = require('../internal_packages/markdown-composer/lib/slash-command-registry');

describe('SlashCommandsDropdown — #107 plan v1.0', () => {
  beforeEach(() => {
    SlashUIBus._reset();
    if (SlashCommandRegistry._reset) SlashCommandRegistry._reset();
    // register sample commands
    SlashCommandRegistry.register({ slug: 'code', label: 'Code block', handler: () => '```\n\n```' });
    SlashCommandRegistry.register({ slug: 'link', label: 'Link', handler: () => '[]()' });
    SlashCommandRegistry.register({ slug: 'quote', label: 'Quote', handler: () => '> ' });
  });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(SlashCommandsDropdown).not.toBeNull();
    expect(typeof SlashCommandsDropdown).toBe('function');
  });

  it('hidden gdy UIBus zamknięty', () => {
    if (!SlashCommandsDropdown) return;
    const { container } = render(<SlashCommandsDropdown />);
    expect(container.querySelector('.slash-commands-dropdown')).toBeNull();
  });

  it('renderuje listę commands gdy open', () => {
    if (!SlashCommandsDropdown) return;
    const { container } = render(<SlashCommandsDropdown />);
    SlashUIBus.openWithQuery('');
    expect(container.querySelector('.slash-commands-dropdown')).not.toBeNull();
    const items = container.querySelectorAll('.slash-command-item');
    expect(items.length).toBe(3);
  });

  it('filtruje commands po query (substring match)', () => {
    if (!SlashCommandsDropdown) return;
    const { container } = render(<SlashCommandsDropdown />);
    SlashUIBus.openWithQuery('lin');
    const items = container.querySelectorAll('.slash-command-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Link');
  });

  it('renderuje role="listbox" + aria-label PL+EN', () => {
    if (!SlashCommandsDropdown) return;
    const { container } = render(<SlashCommandsDropdown />);
    SlashUIBus.openWithQuery('');
    const list = container.querySelector('.slash-commands-dropdown[role="listbox"]') as HTMLElement;
    expect(list).not.toBeNull();
    expect(list.getAttribute('aria-label')).toMatch(/slash|command|komenda/i);
  });

  it('click item wywołuje handler i zamyka dropdown', () => {
    if (!SlashCommandsDropdown) return;
    // Jasmine 1.x: createSpy without .and (use plain spy)
    let called = false;
    const handlerSpy = function() { called = true; return '[]()'; };
    SlashCommandRegistry._reset && SlashCommandRegistry._reset();
    SlashCommandRegistry.register({ slug: 'link', label: 'Link', handler: handlerSpy as any });
    const { container } = render(<SlashCommandsDropdown />);
    SlashUIBus.openWithQuery('');
    const item = container.querySelector('.slash-command-item') as HTMLElement;
    expect(item).not.toBeNull();
    fireEvent.click(item);
    expect(called).toBe(true);
    expect(SlashUIBus.isOpen()).toBe(false);
  });
});
