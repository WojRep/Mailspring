/**
 * PGP/SMIME plugin entry — bilet MVP #112.
 *
 * Backend foundation tylko — faktyczna kryptografia (openpgpjs / WebCrypto)
 * w osobnym integration ticket. Tutaj:
 *  - Cmd+K palette commands (key gen wizard, import, QR sync, preferences).
 *  - AppEnv.pgp API z PgpKeyStore + helpers.
 *
 * License compliance note: openpgpjs LGPL-2.1+ — kompatybilny z GPL-3.0
 * ActunaMail (downgrade path). SMIME via OpenSSL bindings — BSD-style
 * licencja, OK z GPL.
 */

import { PgpKeyStore, TIER_B_FIELDS } from './pgp-key-store';

export function activate() {
  PgpKeyStore.init();

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'pgp:generate-key',
      label: 'Wygeneruj klucz PGP / Generate PGP key',
      section: 'Privacy',
      keywords: ['pgp', 'gpg', 'key', 'generate', 'klucz', 'szyfruj'],
      handler: () => generateKeyWizard(),
    });
    palette.register({
      id: 'pgp:import-public-key',
      label: 'Importuj klucz publiczny PGP',
      section: 'Privacy',
      keywords: ['pgp', 'import', 'public key', 'klucz publiczny'],
      handler: () => importPublicKey(),
    });
    palette.register({
      id: 'pgp:qr-sync',
      label: 'QR sync — pokaż swój klucz publiczny',
      section: 'Privacy',
      keywords: ['pgp', 'qr', 'sync', 'public key', 'klucz'],
      handler: () => showQrSync(),
    });
    palette.register({
      id: 'pgp:import-smime',
      label: 'Importuj cert SMIME (.p12 / .pfx) — banki/KNF',
      section: 'Privacy',
      keywords: ['smime', 'cert', 'pkcs12', 'p12', 'pfx', 'institutional'],
      handler: () => importSmimeCert(),
    });
    palette.register({
      id: 'pgp:preferences',
      label: 'PGP/SMIME — preferencje',
      section: 'Settings',
      keywords: ['pgp', 'smime', 'encryption', 'preferences'],
      handler: () => openPrefs(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.pgp = {
    Store: PgpKeyStore,
    TIER_B_FIELDS: Array.from(TIER_B_FIELDS),
  };
}

export function deactivate() {
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    [
      'pgp:generate-key',
      'pgp:import-public-key',
      'pgp:qr-sync',
      'pgp:import-smime',
      'pgp:preferences',
    ].forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.pgp) {
    delete (window as any).AppEnv.pgp;
  }
}

function generateKeyWizard(): void { console.info('[pgp] open key gen wizard'); }
function importPublicKey(): void { console.info('[pgp] open public key import'); }
function showQrSync(): void { console.info('[pgp] show QR sync modal'); }
function importSmimeCert(): void { console.info('[pgp] open SMIME cert import'); }
function openPrefs(): void { console.info('[pgp] open Preferences > PGP/SMIME'); }

export type {
  PgpKeyPair,
  PgpKeyType,
  PgpKeySource,
  PublicKeyEntry,
  SignatureStatus,
  VerificationResult,
} from './pgp-key-store';
