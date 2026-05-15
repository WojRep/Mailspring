import KeyManager from '../src/key-manager';

// Ticket 45 sub-faza 45a — KeyManager Tier A extension for SQLCipher
// implementation per analysis/13-sqlcipher-migration-design.md §3 Tier A.
//
// Adds `getDBKey()` returning 32-byte Buffer persisted via
// safeStorage.encryptString (macOS Keychain / Windows DPAPI / Linux GNOME
// Keyring), plus `wipeDBKey()` clearing in-memory cache.
//
// WHY: Sprint 7 Tier A ships SQLCipher default-ON for fresh installs;
// the DBKey is the single secret needed at DB open time (PRAGMA key).
// safeStorage is the OS-managed at-rest protection; in-memory cache
// keeps the runtime cost flat.

describe('KeyManager.getDBKey (ticket 45a — SQLCipher Tier A)', function keyManagerGetDBKeySpec() {
  const DB_KEY_CONFIG_NAME = 'databaseKey';
  const remoteSafeStorage = () => require('@electron/remote').safeStorage;

  beforeEach(function () {
    // Reset cache between tests via wipe (production also exposes this).
    (KeyManager as any).wipeDBKey();
    // Default mocks: encryption available, encrypt/decrypt round-trip.
    spyOn(remoteSafeStorage(), 'isEncryptionAvailable').andReturn(true);
    spyOn(remoteSafeStorage(), 'encryptString').andCallFake((s: string) =>
      Buffer.from(`enc:${s}`, 'utf-8')
    );
    spyOn(remoteSafeStorage(), 'decryptString').andCallFake((buf: Buffer) =>
      buf.toString('utf-8').replace(/^enc:/, '')
    );
  });

  describe('first-launch (empty config)', () => {
    it('returns a 32-byte Buffer', async () => {
      spyOn(AppEnv.config, 'get').andReturn(undefined);
      const setSpy = spyOn(AppEnv.config, 'set') as any;
      const key = await (KeyManager as any).getDBKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
      expect(setSpy).toHaveBeenCalled();
      // Persisted value should be the safeStorage-encrypted blob, not raw.
      const [persistedKey, persistedVal] = setSpy.calls.mostRecent().args;
      expect(persistedKey).toBe(DB_KEY_CONFIG_NAME);
      expect(typeof persistedVal === 'string' || Buffer.isBuffer(persistedVal)).toBe(true);
    });

    it('persists encrypted (not raw) via safeStorage.encryptString', async () => {
      spyOn(AppEnv.config, 'get').andReturn(undefined);
      spyOn(AppEnv.config, 'set');
      await (KeyManager as any).getDBKey();
      expect(remoteSafeStorage().encryptString).toHaveBeenCalled();
    });

    it('generates a fresh random key (not a constant)', async () => {
      spyOn(AppEnv.config, 'get').andReturn(undefined);
      spyOn(AppEnv.config, 'set');
      const k1 = await (KeyManager as any).getDBKey();
      (KeyManager as any).wipeDBKey();
      // simulate fresh first-launch again (config still empty)
      const k2 = await (KeyManager as any).getDBKey();
      expect(k1.equals(k2)).toBe(false);
    });
  });

  describe('subsequent launches (config has key)', () => {
    it('decrypts via safeStorage.decryptString and reuses', async () => {
      const fixedKey = Buffer.alloc(32, 0x42);
      const encrypted = Buffer.from(`enc:${fixedKey.toString('hex')}`, 'utf-8');
      spyOn(AppEnv.config, 'get').andReturn(encrypted);
      const setSpy = spyOn(AppEnv.config, 'set');
      const key = await (KeyManager as any).getDBKey();
      expect(remoteSafeStorage().decryptString).toHaveBeenCalled();
      expect(key.length).toBe(32);
      expect(key.equals(fixedKey)).toBe(true);
      // No re-persist on read path.
      expect(setSpy).not.toHaveBeenCalled();
    });
  });

  describe('idempotent within session', () => {
    it('returns the same buffer on repeated calls (RAM cache)', async () => {
      spyOn(AppEnv.config, 'get').andReturn(undefined);
      spyOn(AppEnv.config, 'set');
      const k1 = await (KeyManager as any).getDBKey();
      const k2 = await (KeyManager as any).getDBKey();
      expect(k1.equals(k2)).toBe(true);
      // safeStorage.encryptString called only once on first call, not second.
      expect((remoteSafeStorage().encryptString as any).calls.count()).toBe(1);
    });
  });

  describe('wipeDBKey', () => {
    it('overwrites the RAM cache with zeros', async () => {
      spyOn(AppEnv.config, 'get').andReturn(undefined);
      spyOn(AppEnv.config, 'set');
      const ref = await (KeyManager as any).getDBKey();
      // Capture pre-wipe state
      const wasNonZero = ref.some((b: number) => b !== 0);
      expect(wasNonZero).toBe(true);
      (KeyManager as any).wipeDBKey();
      // Same buffer reference now zeroed
      expect(ref.every((b: number) => b === 0)).toBe(true);
    });

    it('forces reload from config on next getDBKey call', async () => {
      const fixedKey = Buffer.alloc(32, 0x55);
      const encrypted = Buffer.from(`enc:${fixedKey.toString('hex')}`, 'utf-8');
      const getSpy = spyOn(AppEnv.config, 'get').andReturn(encrypted) as any;
      spyOn(AppEnv.config, 'set');
      await (KeyManager as any).getDBKey();
      const firstCallCount = getSpy.calls.count();
      (KeyManager as any).wipeDBKey();
      await (KeyManager as any).getDBKey();
      // After wipe, config.get must be re-queried.
      expect(getSpy.calls.count()).toBeGreaterThan(firstCallCount);
    });
  });

  describe('Linux refuse-to-start gate (safeStorage unavailable)', () => {
    it('throws a descriptive error when isEncryptionAvailable() === false', async () => {
      (remoteSafeStorage().isEncryptionAvailable as jasmine.Spy).andReturn(false);
      spyOn(AppEnv.config, 'get').andReturn(undefined);
      let thrown: Error | null = null;
      try {
        await (KeyManager as any).getDBKey();
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
