/**
 * Bilet MVP #113 — RODO consent tracking + right to erasure unit tests.
 */

import {
  ConsentStore,
  BULK_SEND_THRESHOLD,
  shouldCheckBulkSend,
} from '../internal_packages/rodo-consent/lib/consent-store';
import { ContactCardStore } from '../internal_packages/contact-card/lib/contact-card-store';

describe('RODO consent — bilet MVP #113', () => {

  beforeEach(() => {
    ConsentStore._reset();
    ContactCardStore._reset();
    ConsentStore.init();
    ContactCardStore.init();
  });

  describe('grantConsent / revokeConsent (Art. 7)', () => {
    it('grantConsent tworzy record z grantedAt + clears revokedAt', () => {
      const r = ConsentStore.grantConsent('bob@x.com', { source: 'form', note: 'Form submitted 2025-01-01' });
      expect(r.email).toBe('bob@x.com');
      expect(r.consentGrantedAt).toBeGreaterThan(0);
      expect(r.consentRevokedAt).toBeUndefined();
      expect(r.source).toBe('form');
      expect(r.note).toBe('Form submitted 2025-01-01');
    });

    it('revokeConsent ustawia revokedAt (zachowuje grantedAt do audytu)', () => {
      ConsentStore.grantConsent('bob@x.com');
      const r = ConsentStore.revokeConsent('bob@x.com', 'User requested opt-out');
      expect(r.consentRevokedAt).toBeGreaterThan(0);
      expect(r.consentGrantedAt).toBeGreaterThan(0); // preserved
      expect(r.note).toBe('User requested opt-out');
    });

    it('grant po revoke clears revokedAt (re-consent)', () => {
      ConsentStore.grantConsent('bob@x.com');
      ConsentStore.revokeConsent('bob@x.com');
      const r = ConsentStore.grantConsent('bob@x.com');
      expect(r.consentRevokedAt).toBeUndefined();
    });

    it('email case-insensitive', () => {
      ConsentStore.grantConsent('Bob@X.com');
      expect(ConsentStore.get('bob@x.com')).toBeTruthy();
    });

    it('grant/revoke wymaga email', () => {
      expect(() => ConsentStore.grantConsent('')).toThrowError(/email/);
      expect(() => ConsentStore.revokeConsent('')).toThrowError(/email/);
    });
  });

  describe('hasActiveConsent / isRevoked', () => {
    it('po grant → active true, revoked false', () => {
      ConsentStore.grantConsent('a@x.com');
      expect(ConsentStore.hasActiveConsent('a@x.com')).toBe(true);
      expect(ConsentStore.isRevoked('a@x.com')).toBe(false);
    });

    it('po revoke → active false, revoked true', () => {
      ConsentStore.grantConsent('a@x.com');
      ConsentStore.revokeConsent('a@x.com');
      expect(ConsentStore.hasActiveConsent('a@x.com')).toBe(false);
      expect(ConsentStore.isRevoked('a@x.com')).toBe(true);
    });

    it('po re-grant → active true, revoked false', () => {
      ConsentStore.grantConsent('a@x.com');
      ConsentStore.revokeConsent('a@x.com');
      ConsentStore.grantConsent('a@x.com');
      expect(ConsentStore.hasActiveConsent('a@x.com')).toBe(true);
      expect(ConsentStore.isRevoked('a@x.com')).toBe(false);
    });

    it('nieznany email → oba false', () => {
      expect(ConsentStore.hasActiveConsent('unknown@x.com')).toBe(false);
      expect(ConsentStore.isRevoked('unknown@x.com')).toBe(false);
    });
  });

  describe('checkBulkSend (composer guard)', () => {
    beforeEach(() => {
      ConsentStore.grantConsent('granted1@x.com');
      ConsentStore.grantConsent('granted2@x.com');
      ConsentStore.grantConsent('revoked1@x.com');
      ConsentStore.revokeConsent('revoked1@x.com');
    });

    it('wszystko OK', () => {
      const r = ConsentStore.checkBulkSend(['granted1@x.com', 'granted2@x.com']);
      expect(r.allConsented).toBe(true);
      expect(r.withoutConsent).toEqual([]);
      expect(r.revoked).toEqual([]);
    });

    it('separates withoutConsent vs revoked', () => {
      const r = ConsentStore.checkBulkSend([
        'granted1@x.com',
        'unknown@x.com',
        'revoked1@x.com',
      ]);
      expect(r.allConsented).toBe(false);
      expect(r.withoutConsent).toEqual(['unknown@x.com']);
      expect(r.revoked).toEqual(['revoked1@x.com']);
    });
  });

  describe('shouldCheckBulkSend threshold', () => {
    it('threshold = 5 (composer trigger gdy > 5)', () => {
      expect(BULK_SEND_THRESHOLD).toBe(5);
      expect(shouldCheckBulkSend(5)).toBe(false);
      expect(shouldCheckBulkSend(6)).toBe(true);
    });
  });

  describe('exportAndForget (Art. 20 + Art. 17 combo)', () => {
    it('zwraca export JSON + cascade delete contact + consent', () => {
      ContactCardStore.upsert('bob@x.com', { name: 'Bob' });
      ConsentStore.grantConsent('bob@x.com');
      const exp = ConsentStore.exportAndForget('bob@x.com');
      expect(exp).toBeTruthy();
      expect(exp?.schemaVersion).toBe('1.0');
      expect(exp?.email).toBe('bob@x.com');
      expect(exp?.card?.name).toBe('Bob');
      expect(exp?.consent.consentGrantedAt).toBeGreaterThan(0);
      // Cascade delete potwierdzony
      expect(ContactCardStore.get('bob@x.com')).toBeUndefined();
      expect(ConsentStore.get('bob@x.com')).toBeUndefined();
    });

    it('zwraca null gdy brak contact + brak consent', () => {
      expect(ConsentStore.exportAndForget('nope@x.com')).toBeNull();
    });

    it('działa gdy jest tylko consent (bez card)', () => {
      ConsentStore.grantConsent('only-consent@x.com');
      const exp = ConsentStore.exportAndForget('only-consent@x.com');
      expect(exp).toBeTruthy();
      expect(exp?.card).toBeUndefined();
    });
  });

  describe('forget + bulkForget (Art. 17)', () => {
    it('forget cascade', () => {
      ContactCardStore.upsert('bob@x.com', { name: 'Bob' });
      ConsentStore.grantConsent('bob@x.com');
      expect(ConsentStore.forget('bob@x.com')).toBe(true);
      expect(ContactCardStore.get('bob@x.com')).toBeUndefined();
      expect(ConsentStore.get('bob@x.com')).toBeUndefined();
    });

    it('forget nic do usunięcia → false', () => {
      expect(ConsentStore.forget('unknown@x.com')).toBe(false);
    });

    it('bulkForget zwraca count', () => {
      ContactCardStore.upsert('a@x.com');
      ContactCardStore.upsert('b@x.com');
      ConsentStore.grantConsent('c@x.com');
      const n = ConsentStore.bulkForget(['a@x.com', 'b@x.com', 'c@x.com', 'nope@x.com']);
      expect(n).toBe(3);
    });
  });

  describe('contactRequiresEncryption (Tier B warning)', () => {
    it('false gdy contact nie istnieje', () => {
      expect(ConsentStore.contactRequiresEncryption('nope@x.com').required).toBe(false);
    });

    it('false gdy customFields bez PESEL/IBAN', () => {
      ContactCardStore.upsert('bob@x.com');
      ContactCardStore.setCustomField('bob@x.com', 'nip', '5260250274');
      const r = ConsentStore.contactRequiresEncryption('bob@x.com');
      expect(r.required).toBe(false);
    });

    it('true gdy PESEL set', () => {
      ContactCardStore.upsert('bob@x.com');
      ContactCardStore.setCustomField('bob@x.com', 'pesel', '44051401359');
      const r = ConsentStore.contactRequiresEncryption('bob@x.com');
      expect(r.required).toBe(true);
      expect(r.fields).toContain('pesel');
    });

    it('true gdy IBAN set', () => {
      ContactCardStore.upsert('bob@x.com');
      ContactCardStore.setCustomField('bob@x.com', 'iban', 'PL61109010140000071219812874');
      const r = ConsentStore.contactRequiresEncryption('bob@x.com');
      expect(r.required).toBe(true);
      expect(r.fields).toContain('iban');
    });

    it('lista wielu pól', () => {
      ContactCardStore.upsert('bob@x.com');
      ContactCardStore.setCustomField('bob@x.com', 'pesel', '44051401359');
      ContactCardStore.setCustomField('bob@x.com', 'iban', 'PL61109010140000071219812874');
      const r = ConsentStore.contactRequiresEncryption('bob@x.com');
      expect(r.fields.sort()).toEqual(['iban', 'pesel']);
    });
  });

  describe('list / persistence / listen', () => {
    it('list sortuje', () => {
      ConsentStore.grantConsent('z@x.com');
      ConsentStore.grantConsent('a@x.com');
      expect(ConsentStore.list().map(r => r.email)).toEqual(['a@x.com', 'z@x.com']);
    });

    it('persists', () => {
      ConsentStore.grantConsent('a@x.com');
      expect(localStorage.getItem('actuna.rodo-consent')).toContain('a@x.com');
    });

    it('listen emit', () => {
      let n = 0;
      const unsub = ConsentStore.listen(() => n++);
      ConsentStore.grantConsent('a@x.com');
      ConsentStore.revokeConsent('a@x.com');
      ConsentStore.forget('a@x.com');
      expect(n).toBe(3);
      unsub();
    });
  });
});
