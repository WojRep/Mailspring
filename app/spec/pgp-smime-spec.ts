/**
 * Bilet MVP #112 — PGP/SMIME backend (key store + QR sync data encoding) unit tests.
 *
 * Faktyczna kryptografia (openpgpjs sign/encrypt/decrypt) testowana w
 * integration ticket. Tutaj backend state management + QR data + Tier B markers.
 */

import { PgpKeyStore, TIER_B_FIELDS } from '../internal_packages/pgp-smime/lib/pgp-key-store';

const FAKE_PUB_KEY = '-----BEGIN PGP PUBLIC KEY BLOCK-----\nfake-key-data\n-----END PGP PUBLIC KEY BLOCK-----';
const FAKE_PRIV_KEY = '-----BEGIN PGP PRIVATE KEY BLOCK-----\nencrypted-fake-priv\n-----END PGP PRIVATE KEY BLOCK-----';

describe('PGP/SMIME — bilet MVP #112', () => {

  beforeEach(() => {
    PgpKeyStore._reset();
    PgpKeyStore.init();
  });

  describe('Tier B markers (GDPR Art. 32)', () => {
    it('TIER_B_FIELDS zawiera privateKeyArmored', () => {
      expect(Array.from(TIER_B_FIELDS)).toContain('privateKeyArmored');
    });
  });

  describe('upsertOwnPair', () => {
    it('wymaga accountId + email', () => {
      expect(() => PgpKeyStore.upsertOwnPair({
        accountId: '', email: 'bob@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'abc',
        source: 'generated', hasPassphrase: true, signOutgoing: false,
      })).toThrowError(/accountId/);
    });

    it('wymaga publicKeyArmored + fingerprint', () => {
      expect(() => PgpKeyStore.upsertOwnPair({
        accountId: 'a', email: 'bob@x.com', type: 'rsa_4096',
        publicKeyArmored: '', fingerprint: 'abc',
        source: 'generated', hasPassphrase: true, signOutgoing: false,
      })).toThrowError(/publicKeyArmored/);
    });

    it('tworzy pair z auto id + createdAt + email lowercase', () => {
      const p = PgpKeyStore.upsertOwnPair({
        accountId: 'acc-1', email: 'BOB@X.com', type: 'curve25519',
        publicKeyArmored: FAKE_PUB_KEY, privateKeyArmored: FAKE_PRIV_KEY,
        fingerprint: 'ABCDEF', source: 'generated', hasPassphrase: true, signOutgoing: false,
      });
      expect(p.id).toMatch(/^pgp_/);
      expect(p.createdAt).toBeGreaterThan(0);
      expect(p.email).toBe('bob@x.com');
      expect(p.fingerprint).toBe('abcdef');
    });

    it('upsert drugi raz preserves id + createdAt', () => {
      const a = PgpKeyStore.upsertOwnPair({
        accountId: 'acc-1', email: 'bob@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'abc',
        source: 'generated', hasPassphrase: true, signOutgoing: false,
      });
      const b = PgpKeyStore.upsertOwnPair({
        accountId: 'acc-1', email: 'bob@x.com', type: 'curve25519',
        publicKeyArmored: FAKE_PUB_KEY + 'v2', fingerprint: 'def',
        source: 'generated', hasPassphrase: true, signOutgoing: true,
      });
      expect(b.id).toBe(a.id);
      expect(b.createdAt).toBe(a.createdAt);
      expect(b.fingerprint).toBe('def');
      expect(b.signOutgoing).toBe(true);
    });

    it('listOwnPairs sortuje alfabetycznie po email', () => {
      PgpKeyStore.upsertOwnPair({ accountId: 'a1', email: 'zoe@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: '1', source: 'generated', hasPassphrase: true, signOutgoing: false });
      PgpKeyStore.upsertOwnPair({ accountId: 'a2', email: 'alice@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: '2', source: 'generated', hasPassphrase: true, signOutgoing: false });
      expect(PgpKeyStore.listOwnPairs().map(p => p.email)).toEqual(['alice@x.com', 'zoe@x.com']);
    });

    it('deleteOwnPair', () => {
      PgpKeyStore.upsertOwnPair({ accountId: 'a1', email: 'bob@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'abc', source: 'generated', hasPassphrase: true, signOutgoing: false });
      expect(PgpKeyStore.deleteOwnPair('a1')).toBe(true);
      expect(PgpKeyStore.getOwnPair('a1')).toBeUndefined();
      expect(PgpKeyStore.deleteOwnPair('a1')).toBe(false);
    });

    it('setSignOutgoing', () => {
      const p = PgpKeyStore.upsertOwnPair({ accountId: 'a1', email: 'b@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'abc', source: 'generated', hasPassphrase: true, signOutgoing: false });
      const upd = PgpKeyStore.setSignOutgoing('a1', true);
      expect(upd?.signOutgoing).toBe(true);
    });

    it('setSignOutgoing nieistniejącego → undefined', () => {
      expect(PgpKeyStore.setSignOutgoing('nope', true)).toBeUndefined();
    });
  });

  describe('importPublicKey + lookups', () => {
    it('import + get case-insensitive', () => {
      PgpKeyStore.importPublicKey({
        email: 'Alice@X.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'AAA', trustLevel: 'tofu',
      });
      expect(PgpKeyStore.getPublicKey('alice@x.com')?.fingerprint).toBe('aaa');
      expect(PgpKeyStore.hasPublicKeyFor('ALICE@X.COM')).toBe(true);
    });

    it('default trustLevel tofu gdy nieokreślone', () => {
      PgpKeyStore.importPublicKey({
        email: 'a@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', trustLevel: undefined as any,
      });
      expect(PgpKeyStore.getPublicKey('a@x.com')?.trustLevel).toBe('tofu');
    });

    it('setTrustLevel', () => {
      PgpKeyStore.importPublicKey({ email: 'a@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', trustLevel: 'tofu' });
      const upd = PgpKeyStore.setTrustLevel('a@x.com', 'verified');
      expect(upd?.trustLevel).toBe('verified');
    });

    it('canEncryptTo true gdy mamy key', () => {
      PgpKeyStore.importPublicKey({ email: 'a@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', trustLevel: 'tofu' });
      expect(PgpKeyStore.canEncryptTo('a@x.com')).toBe(true);
      expect(PgpKeyStore.canEncryptTo('other@x.com')).toBe(false);
    });

    it('canEncryptToAll zwraca missing list', () => {
      PgpKeyStore.importPublicKey({ email: 'a@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', trustLevel: 'tofu' });
      const result = PgpKeyStore.canEncryptToAll(['a@x.com', 'b@x.com', 'c@x.com']);
      expect(result.ok).toBe(false);
      expect(result.missing.sort()).toEqual(['b@x.com', 'c@x.com']);
    });

    it('canEncryptToAll wszyscy obecni → ok', () => {
      PgpKeyStore.importPublicKey({ email: 'a@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', trustLevel: 'tofu' });
      PgpKeyStore.importPublicKey({ email: 'b@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'b', trustLevel: 'tofu' });
      const result = PgpKeyStore.canEncryptToAll(['a@x.com', 'b@x.com']);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('listPublicKeys sortuje alfabetycznie', () => {
      PgpKeyStore.importPublicKey({ email: 'zoe@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'z', trustLevel: 'tofu' });
      PgpKeyStore.importPublicKey({ email: 'alice@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', trustLevel: 'tofu' });
      expect(PgpKeyStore.listPublicKeys().map(k => k.email)).toEqual(['alice@x.com', 'zoe@x.com']);
    });

    it('importPublicKey wymaga email + publicKey + fingerprint', () => {
      expect(() => PgpKeyStore.importPublicKey({ email: '', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'x', trustLevel: 'tofu' }))
        .toThrowError(/email/);
    });
  });

  describe('QR sync — buildQrPayload + parseQrPayload', () => {
    it('buildQrPayload pack public key + fingerprint', () => {
      PgpKeyStore.upsertOwnPair({ accountId: 'a1', email: 'bob@x.com', type: 'curve25519',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'abc',
        source: 'generated', hasPassphrase: true, signOutgoing: false });
      const qr = PgpKeyStore.buildQrPayload('a1')!;
      const data = JSON.parse(qr);
      expect(data.v).toBe(1);
      expect(data.email).toBe('bob@x.com');
      expect(data.fingerprint).toBe('abc');
      expect(data.publicKeyArmored).toBe(FAKE_PUB_KEY);
    });

    it('buildQrPayload zwraca null gdy brak pair', () => {
      expect(PgpKeyStore.buildQrPayload('nope')).toBeNull();
    });

    it('parseQrPayload roundtrip', () => {
      PgpKeyStore.upsertOwnPair({ accountId: 'a1', email: 'bob@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'abc',
        source: 'generated', hasPassphrase: true, signOutgoing: false });
      const qr = PgpKeyStore.buildQrPayload('a1')!;
      const parsed = PgpKeyStore.parseQrPayload(qr);
      expect(parsed?.email).toBe('bob@x.com');
      expect(parsed?.fingerprint).toBe('abc');
      expect(parsed?.publicKeyArmored).toBe(FAKE_PUB_KEY);
    });

    it('parseQrPayload zwraca null dla invalid JSON', () => {
      expect(PgpKeyStore.parseQrPayload('not json')).toBeNull();
    });

    it('parseQrPayload zwraca null dla unsupported version', () => {
      const bad = JSON.stringify({ v: 2, email: 'x@x.com', fingerprint: 'a', publicKeyArmored: 'pub' });
      expect(PgpKeyStore.parseQrPayload(bad)).toBeNull();
    });

    it('parseQrPayload zwraca null gdy brakuje fields', () => {
      const bad = JSON.stringify({ v: 1, email: 'x@x.com' });
      expect(PgpKeyStore.parseQrPayload(bad)).toBeNull();
    });
  });

  describe('persistence', () => {
    it('persists pairs + pubkeys', () => {
      PgpKeyStore.upsertOwnPair({ accountId: 'a1', email: 'bob@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'abc',
        source: 'generated', hasPassphrase: true, signOutgoing: false });
      PgpKeyStore.importPublicKey({ email: 'alice@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', trustLevel: 'tofu' });
      expect(localStorage.getItem('actuna.pgp-keypairs')).toContain('bob@x.com');
      expect(localStorage.getItem('actuna.pgp-pubkeys')).toContain('alice@x.com');
    });
  });

  describe('listen', () => {
    it('emit na upsert/setSignOutgoing/importPublicKey/setTrustLevel', () => {
      let n = 0;
      const unsub = PgpKeyStore.listen(() => n++);
      PgpKeyStore.upsertOwnPair({ accountId: 'a1', email: 'b@x.com', type: 'rsa_4096',
        publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', source: 'generated', hasPassphrase: true, signOutgoing: false });
      PgpKeyStore.setSignOutgoing('a1', true);
      PgpKeyStore.importPublicKey({ email: 'a@x.com', publicKeyArmored: FAKE_PUB_KEY, fingerprint: 'a', trustLevel: 'tofu' });
      PgpKeyStore.setTrustLevel('a@x.com', 'verified');
      expect(n).toBe(4);
      unsub();
    });
  });
});
