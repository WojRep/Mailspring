import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import KeyManager, { DBKeyLockedError } from '../../src/key-manager';
import {
  deriveKEK,
  wrapDBKey,
  unwrapDBKey,
  encodeBlob,
  decodeBlob,
  generateRecoveryCode,
  normalizeRecoveryCode,
  WrongSecretError,
  CorruptBlobError,
  ARGON2_DEFAULTS,
} from '../../src/key-manager-tier-b';

// Ticket 46 sub-faza 46a — SQLCipher Tier B (opt-in master password).
// Per analysis/13-sqlcipher-migration-design.md §3 Tier B.
//
// Two describe blocks:
//   1. key-manager-tier-b — pure crypto, exercised with REAL Argon2id at
//      cheap params for speed (parameter correctness checked separately).
//   2. KeyManager Tier B — enable/unlock/change/disable/recovery against a
//      real tmpdir. Argon2id is stubbed with a fast deterministic hash so
//      the suite stays quick; the stub preserves the KDF contract
//      (same secret+salt → same KEK), so roundtrip + wrong-password
//      behaviour is still genuinely verified.

const CHEAP: typeof ARGON2_DEFAULTS = { m: 256, t: 1, p: 1 };

// Mailspring's vendored Jasmine has no `toThrowError(Class)` — capture
// the thrown error and assert its type explicitly.
function thrown(fn: () => void): Error | undefined {
  try {
    fn();
  } catch (err) {
    return err as Error;
  }
  return undefined;
}

describe('key-manager-tier-b — pure crypto (ticket 46a)', () => {
  const dbKey = () => crypto.randomBytes(32);

  describe('deriveKEK', () => {
    it('returns a 32-byte Buffer', () => {
      const kek = deriveKEK('pw', Buffer.alloc(16, 7), CHEAP);
      expect(Buffer.isBuffer(kek)).toBe(true);
      expect(kek.length).toBe(32);
    });

    it('is deterministic for the same secret + salt + params', () => {
      const salt = Buffer.alloc(16, 9);
      expect(deriveKEK('pw', salt, CHEAP).equals(deriveKEK('pw', salt, CHEAP))).toBe(true);
    });

    it('differs for a different salt', () => {
      expect(
        deriveKEK('pw', Buffer.alloc(16, 1), CHEAP).equals(
          deriveKEK('pw', Buffer.alloc(16, 2), CHEAP)
        )
      ).toBe(false);
    });

    it('uses OWASP-grade default parameters (memo §3 desktop target)', () => {
      expect(ARGON2_DEFAULTS.m).toBe(65536); // 64 MiB
      expect(ARGON2_DEFAULTS.t).toBe(3);
      expect(ARGON2_DEFAULTS.p).toBe(1);
    });
  });

  describe('wrapDBKey / unwrapDBKey', () => {
    it('round-trips the DBKey byte-for-byte', () => {
      const k = dbKey();
      const blob = wrapDBKey(k, 'correct horse', CHEAP);
      expect(unwrapDBKey(blob, 'correct horse').equals(k)).toBe(true);
    });

    it('produces a fixed-length blob (86 bytes)', () => {
      expect(wrapDBKey(dbKey(), 'pw', CHEAP).length).toBe(86);
    });

    it('throws WrongSecretError on an incorrect secret', () => {
      const blob = wrapDBKey(dbKey(), 'right', CHEAP);
      expect(thrown(() => unwrapDBKey(blob, 'wrong')) instanceof WrongSecretError).toBe(true);
    });

    it('stores the Argon2id params inside the blob', () => {
      const blob = wrapDBKey(dbKey(), 'pw', CHEAP);
      expect(decodeBlob(blob).params).toEqual(CHEAP);
    });

    it('rejects a non-32-byte DBKey', () => {
      expect(() => wrapDBKey(Buffer.alloc(16), 'pw', CHEAP)).toThrow();
    });
  });

  describe('decodeBlob', () => {
    it('throws CorruptBlobError on a truncated blob', () => {
      expect(thrown(() => decodeBlob(Buffer.alloc(10))) instanceof CorruptBlobError).toBe(true);
    });

    it('throws CorruptBlobError on an unsupported version byte', () => {
      const blob = wrapDBKey(dbKey(), 'pw', CHEAP);
      blob.writeUInt8(99, 0);
      expect(thrown(() => decodeBlob(blob)) instanceof CorruptBlobError).toBe(true);
    });

    it('round-trips through encodeBlob', () => {
      const original = wrapDBKey(dbKey(), 'pw', CHEAP);
      expect(encodeBlob(decodeBlob(original)).equals(original)).toBe(true);
    });
  });

  describe('generateRecoveryCode / normalizeRecoveryCode', () => {
    it('generates a grouped 32-char base32 code', () => {
      const code = generateRecoveryCode();
      expect(normalizeRecoveryCode(code).length).toBe(32);
      expect(normalizeRecoveryCode(code)).toMatch(/^[A-Z2-7]{32}$/);
    });

    it('generates a different code each call', () => {
      expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
    });

    it('normalizes dashes, spaces and case', () => {
      expect(normalizeRecoveryCode('a3f2-b4 c5')).toBe('A3F2B4C5');
    });

    it('unwraps identically whether the code is grouped or not', () => {
      const k = dbKey();
      const code = generateRecoveryCode();
      const blob = wrapDBKey(k, normalizeRecoveryCode(code), CHEAP);
      expect(unwrapDBKey(blob, normalizeRecoveryCode(code.replace(/-/g, ''))).equals(k)).toBe(true);
    });
  });
});

