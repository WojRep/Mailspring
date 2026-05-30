/**
 * RODO Consent plugin entry — bilet MVP #113.
 */

import { ComponentRegistry } from 'actunamail-exports';
import RodoConsentBanner from './rodo-consent-banner';
import { ConsentStore, BULK_SEND_THRESHOLD, shouldCheckBulkSend } from './consent-store';

export function activate() {
  ConsentStore.init();

  ComponentRegistry.register(RodoConsentBanner, { role: 'Composer:Footer' });

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'rodo:grant-consent',
      label: 'Udziel zgody marketingowej — bieżący kontakt',
      section: 'Privacy',
      keywords: ['rodo', 'gdpr', 'consent', 'zgoda', 'marketing'],
      handler: () => grantCurrent(),
    });
    palette.register({
      id: 'rodo:revoke-consent',
      label: 'Wycofaj zgodę — bieżący kontakt',
      section: 'Privacy',
      keywords: ['rodo', 'revoke', 'wycofaj', 'opt-out'],
      handler: () => revokeCurrent(),
    });
    palette.register({
      id: 'rodo:export-and-forget',
      label: 'Eksport + usuń kontakt (Art. 17 + Art. 20)',
      section: 'Privacy',
      keywords: ['rodo', 'erasure', 'forget', 'portability', 'export', 'usuń'],
      handler: () => exportAndForgetCurrent(),
    });
    palette.register({
      id: 'rodo:bulk-forget',
      label: 'Bulk forget — wybrane kontakty (Art. 17)',
      section: 'Privacy',
      keywords: ['rodo', 'bulk', 'forget', 'erasure', 'cascade'],
      handler: () => bulkForget(),
    });
    palette.register({
      id: 'rodo:audit-list',
      label: 'Lista zgód — przegląd RODO',
      section: 'Privacy',
      keywords: ['rodo', 'audit', 'consent', 'lista', 'przegląd'],
      handler: () => openAuditList(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.rodoConsent = {
    Store: ConsentStore,
    shouldCheckBulkSend,
    constants: { BULK_SEND_THRESHOLD },
  };
}

export function deactivate() {
  ComponentRegistry.unregister(RodoConsentBanner);
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    [
      'rodo:grant-consent',
      'rodo:revoke-consent',
      'rodo:export-and-forget',
      'rodo:bulk-forget',
      'rodo:audit-list',
    ].forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.rodoConsent) {
    delete (window as any).AppEnv.rodoConsent;
  }
}

function grantCurrent(): void { console.info('[rodo] grant consent — current contact'); }
function revokeCurrent(): void { console.info('[rodo] revoke consent — current contact'); }
function exportAndForgetCurrent(): void { console.info('[rodo] export + forget — current contact'); }
function bulkForget(): void { console.info('[rodo] bulk forget — selected contacts'); }
function openAuditList(): void { console.info('[rodo] open consent audit list'); }

export type { ConsentRecord, BulkSendCheckResult, ContactExport } from './consent-store';
