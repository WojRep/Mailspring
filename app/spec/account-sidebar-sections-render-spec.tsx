/**
 * RED test — AccountSidebar.render() musi renderować 3 nowe sekcje per plan v1.0
 * mockup design/mockups/01-app-shell.html: Attention Layers, Smart Folders, Tags.
 *
 * Per user mandate 2026-05-30 ("metodologia agile z tdd i ddd") — test PRZED
 * implementation rendering.
 *
 * Strategia: render AccountSidebar w isolation, sprawdź DOM dla section titles.
 * SidebarStore methods sygnalizują dane (już zaimplementowane w GREEN poprzednich
 * spec'ów); render layer musi je woła i wyrysować.
 */

import React from 'react';
import { render, cleanup } from '@testing-library/react';

import AccountSidebar from '../internal_packages/account-sidebar/lib/components/account-sidebar';

describe('AccountSidebar — plan v1.0 sections render (Attention Layers + Smart Folders + Tags)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderuje sekcję "Attention Layers"', () => {
    const { container } = render(<AccountSidebar />);
    const html = container.innerHTML;
    expect(html).toMatch(/Attention Layers/i);
  });

  it('renderuje sekcję "Smart Folders"', () => {
    const { container } = render(<AccountSidebar />);
    const html = container.innerHTML;
    expect(html).toMatch(/Smart Folders/i);
  });

  it('renderuje sekcję "Tags" gdy są user tags', () => {
    // Seed user tag so AccountSidebar renders Tags section (per plan v1.0
    // empty Tags hidden, only shown when user has tags).
    const TagStore = require('../internal_packages/tag-system/lib/tag-store').TagStore;
    TagStore.register({
      id: 'utag-render-test',
      name: 'TestTag',
      color: '#3b6bdb',
      source: 'user',
    });
    const { container } = render(<AccountSidebar />);
    const html = container.innerHTML;
    expect(html).toMatch(/Tags/i);
    TagStore.delete('utag-render-test');
  });

  it('renderuje 3 standardowe attention items: Focused, Pinned, Snoozed', () => {
    const { container } = render(<AccountSidebar />);
    const html = container.innerHTML;
    expect(html).toMatch(/Focused/);
    expect(html).toMatch(/Pinned/);
    expect(html).toMatch(/Snoozed/);
  });

  // Porządkowanie panelu (decyzja usera "Warstwy organizacyjne na górze"):
  // warstwy przekrojowe nad kontami → kolejność Attention → Tagi → Smart Folders
  // → (skrzynki kont). Dyskryminatorem reorderu jest odwrócenie pary
  // Tagi/Smart Folders: wcześniej Smart Folders renderowało się PRZED Tags.
  it('renderuje Tagi NAD Smart Folders (warstwy organizacyjne na górze)', () => {
    const TagStore = require('../internal_packages/tag-system/lib/tag-store').TagStore;
    TagStore.register({
      id: 'utag-order-test',
      name: 'OrderTag',
      color: '#3b6bdb',
      source: 'user',
    });
    const { container } = render(<AccountSidebar />);
    const html = container.innerHTML;
    const iAttention = html.indexOf('Attention Layers');
    const iTags = html.indexOf('Tags');
    const iSmart = html.indexOf('Smart Folders');
    expect(iAttention).toBeGreaterThan(-1);
    expect(iTags).toBeGreaterThan(iAttention);
    expect(iSmart).toBeGreaterThan(iTags);
    TagStore.delete('utag-order-test');
  });
});
