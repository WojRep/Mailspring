import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import ModeToggle from '../../internal_packages/mode-switch/lib/mode-toggle';

/**
 * Ticket #15 — ModeToggle ikona person → puzzle.
 *
 * Right column (MessageListSidebar) jest po #13/#14 generic plugin slot,
 * więc metafora "person silhouette" przestała pasować. Wymieniona na
 * puzzle piece (Phosphor MIT) — metafora plugin slot.
 *
 * Test cementuje:
 *   - asset name `toolbar-sidebar-plugin.png` jest renderowany (nie
 *     stary `toolbar-person-sidebar.png`).
 *   - klik wciąż wywołuje `Actions.toggleWorkspaceLocationHidden`
 *     z MessageListSidebar (zachowanie identyczne jak przed swap).
 */

describe('ModeToggle puzzle icon (ticket #15)', function modeTogglePuzzleSpec() {
  afterEach(cleanup);

  it('renderuje RetinaImg z name="toolbar-sidebar-plugin.png"', () => {
    const { container } = render(<ModeToggle />);
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    // RetinaImg resolved path zawiera filename; default alt = name (bez .png
    // suffix po path resolution, ale `src` keeps it). Asercja na src.
    expect(img!.src).toContain('toolbar-sidebar-plugin');
    expect(img!.src).not.toContain('toolbar-person-sidebar');
  });

  it('renderuje <button> z aria-label Show/Hide Sidebar', () => {
    const { container } = render(<ModeToggle />);
    const btn = container.querySelector('button[aria-label]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    const label = btn!.getAttribute('aria-label') || '';
    expect(label.toLowerCase()).toMatch(/sidebar|panel|pasek/);
  });

  it('klik wywołuje Actions.toggleWorkspaceLocationHidden', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Actions, WorkspaceStore } = require('actunamail-exports');
    const spy = spyOn(Actions, 'toggleWorkspaceLocationHidden');

    const { container } = render(<ModeToggle />);
    const btn = container.querySelector('button') as HTMLButtonElement;
    fireEvent.click(btn);

    expect(spy).toHaveBeenCalledWith(WorkspaceStore.Location.MessageListSidebar);
  });
});
