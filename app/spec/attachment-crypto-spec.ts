import {
  MAGIC,
  FORMAT_VERSION,
  deriveAttachmentKey,
  encrypt,
  decrypt,
  looksEncrypted,
} from '../src/attachment-crypto';

// Ticket 49 sub-faza 49a — attachment at-rest encryption crypto helper.
//
// Verifies the AES-256-GCM on-disk format, HKDF key derivation, and the
// legacy-plaintext passthrough. The mailsync C++ side (49b) implements
// the SAME format — an interop check (JS-encrypted file decrypted by
// C++ and vice versa) lives in scripts/test-tier-a-smoke.js.
//
// These tests pass an explicit key so they don't depend on safeStorage
// / KeyManager being available in the renderer test env.

describe('attachment-crypto (ticket 49a)', function attachmentCryptoSpec() {
  // Deterministic 32-byte DBKey-equivalent for tests.
  const fakeDbKey = Buffer.alloc(32, 0x5a);
  const key = deriveAttachmentKey(fakeDbKey);

  describe('deriveAttachmentKey (HKDF)', () => {
    it('produces a 32-byte key', () => {
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('is deterministic for the same DBKey', () => {
      const again = deriveAttachmentKey(fakeDbKey);
      expect(again.equals(key)).toBe(true);
    });

    it('differs for a different DBKey', () => {
      const other = deriveAttachmentKey(Buffer.alloc(32, 0x01));
      expect(other.equals(key)).toBe(false);
    });

    it('is NOT equal to the raw DBKey (derivation actually happened)', () => {
      expect(key.equals(fakeDbKey)).toBe(false);
    });
  });

  describe('encrypt → on-disk format', () => {
    it('starts with the AENC magic + version byte', () => {
      const out = encrypt(Buffer.from('hello attachment'), key);
      expect(out.subarray(0, 4).equals(MAGIC)).toBe(true);
      expect(out[4]).toBe(FORMAT_VERSION);
    });

    it('does not contain the plaintext', () => {
      const plain = Buffer.from('SECRET-INVOICE-CONTENT');
      const out = encrypt(plain, key);
      expect(out.includes(plain)).toBe(false);
    });

    it('uses a fresh nonce each call (ciphertext differs)', () => {
      const plain = Buffer.from('same input');
      const a = encrypt(plain, key);
      const b = encrypt(plain, key);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('round-trip', () => {
    it('decrypt(encrypt(x)) === x', () => {
      const plain = Buffer.from('the quick brown fox 📎 załącznik');
      const restored = decrypt(encrypt(plain, key), key);
      expect(restored.equals(plain)).toBe(true);
    });

    it('handles empty input', () => {
      const restored = decrypt(encrypt(Buffer.alloc(0), key), key);
      expect(restored.length).toBe(0);
    });

    it('handles a large buffer (1 MB)', () => {
      const plain = Buffer.alloc(1024 * 1024, 0xab);
      const restored = decrypt(encrypt(plain, key), key);
      expect(restored.equals(plain)).toBe(true);
    });
  });

  describe('authentication (GCM tag)', () => {
    it('throws when the ciphertext is tampered', () => {
      const out = encrypt(Buffer.from('integrity matters'), key);
      out[out.length - 20] ^= 0xff; // flip a byte inside the ciphertext
      expect(() => decrypt(out, key)).toThrow();
    });

    it('throws when decrypted with the wrong key', () => {
      const out = encrypt(Buffer.from('wrong key test'), key);
      const wrongKey = deriveAttachmentKey(Buffer.alloc(32, 0x99));
      expect(() => decrypt(out, wrongKey)).toThrow();
    });
  });

  describe('legacy plaintext passthrough', () => {
    it('decrypt() returns a non-AENC buffer unchanged', () => {
      const legacy = Buffer.from('a pre-49 plaintext attachment');
      const out = decrypt(legacy, key);
      expect(out.equals(legacy)).toBe(true);
    });

    it('looksEncrypted() is false for plaintext, true for AENC output', () => {
      expect(looksEncrypted(Buffer.from('plain'))).toBe(false);
      expect(looksEncrypted(encrypt(Buffer.from('x'), key))).toBe(true);
    });
  });
});