describe('KeyManager — SQLCipher Tier B (ticket 46a)', () => {
  let dir: string;
  const remoteSafeStorage = () => require('@electron/remote').safeStorage;
  const argon2Module = () => require('@noble/hashes/argon2');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-tierb-'));
    (KeyManager as any).wipeDBKey();
    spyOn(AppEnv, 'getConfigDirPath').andReturn(dir);
    // safeStorage round-trip stub (Tier A db-key.enc read/write).
    spyOn(remoteSafeStorage(), 'isEncryptionAvailable').andReturn(true);
    spyOn(remoteSafeStorage(), 'encryptString').andCallFake((s: string) =>
      Buffer.from(`enc:${s}`, 'utf-8')
    );
    spyOn(remoteSafeStorage(), 'decryptString').andCallFake((b: Buffer) =>
      b.toString('utf-8').replace(/^enc:/, '')
    );
    // Fast deterministic Argon2id stub — preserves the KDF contract
    // (same secret+salt → same KEK) so roundtrip/wrong-password tests
    // stay genuine while the suite runs in milliseconds.
    spyOn(argon2Module(), 'argon2id').andCallFake((secret: any, salt: any, opts: any) => {
      const h = crypto
        .createHash('sha256')
        .update(Buffer.concat([Buffer.from(secret), Buffer.from(salt)]))
        .digest();
      return new Uint8Array(h.subarray(0, opts.dkLen));
    });
  });

  afterEach(() => {
    (KeyManager as any).wipeDBKey();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      /* best effort */
    }
  });

  const tierbPath = () => path.join(dir, 'db-key.tierb.enc');
  const recoveryPath = () => path.join(dir, 'db-key.recovery.enc');
  const tierAPath = () => path.join(dir, 'db-key.enc');

  describe('enableTierB', () => {
    it('writes the tierb + recovery blobs and removes db-key.enc', () => {
      KeyManager.getDBKey(); // generate Tier A key
      expect(fs.existsSync(tierAPath())).toBe(true);
      const { recoveryCode } = KeyManager.enableTierB('master-pw');
      expect(normalizeRecoveryCode(recoveryCode).length).toBe(32);
      expect(fs.existsSync(tierbPath())).toBe(true);
      expect(fs.existsSync(recoveryPath())).toBe(true);
      expect(fs.existsSync(tierAPath())).toBe(false);
    });

    it('reports Tier B as enabled afterwards and stays unlocked', () => {
      KeyManager.getDBKey();
      KeyManager.enableTierB('master-pw');
      expect(KeyManager.isTierBEnabled()).toBe(true);
      expect(KeyManager.isLocked()).toBe(false);
      expect(KeyManager.getDBKey().length).toBe(32);
    });

    it('refuses to enable twice', () => {
      KeyManager.getDBKey();
      KeyManager.enableTierB('master-pw');
      expect(() => KeyManager.enableTierB('other')).toThrow();
    });
  });

  describe('lock / unlock roundtrip', () => {
    it('preserves the DBKey byte-for-byte across enable → lock → unlock', () => {
      const original = Buffer.from(KeyManager.getDBKey());
      KeyManager.enableTierB('master-pw');
      KeyManager.lock();
      expect(KeyManager.isLocked()).toBe(true);
      KeyManager.unlockTierB('master-pw');
      expect(KeyManager.getDBKey().equals(original)).toBe(true);
    });

    it('getDBKey throws DBKeyLockedError while locked', () => {
      KeyManager.getDBKey();
      KeyManager.enableTierB('master-pw');
      KeyManager.lock();
      expect(thrown(() => KeyManager.getDBKey()) instanceof DBKeyLockedError).toBe(true);
    });

    it('rejects an incorrect master password', () => {
      KeyManager.getDBKey();
      KeyManager.enableTierB('master-pw');
      KeyManager.lock();
      expect(thrown(() => KeyManager.unlockTierB('wrong-pw')) instanceof WrongSecretError).toBe(
        true
      );
    });
  });

  describe('unlockWithRecoveryCode', () => {
    it('unlocks via the recovery code', () => {
      const original = Buffer.from(KeyManager.getDBKey());
      const { recoveryCode } = KeyManager.enableTierB('master-pw');
      KeyManager.lock();
      KeyManager.unlockWithRecoveryCode(recoveryCode);
      expect(KeyManager.getDBKey().equals(original)).toBe(true);
    });

    it('rejects an incorrect recovery code', () => {
      KeyManager.getDBKey();
      KeyManager.enableTierB('master-pw');
      KeyManager.lock();
      expect(
        thrown(() => KeyManager.unlockWithRecoveryCode('AAAA-BBBB-CCCC-DDDD')) instanceof
          WrongSecretError
      ).toBe(true);
    });
  });

  describe('changeTierBPassword', () => {
    it('preserves DBKey identity and rotates the password', () => {
      const original = Buffer.from(KeyManager.getDBKey());
      KeyManager.enableTierB('old-pw');
      KeyManager.changeTierBPassword('old-pw', 'new-pw');
      KeyManager.lock();
      KeyManager.unlockTierB('new-pw');
      expect(KeyManager.getDBKey().equals(original)).toBe(true);
    });

    it('rejects the wrong old password', () => {
      KeyManager.getDBKey();
      KeyManager.enableTierB('old-pw');
      expect(
        thrown(() => KeyManager.changeTierBPassword('not-old', 'new-pw')) instanceof
          WrongSecretError
      ).toBe(true);
    });

    it('invalidates the old password after change', () => {
      KeyManager.getDBKey();
      KeyManager.enableTierB('old-pw');
      KeyManager.changeTierBPassword('old-pw', 'new-pw');
      KeyManager.lock();
      expect(thrown(() => KeyManager.unlockTierB('old-pw')) instanceof WrongSecretError).toBe(true);
    });
  });

  describe('regenerateRecoveryCode', () => {
    it('issues a working new code and invalidates the old one', () => {
      const original = Buffer.from(KeyManager.getDBKey());
      const { recoveryCode: oldCode } = KeyManager.enableTierB('master-pw');
      const { recoveryCode: newCode } = KeyManager.regenerateRecoveryCode('master-pw');
      expect(newCode).not.toBe(oldCode);
      KeyManager.lock();
      KeyManager.unlockWithRecoveryCode(newCode);
      expect(KeyManager.getDBKey().equals(original)).toBe(true);
      KeyManager.lock();
      expect(
        thrown(() => KeyManager.unlockWithRecoveryCode(oldCode)) instanceof WrongSecretError
      ).toBe(true);
    });
  });

  describe('disableTierB', () => {
    it('restores db-key.enc and removes the Tier B blobs', () => {
      const original = Buffer.from(KeyManager.getDBKey());
      KeyManager.enableTierB('master-pw');
      KeyManager.disableTierB('master-pw');
      expect(fs.existsSync(tierAPath())).toBe(true);
      expect(fs.existsSync(tierbPath())).toBe(false);
      expect(fs.existsSync(recoveryPath())).toBe(false);
      expect(KeyManager.isTierBEnabled()).toBe(false);
      expect(KeyManager.getDBKey().equals(original)).toBe(true);
    });

    it('rejects the wrong password', () => {
      KeyManager.getDBKey();
      KeyManager.enableTierB('master-pw');
      expect(thrown(() => KeyManager.disableTierB('wrong')) instanceof WrongSecretError).toBe(true);
    });
  });
});

