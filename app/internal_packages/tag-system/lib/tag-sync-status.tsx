/**
 * TagSyncStatus — bilet #117: badge trybu synchronizacji tagów per konto.
 *
 * Renderowany w Preferences → Tagi. UI/UX tagów jest identyczne na każdym
 * koncie; ten komponent tylko informuje, JAK dane konto przenosi tagi:
 *   gmail-label       → etykiety Gmail (Tag/...)
 *   exchange-category → keywordy IMAP mapowane przez Exchange na kategorie Outlooka
 *   imap-keyword      → keywordy IMAP (ten sam mechanizm co tagi Thunderbirda)
 *   local             → banner: serwer bez wsparcia — tagi tylko lokalnie
 */

import React from 'react';
import { adapterForAccount, TagSyncAdapterKind } from './sync-adapters/tag-sync-adapters';

const { localized, AccountStore } = require('actunamail-exports');

const KIND_LABELS: Record<TagSyncAdapterKind, string> = {
  'gmail-label': 'Etykiety Gmail (Tag/…) / Gmail labels (Tag/…)',
  'exchange-category': 'Kategorie Outlooka przez Exchange / Outlook categories via Exchange',
  'imap-keyword': 'Keywordy IMAP — zgodne z Thunderbirdem / IMAP keywords — Thunderbird-compatible',
  local:
    'Tylko lokalnie na tym koncie — serwer nie wspiera tagów / Local only — server does not support tags',
};

export default class TagSyncStatus extends React.Component {
  static displayName = 'TagSyncStatus';

  render() {
    let accounts: Array<{ id: string; provider: string; label?: string }> = [];
    try {
      accounts = (AccountStore && AccountStore.accounts && AccountStore.accounts()) || [];
    } catch (e) {
      /* exports unavailable */
    }
    if (!accounts.length) return null;

    return (
      <div className="tag-sync-status" aria-label={localized('Synchronizacja tagów / Tag sync')}>
        <div className="tag-sync-status-title">
          {localized('Synchronizacja tagów między urządzeniami / Tag sync across devices')}
        </div>
        {accounts.map((account) => {
          const kind = adapterForAccount(account as any).kind;
          return (
            <div
              key={account.id}
              className={`tag-sync-status-row${kind === 'local' ? ' tag-sync-status-row--local' : ''}`}
            >
              <span className="tag-sync-status-account">{account.label || account.id}</span>
              <span className="tag-sync-status-badge">{localized(KIND_LABELS[kind])}</span>
            </div>
          );
        })}
      </div>
    );
  }
}
