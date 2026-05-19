import * as crypto from 'crypto';
import { argon2id } from '@noble/hashes/argon2';

/**
 * SQLCipher Tier B crypto helpers (ticket 46a).
 *
 * Pure crypto — NO Electron imports — so this module is unit-testable
 * without an Electron harness and runs identically in the main process,
 * the renderer, and the Jasmine spec env.
 *
 * Tier B wraps the existing Tier A 32-byte DBKey under a key-encryption
 * key (KEK) derived from a user secret (master password OR recovery
 * code) via Argon2id. The wrapped blob is what lands on disk; the plain
 * DBKey only ever exists in RAM during an unlock window.
 *
 *   KEK   = Argon2id(secret, salt, params)
 *   blob  = AES-256-GCM(KEK, nonce, DBKey)   + auth tag
 *
 * The GCM auth tag doubles as password verification: a wrong secret
 * derives a wrong KEK, and `decipher.final()` throws — surfaced here as
 * `WrongSecretError` rather than a generic crypto exception.
 *
 * Per analysis/13-sqlcipher-migration-design.md §3 and OWASP Password
 * Storage Cheat Sheet.
 */

/**
 * Argon2id parameters. Memo §3 desktop-comfort target — above the OWASP
 * 2025 floor (19 MiB / t=2) for a ~0.5-1.5 s unlock on mid-range
 * hardware. `m` is memory in KiB; 65536 KiB = 64 MiB.
 *
 * Stored inside every blob so a future parameter change stays
 * backward-compatible: old blobs unwrap with their own recorded params.
 */
export interface Argon2Params {
  m: number; // memory cost, KiB
  t: number; // time cost, iterations
  p: number; // parallelism
}

export const ARGON2_DEFAULTS: Argon2Params = { m: 65536, t: 3, p: 1 };

const BLOB_VERSION = 1;
const SALT_LEN = 16;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEK_LEN = 32;
const DB_KEY_LEN = 32;

// version(1) + m(4) + t(4) + p(1) + salt(16) + nonce(12) + ct(32) + tag(16)
const HEADER_LEN = 1 + 4 + 4 + 1;
const BLOB_LEN = HEADER_LEN + SALT_LEN + NONCE_LEN + DB_KEY_LEN + TAG_LEN;

/** Thrown when a master password / recovery code fails to unwrap a blob. */
export class WrongSecretError extends Error {
  constructor(message = 'Incorrect master password or recovery code.') {
    super(message);
    this.name = 'WrongSecretError';
    // Never report a wrong-password attempt to Sentry — it is expected.
    (this as any).noSentry = true;
  }
}

/** Thrown when an on-disk blob is malformed (truncated, bad version). */
export class CorruptBlobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptBlobError';
  }
}

/**
 * Derive a 32-byte KEK from a secret + salt via Argon2id. Exported for
 * spec coverage of parameter correctness.
 */
export function deriveKEK(
  secret: string | Buffer,
  salt: Buffer,
  params: Argon2Params = ARGON2_DEFAULTS
): Buffer {
  const secretBytes = typeof secret === 'string' ? Buffer.from(secret, 'utf-8') : secret;
  const out = argon2id(secretBytes, salt, {
    m: params.m,
    t: params.t,
    p: params.p,
    dkLen: KEK_LEN,
  });
  return Buffer.from(out);
}

/**
 * Wrap a 32-byte DBKey under a secret. Generates a fresh random salt and
 * nonce, derives the KEK, AES-256-GCM-encrypts the DBKey, and returns the
 * full encoded blob ready for `fs.writeFileSync`.
 */
