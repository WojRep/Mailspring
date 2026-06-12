/**
 * Bilet #124 — wskaźnik folderu w widokach wirtualnych (search/tagi/priorytety/
 * Snoozed/AI). Wymaganie usera (verbatim 2026-06-12): „W takich folderzach
 * wyszukiwnaia, tagów, priorytetów, przy wiamdosci musi być widoczna informacja
 * w jakim folderze się znajduje."
 *
 * Widok wirtualny = perspektywa bez przypisanych kategorii (categories() puste).
 * Konto folderowe (IMAP): wiersz pokazuje chip(y) folderów wątku.
 * Zwykły widok folderu (Inbox itd.): bez zmian — chip folderu NIE jest doklejany.
 */

import React from 'react';
import { render, cleanup } from '@testing-library/react';
import MailLabelSet from '../../src/components/mail-label-set';
import FocusedPerspectiveStore from '../../src/flux/stores/focused-perspective-store';
import { AccountStore } from '../../src/flux/stores/account-store';
import { Folder } from '../../src/flux/models/folder';

describe('MailLabelSet — wskaźnik folderu w widokach wirtualnych (#124)', () => {
  const trash = new Folder({ id: 'f-trash', accountId: 'a1', path: 'Trash', role: 'trash' });
  const inbox = new Folder({ id: 'f-inbox', accountId: 'a1', path: 'INBOX', role: 'inbox' });

  const threadInTrash: any = {
    accountId: 'a1',
    sortedCategories: () => [trash],
  };

  beforeEach(() => {
    spyOn(AccountStore, 'accountForId').andReturn({ usesLabels: () => false });
  });

  afterEach(cleanup);

  it('widok wirtualny (bez kategorii): renderuje chip z nazwą folderu wątku', () => {
    spyOn(FocusedPerspectiveStore, 'current').andReturn({ categories: () => [] });
    const { container } = render(<MailLabelSet thread={threadInTrash} />);
    const chips = container.querySelectorAll('.mail-label');
    expect(chips.length).toBe(1);
    expect((chips[0] as HTMLElement).textContent).toContain(trash.displayName);
  });

  it('zwykły widok folderu (kategorie przypisane): NIE dokleja chipa folderu', () => {
    spyOn(FocusedPerspectiveStore, 'current').andReturn({ categories: () => [inbox] });
    const { container } = render(<MailLabelSet thread={threadInTrash} />);
    expect(container.querySelectorAll('.mail-label').length).toBe(0);
  });
});
