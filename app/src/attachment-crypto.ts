import * as crypto from 'crypto';
import KeyManager from './key-manager';

// Ticket 49 sub-faza 49a — attachment at-rest encryption (Tier A scope).
//
// Attachment files in `files/<id>/` were stored in plaintext while the
// SQLCipher database was already encrypted (audit
// analysis/15-storage-audit-code-verified.md, Podatność 1 — High Risk).
// This module is the JS half of the at-rest encryption; mailsync C++
// (AttachmentCrypto.cpp, 49b) implements the SAME on-disk format so a
// file written by either side opens on the other.
//
// On-disk format (per file):
//
//   [ magic "AENC" (4B) | version u8 (1B) | nonce (12B) | ciphertext | GCM tag (16B) ]
//
// Cipher: AES-256-GCM. The key is HKDF-SHA256 derived ONCE from the
// SQLCipher DBKey (KeyManager.getDBKey) — no separate secret to manage,
// same trust model as the database. Per-file random 96-bit nonce in the
// header guarantees GCM nonce uniqueness.
//
// Legacy passthrough: a file whose first 4 bytes are not "AENC" is a
// pre-49 plaintext attachment — decrypt() returns it unchanged. New
// writes are always encrypted. No migration pass (fresh-install policy,
// ticket 45 §5).

export const MAGIC = Buffer.from('AENC', 'ascii');
export const FORMAT_VERSION = 1;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const HKDF_INFO = 'actuna-attachment-v1';
const HEADER_LEN = MAGIC.length + 1 + NONCE_LEN; // magic + version + nonce

let _attachmentKeyCache: Buffer | null = null;

/**
 * Derive the 32-byte attachment-encryption key from a DBKey via
 * HKDF-SHA256. Pure function — exported for cross-process / test use.
 */
export function deriveAttachmentKey(dbKey: Buffer): Buffer {
  const derived = crypto.hkdfSync('sha256', dbKey, Buffer.alloc(0), HKDF_INFO, KEY_LEN);
  return Buffer.from(derived);
}

/**
 * The process-wide attachment key (derived from KeyManager.getDBKey,
 * cached). Throws — via getDBKey — if safeStorage is unavailable.
 */
export function getAttachmentKey(): Buffer {
  if (_attachmentKeyCache) {
    return _attachmentKeyCache;
  }
  _attachmentKeyCache = deriveAttachmentKey(KeyManager.getDBKey());
  return _attachmentKeyCache;
}

/** True if `buf` carries the AENC header (i.e. is an encrypted attachment). */
export function looksEncrypted(buf: Buffer): boolean {
  return buf.length >= HEADER_LEN + TAG_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

/**
 * Encrypt a plaintext attachment buffer into the on-disk AENC format.
 */
export function encrypt(plain: Buffer, key: Buffer = getAttachmentKey()): Buffer {
  const nonce = crypto.randomBytes(NONCE_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION]), nonce]);
  return Buffer.concat([header, ciphertext, tag]);
}

/**
 * Decrypt an on-disk attachment buffer.
 *
 * - AENC-format input → authenticated decrypt (throws on tampering /
 *   wrong key — GCM tag mismatch).
 * - Non-AENC input → legacy pre-49 plaintext, returned unchanged.
 */
export function decrypt(stored: Buffer, key: Buffer = getAttachmentKey()): Buffer {
  if (!looksEncrypted(stored)) {
    return stored; // legacy plaintext passthrough
  }
  const version = stored[MAGIC.length];
  if (version !== FORMAT_VERSION) {
    throw new Error(`attachment-crypto: unsupported format version ${version}`);
  }
  const nonce = stored.subarray(MAGIC.length + 1, HEADER_LEN);
  const tag = stored.subarray(stored.length - TAG_LEN);
  const ciphertext = stored.subarray(HEADER_LEN, stored.length - TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Test/rotation hook — clears the cached derived key. */
export function wipeAttachmentKey(): void {
  if (_attachmentKeyCache) {
    _attachmentKeyCache.fill(0);
  }
  _attachmentKeyCache = null;
}