describe('KeyManager — Tier B audit events (ticket #62)', () => {
  let dir: string;
  const remoteSafeStorage = () => require('@electron/remote').safeStorage;
  const argon2Module = () => require('@noble/hashes/argon2');
  const auditModule = () => require('../../src/utils/audit-fanout');
  let events: string[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-tierb-audit-'));
    (KeyManager as any).wipeDBKey();
    events = [];
    spyOn(AppEnv, 'getConfigDirPath').andReturn(dir);
    spyOn(remoteSafeStorage(), 'isEncryptionAvailable').andReturn(true);
    spyOn(remoteSafeStorage(), 'encryptString').andCallFake((s: string) =>
      Buffer.from(`enc:${s}`, 'utf-8')
    );
    spyOn(remoteSafeStorage(), 'decryptString').andCallFake((b: Buffer) =>
      b.toString('utf-8').replace(/^enc:/, '')
    );
    spyOn(argon2Module(), 'argon2id').andCallFake((secret: any, salt: any, opts: any) => {
      const h = crypto
        .createHash('sha256')
        .update(Buffer.concat([Buffer.from(secret), Buffer.from(salt)]))
        .digest();
      return new Uint8Array(h.subarray(0, opts.dkLen));
    });
    spyOn(auditModule(), 'auditLog').andCallFake((event: string) => {
      events.push(event);
    });
  });

  afterEach(() => {
    (KeyManager as any).wipeDBKey();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      /* best effort */
    }
  });

  it('emits tier-b-enabled on enableTierB', () => {
    KeyManager.getDBKey();
    KeyManager.enableTierB('master-pw');
    expect(events).toContain('tier-b-enabled');
  });

  it('emits tier-b-unlocked on a successful unlock', () => {
    KeyManager.getDBKey();
    KeyManager.enableTierB('master-pw');
    KeyManager.lock();
    KeyManager.unlockTierB('master-pw');
    expect(events).toContain('tier-b-unlocked');
  });

  it('emits tier-b-unlock-failed on an incorrect password', () => {
    KeyManager.getDBKey();
    KeyManager.enableTierB('master-pw');
    KeyManager.lock();
    thrown(() => KeyManager.unlockTierB('wrong-pw'));
    expect(events).toContain('tier-b-unlock-failed');
  });

  it('emits tier-b-unlocked-recovery on a recovery-code unlock', () => {
    KeyManager.getDBKey();
    const { recoveryCode } = KeyManager.enableTierB('master-pw');
    KeyManager.lock();
    KeyManager.unlockWithRecoveryCode(recoveryCode);
    expect(events).toContain('tier-b-unlocked-recovery');
  });

  it('emits tier-b-password-changed on changeTierBPassword', () => {
    KeyManager.getDBKey();
    KeyManager.enableTierB('old-pw');
    KeyManager.changeTierBPassword('old-pw', 'new-pw');
    expect(events).toContain('tier-b-password-changed');
  });

  it('emits tier-b-disabled on disableTierB', () => {
    KeyManager.getDBKey();
    KeyManager.enableTierB('master-pw');
    KeyManager.disableTierB('master-pw');
    expect(events).toContain('tier-b-disabled');
  });
});
