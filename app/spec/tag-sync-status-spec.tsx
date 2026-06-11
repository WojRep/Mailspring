/**
 * Bilet #117 — TagSyncStatus: badge trybu synchronizacji per konto + banner
 * "Tagi lokalne" gdy serwer nie wspiera keywordów (capability=false).
 * Renderowany w Preferences → Tagi. RED first per TDD.
 */

import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { AccountStore } from 'actunamail-exports';
import TagSyncStatus from '../internal_packages/tag-system/lib/tag-sync-status';
import {
  setKeywordCapability,
  _resetAdapters,
} from '../internal_packages/tag-system/lib/sync-adapters/tag-sync-adapters';

describe('TagSyncStatus — badge adaptera per konto (bilet #117)', () => {
  beforeEach(() => {
    _resetAdapters();
    spyOn(AccountStore, 'accounts').andReturn([
      { id: 'a1', provider: 'gmail', label: 'Gmail konto' },
      { id: 'a2', provider: 'imap', label: 'Dovecot konto' },
      { id: 'a3', provider: 'office365', label: 'M365 konto' },
    ] as any);
  });

  afterEach(() => {
    cleanup();
    _resetAdapters();
  });

  it('renderuje wiersz per konto', () => {
    const { container } = render(<TagSyncStatus />);
    expect(container.querySelectorAll('.tag-sync-status-row').length).toBe(3);
  });

  it('badge: Gmail → etykiety, IMAP → keywordy, M365 → kategorie Outlooka', () => {
    const { container } = render(<TagSyncStatus />);
    const rows = Array.from(container.querySelectorAll('.tag-sync-status-row'));
    const text = (i: number) => (rows[i] as HTMLElement).textContent || '';
    expect(text(0)).toMatch(/etykiet|label/i);
    expect(text(1)).toMatch(/keyword/i);
    expect(text(2)).toMatch(/kategori|categor/i);
  });

  it('capability=false → banner "tylko lokalnie" (PL+EN) z modifier class', () => {
    setKeywordCapability('a2', false);
    const { container } = render(<TagSyncStatus />);
    const local = container.querySelector('.tag-sync-status-row--local') as HTMLElement;
    expect(local).not.toBeNull();
    expect(local.textContent).toMatch(/lokaln/i);
  });

  it('bez kont → renderuje null', () => {
    (AccountStore.accounts as any).andReturn([]);
    const { container } = render(<TagSyncStatus />);
    expect(container.querySelector('.tag-sync-status')).toBeNull();
  });
});
