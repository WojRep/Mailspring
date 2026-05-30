/**
 * Audit log plugin entry — bilet MVP #114.
 */

import { PreferencesUIStore } from 'actunamail-exports';
import AuditLogViewer from './audit-log-viewer';
import {
  AuditLogStore,
  RETENTION_OPTIONS_DAYS,
  RETENTION_DEFAULT_DAYS,
  RETENTION_MAX_DAYS,
  computeEntryHash,
} from './audit-log-store';

const { localized } = require('actunamail-exports');

let auditPrefTabRegistered = false;

export function activate() {
  AuditLogStore.init();

  // Register Preferences tab (per plan v1.0 #114 Preferences viewer).
  try {
    if (PreferencesUIStore && (PreferencesUIStore as any).TabItem && typeof (PreferencesUIStore as any).registerPreferencesTab === 'function') {
      (PreferencesUIStore as any).registerPreferencesTab(
        new (PreferencesUIStore as any).TabItem({
          tabId: 'AuditLog',
          displayName: localized('Audit log'),
          componentClassFn: () => AuditLogViewer,
          order: 10,
        })
      );
      auditPrefTabRegistered = true;
    }
  } catch (e) { console.warn('[audit-log] Preferences tab failed:', e); }

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
  if (auditPrefTabRegistered) {
    try {
      if ((PreferencesUIStore as any).unregisterPreferencesTab) {
        (PreferencesUIStore as any).unregisterPreferencesTab('AuditLog');
      }
    } catch (e) { /* */ }
    auditPrefTabRegistered = false;
  }
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
