import fs from 'fs';
import KeyManager from '../src/key-manager';

// Ticket 45 sub-faza 45a — KeyManager Tier A extension for SQLCipher
// implementation per analysis/13-sqlcipher-migration-design.md §3 Tier A.
//
// Adds `getDBKey()` returning 32-byte Buffer persisted as a
// safeStorage-encrypted blob in <configDir>/db-key.enc, plus
// `wipeDBKey()` clearing the in-memory cache.
//
// v0.3.10 hotfix: getDBKey() is process-aware (works in main process +
// renderer) and stores the key in a dedicated file rather than
// AppEnv.config (which only exists in the renderer). These specs run
// in the renderer test env (process.type === 'renderer'), so the
// @electron/remote safeStorage path and AppEnv.getConfigDirPath() path
// are exercised.

describe('KeyManager.getDBKey (ticket 45a — SQLCipher Tier A)', function keyManagerGetDBKeySpec() {
  const remoteSafeStorage = () => require('@electron/remote').safeStorage;
  const FAKE_CONFIG_DIR = '/tmp/actuna-keymanager-spec';

  beforeEach(function () {
    (KeyManager as any).wipeDBKey();
    // configDirPath resolution (renderer path)
    spyOn(AppEnv, 'getConfigDirPath').andReturn(FAKE_CONFIG_DIR);
    // safeStorage: available, encrypt/decrypt round-trip
    spyOn(remoteSafeStorage(), 'isEncryptionAvailable').andReturn(true);
    spyOn(remoteSafeStorage(), 'encryptString').andCallFake((s: string) =>
      Buffer.from(`enc:${s}`, 'utf-8')
    );
    spyOn(remoteSafeStorage(), 'decryptString').andCallFake((buf: Buffer) =>
      buf.toString('utf-8').replace(/^enc:/, '')
    );
  });

  describe('first-launch (no db-key.enc file)', () => {
    it('returns a 32-byte Buffer and writes the encrypted blob', () => {
      spyOn(fs, 'existsSync').andReturn(false);
      const writeSpy = spyOn(fs, 'writeFileSync') as any;
      const key = (KeyManager as any).getDBKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
      expect(writeSpy).toHaveBeenCalled();
      const [writtenPath, writtenVal] = writeSpy.calls.mostRecent().args;
      expect(String(writtenPath)).toMatch(/db-key\.enc$/);
      expect(Buffer.isBuffer(writtenVal)).toBe(true);
    });

    it('persists encrypted (not raw) via safeStorage.encryptString', () => {
      spyOn(fs, 'existsSync').andReturn(false);
      spyOn(fs, 'writeFileSync');
      (KeyManager as any).getDBKey();
      expect(remoteSafeStorage().encryptString).toHaveBeenCalled();
    });

    it('generates a fresh random key (not a constant)', () => {
      spyOn(fs, 'existsSync').andReturn(false);
      spyOn(fs, 'writeFileSync');
      const k1 = (KeyManager as any).getDBKey();
      (KeyManager as any).wipeDBKey();
      const k2 = (KeyManager as any).getDBKey();
      expect(k1.equals(k2)).toBe(false);
    });
  });

  describe('subsequent launches (db-key.enc exists)', () => {
    it('decrypts via safeStorage.decryptString and reuses', () => {
      const fixedKey = Buffer.alloc(32, 0x42);
      const blob = Buffer.from(`enc:${fixedKey.toString('hex')}`, 'utf-8');
      spyOn(fs, 'existsSync').andReturn(true);
      spyOn(fs, 'readFileSync').andReturn(blob);
      const writeSpy = spyOn(fs, 'writeFileSync');
      const key = (KeyManager as any).getDBKey();
      expect(remoteSafeStorage().decryptString).toHaveBeenCalled();
      expect(key.length).toBe(32);
      expect(key.equals(fixedKey)).toBe(true);
      // No re-write on the read path.
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe('idempotent within session', () => {
    it('returns the same buffer on repeated calls (RAM cache)', () => {
      spyOn(fs, 'existsSync').andReturn(false);
      spyOn(fs, 'writeFileSync');
      const k1 = (KeyManager as any).getDBKey();
      const k2 = (KeyManager as any).getDBKey();
      expect(k1.equals(k2)).toBe(true);
      // encryptString called only on the first call, not the second.
      expect((remoteSafeStorage().encryptString as any).calls.count()).toBe(1);
    });
  });

  describe('wipeDBKey', () => {
    it('overwrites the RAM cache with zeros', () => {
      spyOn(fs, 'existsSync').andReturn(false);
      spyOn(fs, 'writeFileSync');
      const ref = (KeyManager as any).getDBKey();
      expect(ref.some((b: number) => b !== 0)).toBe(true);
      (KeyManager as any).wipeDBKey();
      expect(ref.every((b: number) => b === 0)).toBe(true);
    });

    it('forces reload from disk on next getDBKey call', () => {
      const fixedKey = Buffer.alloc(32, 0x55);
      const blob = Buffer.from(`enc:${fixedKey.toString('hex')}`, 'utf-8');
      spyOn(fs, 'existsSync').andReturn(true);
      const readSpy = spyOn(fs, 'readFileSync').andReturn(blob) as any;
      spyOn(fs, 'writeFileSync');
      (KeyManager as any).getDBKey();
      const firstCount = readSpy.calls.count();
      (KeyManager as any).wipeDBKey();
      (KeyManager as any).getDBKey();
      expect(readSpy.calls.count()).toBeGreaterThan(firstCount);
    });
  });

  describe('Linux refuse-to-start gate (safeStorage unavailable)', () => {
    it('throws a descriptive error when isEncryptionAvailable() === false', () => {
      (remoteSafeStorage().isEncryptionAvailable as jasmine.Spy).andReturn(false);
      spyOn(fs, 'existsSync').andReturn(false);
      let thrown: Error | null = null;
      try {
        (KeyManager as any).getDBKey();
      } catch (err) {
        thrown = err as Error;
      }
      expect(thrown).not.toBeNull();
      expect(thrown!.message.toLowerCase()).toMatch(
        /encryption|safestorage|keyring|kwallet|keychain/
      );
    });
  });
});