export function wrapDBKey(
  dbKey: Buffer,
  secret: string,
  params: Argon2Params = ARGON2_DEFAULTS
): Buffer {
  if (!Buffer.isBuffer(dbKey) || dbKey.length !== DB_KEY_LEN) {
    throw new Error(`wrapDBKey: dbKey must be a ${DB_KEY_LEN}-byte Buffer`);
  }
  const salt = crypto.randomBytes(SALT_LEN);
  const nonce = crypto.randomBytes(NONCE_LEN);
  const kek = deriveKEK(secret, salt, params);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, nonce);
  const ciphertext = Buffer.concat([cipher.update(dbKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  kek.fill(0);
  return encodeBlob({ version: BLOB_VERSION, params, salt, nonce, ciphertext, tag });
}

/**
 * Unwrap a DBKey from an encoded blob using a secret. Throws
 * `WrongSecretError` if the secret is wrong (GCM tag mismatch),
 * `CorruptBlobError` if the blob is malformed.
 */
export function unwrapDBKey(blob: Buffer, secret: string): Buffer {
  const { params, salt, nonce, ciphertext, tag } = decodeBlob(blob);
  const kek = deriveKEK(secret, salt, params);
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, nonce);
  decipher.setAuthTag(tag);
  try {
    const dbKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    kek.fill(0);
    return dbKey;
  } catch (err) {
    kek.fill(0);
    throw new WrongSecretError();
  }
}

interface DecodedBlob {
  version: number;
  params: Argon2Params;
  salt: Buffer;
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

/** Serialize a wrapped-key blob to its fixed-layout disk representation. */
export function encodeBlob(b: DecodedBlob): Buffer {
  const out = Buffer.alloc(BLOB_LEN);
  let off = 0;
  out.writeUInt8(b.version, off);
  off += 1;
  out.writeUInt32BE(b.params.m, off);
  off += 4;
  out.writeUInt32BE(b.params.t, off);
  off += 4;
  out.writeUInt8(b.params.p, off);
  off += 1;
  b.salt.copy(out, off);
  off += SALT_LEN;
  b.nonce.copy(out, off);
  off += NONCE_LEN;
  b.ciphertext.copy(out, off);
  off += DB_KEY_LEN;
  b.tag.copy(out, off);
  return out;
}

/** Parse the fixed-layout disk representation back into its fields. */
export function decodeBlob(blob: Buffer): DecodedBlob {
  if (!Buffer.isBuffer(blob) || blob.length !== BLOB_LEN) {
    throw new CorruptBlobError(
      `Tier B key blob has unexpected length ${blob ? blob.length : 'n/a'} (expected ${BLOB_LEN}).`
    );
  }
  let off = 0;
  const version = blob.readUInt8(off);
  off += 1;
  if (version !== BLOB_VERSION) {
    throw new CorruptBlobError(`Tier B key blob version ${version} is not supported.`);
  }
  const m = blob.readUInt32BE(off);
  off += 4;
  const t = blob.readUInt32BE(off);
  off += 4;
  const p = blob.readUInt8(off);
  off += 1;
  const salt = blob.subarray(off, off + SALT_LEN);
  off += SALT_LEN;
  const nonce = blob.subarray(off, off + NONCE_LEN);
  off += NONCE_LEN;
  const ciphertext = blob.subarray(off, off + DB_KEY_LEN);
  off += DB_KEY_LEN;
  const tag = blob.subarray(off, off + TAG_LEN);
  return { version, params: { m, t, p }, salt, nonce, ciphertext, tag };
}

// RFC 4648 base32 alphabet (no padding) — unambiguous, no 0/1/8/9.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_CODE_CHARS = 32; // 32 base32 chars = 160 bits of entropy
const RECOVERY_GROUP = 4;

/**
 * Generate a 32-character base32 recovery code, grouped in 4-char blocks
 * for legibility (e.g. `A3F2-...`). The user records this once at Tier B
 * setup; it derives an alternate KEK that wraps a second copy of the
 * DBKey, so a forgotten master password is recoverable.
 */
export function generateRecoveryCode(): string {
  let raw = '';
  for (let i = 0; i < RECOVERY_CODE_CHARS; i++) {
    raw += BASE32_ALPHABET[crypto.randomInt(BASE32_ALPHABET.length)];
  }
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += RECOVERY_GROUP) {
    groups.push(raw.slice(i, i + RECOVERY_GROUP));
  }
  return groups.join('-');
}

/**
 * Normalize a user-entered recovery code: strip dashes/whitespace,
 * uppercase. The normalized form is what gets fed to `deriveKEK`, so a
 * code copied with or without grouping dashes unlocks identically.
 */
export function normalizeRecoveryCode(code: string): string {
  return (code || '').replace(/[\s-]/g, '').toUpperCase();
}
