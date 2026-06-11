import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  verifySafeStorageBackend,
  detectV02Data,
  archiveV02Data,
} from '../../src/browser/first-launch-checks';

// Ticket 45 sub-faza 45c — first-launch-checks helpers.
//
// Two responsibilities (memo §5 user decisions 2026-05-12):
//   1. Linux refuse-to-start gate when safeStorage backend is
//      basic_text or unavailable.
//   2. v0.2.x plaintext data folder detection + archive rename
//      (Privacy-by-Design fresh-install policy).

describe('first-launch-checks (ticket 45c)', function firstLaunchChecksSpec() {
  describe('verifySafeStorageBackend', () => {
    it('returns ok for macOS Keychain', () => {
      const result = verifySafeStorageBackend(
        { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'keychain' },
        'darwin'
      );
      expect(result.ok).toBe(true);
    });

    it('returns ok for Windows DPAPI', () => {
      const result = verifySafeStorageBackend(
        { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'dpapi' },
        'win32'
      );
      expect(result.ok).toBe(true);
    });

    it('returns ok for Linux GNOME Keyring', () => {
      const result = verifySafeStorageBackend(
        { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret' },
        'linux'
      );
      expect(result.ok).toBe(true);
    });

    it('refuses when isEncryptionAvailable returns false', () => {
      const result = verifySafeStorageBackend(
        { isEncryptionAvailable: () => false },
        'linux'
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('unavailable');
      expect(result.message).toMatch(/safeStorage|encryption/i);
    });

    it('refuses on Linux basic_text backend with install hint', () => {
      const result = verifySafeStorageBackend(
        { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' },
        'linux'
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('basic_text');
      expect(result.message).toMatch(/gnome-keyring|kwallet/i);
    });

    it('Linux install hint mentions both GNOME Keyring and KWallet', () => {
      const result = verifySafeStorageBackend(
        { isEncryptionAvailable: () => false },
        'linux'
      );
      expect(result.message).toMatch(/gnome-keyring/i);
      expect(result.message).toMatch(/kwallet/i);
    });

    it('non-Linux unavailable: no install hint about keyring/kwallet', () => {
      const result = verifySafeStorageBackend(
        { isEncryptionAvailable: () => false },
        'darwin'
      );
      expect(result.message).not.toMatch(/gnome-keyring/i);
      expect(result.message).not.toMatch(/kwallet/i);
    });
  });

  describe('detectV02Data', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-test-'));
    });
    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        /* ignore */
      }
    });

    it('returns false when edgehill.db does not exist', () => {
      expect(detectV02Data(tmpDir)).toBe(false);
    });

    it('returns true when edgehill.db starts with stock SQLite magic', () => {
      // Fake a v0.2.x plaintext SQLite: write the 16-byte magic header.
      const dbPath = path.join(tmpDir, 'actunamail.db');
      const header = Buffer.from('SQLite format 3\0', 'utf-8');
      fs.writeFileSync(dbPath, header);
      expect(detectV02Data(tmpDir)).toBe(true);
    });

    it('returns false when edgehill.db is opaque (SQLCipher-encrypted)', () => {
      // Fake an encrypted DB: random bytes, no magic header.
      const dbPath = path.join(tmpDir, 'actunamail.db');
      const opaque = Buffer.alloc(16, 0xAB); // non-magic content
      fs.writeFileSync(dbPath, opaque);
      expect(detectV02Data(tmpDir)).toBe(false);
    });

    it('returns false when file is shorter than 16 bytes (corrupt)', () => {
      const dbPath = path.join(tmpDir, 'actunamail.db');
      fs.writeFileSync(dbPath, Buffer.from('short', 'utf-8'));
      expect(detectV02Data(tmpDir)).toBe(false);
    });
  });

  describe('archiveV02Data', () => {
    let tmpRoot: string;
    let configDir: string;
    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-archive-test-'));
      configDir = path.join(tmpRoot, 'ActunaMail');
      fs.mkdirSync(configDir);
      fs.writeFileSync(path.join(configDir, 'actunamail.db'), 'fake plaintext db');
      fs.writeFileSync(path.join(configDir, 'mail_rules.json'), '{}');
    });
    afterEach(() => {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch (_) {
        /* ignore */
      }
    });

    it('renames the data folder to <dir>.v0.2-archive-<timestamp>', () => {
      const fixedTs = '2026-05-15T21-30-00';
      const archivePath = archiveV02Data(configDir, fixedTs);
      expect(archivePath).toBe(`${configDir}.v0.2-archive-2026-05-15-21-30-00`);
      expect(fs.existsSync(archivePath)).toBe(true);
      expect(fs.existsSync(path.join(archivePath, 'actunamail.db'))).toBe(true);
      expect(fs.existsSync(path.join(archivePath, 'mail_rules.json'))).toBe(true);
    });

    it('creates a fresh empty config dir after rename', () => {
      archiveV02Data(configDir, '2026-05-15T21-30-00');
      expect(fs.existsSync(configDir)).toBe(true);
      expect(fs.readdirSync(configDir)).toEqual([]);
    });

    it('archive folder name contains timestamp digits (sortable)', () => {
      const archivePath = archiveV02Data(configDir);
      expect(archivePath).toMatch(/\.v0\.2-archive-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
    });
  });
});
