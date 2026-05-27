/**
 * Audit log plugin entry — bilet MVP #114.
 */

import {
  AuditLogStore,
  RETENTION_OPTIONS_DAYS,
  RETENTION_DEFAULT_DAYS,
  RETENTION_MAX_DAYS,
  computeEntryHash,
} from './audit-log-store';

export function activate() {
  AuditLogStore.init();

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'audit:open',
      label: 'Otwórz audit log / Open audit log',
      section: 'Privacy',
      keywords: ['audit', 'log', 'history', 'compliance', 'rodo', 'knf'],
      handler: () => openAuditList(),
    });
    palette.register({
      id: 'audit:export',
      label: 'Eksport audit log (JSON)',
      section: 'Privacy',
      keywords: ['audit', 'export', 'json', 'backup'],
      handler: () => exportLog(),
    });
    palette.register({
      id: 'audit:verify-chain',
      label: 'Weryfikuj integralność audit log (tamper check)',
      section: 'Privacy',
      keywords: ['audit', 'verify', 'tamper', 'chain', 'hash', 'integrity'],
      handler: () => verifyChain(),
    });
    palette.register({
      id: 'audit:purge',
      label: 'Wyczyść audit log (manual purge)',
      section: 'Privacy',
      keywords: ['audit', 'purge', 'delete', 'clear'],
      handler: () => manualPurge(),
    });
    palette.register({
      id: 'audit:preferences',
      label: 'Audit log — retention preferences',
      section: 'Settings',
      keywords: ['audit', 'retention', 'preferences'],
      handler: () => openPrefs(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.audit = {
    Store: AuditLogStore,
    computeEntryHash,
    constants: {
      RETENTION_OPTIONS_DAYS,
      RETENTION_DEFAULT_DAYS,
      RETENTION_MAX_DAYS,
    },
  };
}

export function deactivate() {
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    ['audit:open', 'audit:export', 'audit:verify-chain', 'audit:purge', 'audit:preferences']
      .forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.audit) {
    delete (window as any).AppEnv.audit;
  }
}

function openAuditList(): void { console.info('[audit] open paginated list view'); }
function exportLog(): void {
  const json = AuditLogStore.exportJSON();
  console.info('[audit] export JSON length:', json.length);
}
function verifyChain(): void {
  const result = AuditLogStore.verifyChain();
  console.info('[audit] chain verify:', result);
}
function manualPurge(): void { console.info('[audit] manual purge (z confirm dialog)'); }
function openPrefs(): void { console.info('[audit] open Preferences > Privacy > Audit log'); }

export type {
  AuditEntry,
  AuditActor,
  AuditSubsystem,
  AuditSettings,
  AuditFilter,
} from './audit-log-store';
