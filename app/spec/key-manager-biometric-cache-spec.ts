import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Ticket #41 — KeyManager biometric cache API spec.
 *
 * Testuje cacheTierBPasswordForBiometric + hasTierBBiometricCache +
 * clearTierBBiometricCache + unlockTierBWithCachedPassword (last via
 * spy bo wymaga real safeStorage + actual Tier B blob na dysku).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const KeyManager = require('../src/key-manager').default;

describe('KeyManager — biometric cache (ticket #41)', () => {
  let configDir: string;
  let originalGetConfigDir: any;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-41-'));
    // Spec runs in renderer (process.type !== 'browser'), więc
    // key-manager.getConfigDirPath() uses AppEnv.getConfigDirPath().
    originalGetConfigDir = (AppEnv as any).getConfigDirPath;
    (AppEnv as any).getConfigDirPath = () => configDir;
  });

  afterEach(() => {
    (AppEnv as any).getConfigDirPath = originalGetConfigDir;
    try {
      fs.rmSync(configDir, { recursive: true, force: true });
    } catch (e) {
      // best effort
    }
  });

  it('hasTierBBiometricCache returns false gdy plik nie istnieje', () => {
    expect(KeyManager.hasTierBBiometricCache()).toBe(false);
  });

  it('clearTierBBiometricCache no-op gdy plik nie istnieje', () => {
    expect(() => KeyManager.clearTierBBiometricCache()).not.toThrow();
  });

  it('cacheTierBPasswordForBiometric pisze plik + hasCache=true', () => {
    KeyManager.cacheTierBPasswordForBiometric('test-pass-123');
    expect(KeyManager.hasTierBBiometricCache()).toBe(true);
    const cachePath = path.join(configDir, 'db-key.tierb.touchid-cache.enc');
    expect(fs.existsSync(cachePath)).toBe(true);
    // Plik nie może być pustym tekstem — safeStorage encryption.
    const blob = fs.readFileSync(cachePath);
    expect(blob.length).toBeGreaterThan(0);
    expect(blob.toString('utf-8')).not.toBe('test-pass-123');
  });

  it('cacheTierBPasswordForBiometric no-op dla pustego password', () => {
    KeyManager.cacheTierBPasswordForBiometric('');
    expect(KeyManager.hasTierBBiometricCache()).toBe(false);
  });

  it('clearTierBBiometricCache usuwa plik', () => {
    KeyManager.cacheTierBPasswordForBiometric('rotate-me');
    expect(KeyManager.hasTierBBiometricCache()).toBe(true);
    KeyManager.clearTierBBiometricCache();
    expect(KeyManager.hasTierBBiometricCache()).toBe(false);
  });

  it('unlockTierBWithCachedPassword returns false gdy cache pusty', () => {
    expect(KeyManager.unlockTierBWithCachedPassword()).toBe(false);
  });
});
