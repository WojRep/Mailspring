import fs from 'fs';
import os from 'os';
import path from 'path';
import { deleteArchive } from '../../src/browser/delete-archive-ipc';

// Ticket 45e — security regression coverage for the delete-archive
// IPC handler. The renderer can send any string path; the main
// process MUST refuse anything that doesn't match the
// `*.v0.2-archive-<timestamp>` pattern. A malicious or compromised
// window otherwise asking for rm -rf of /Users/me/Documents would
// succeed.

describe('deleteArchive (ticket 45e IPC security)', function deleteArchiveSpec() {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-rm-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  });

  describe('path whitelist (security regression guard)', () => {
    it('refuses an empty string', () => {
      const result = deleteArchive('');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/non-empty/i);
    });

    it('refuses arbitrary directory path (Documents)', () => {
      const evilPath = path.join(tmpRoot, 'Documents');
      fs.mkdirSync(evilPath);
      const result = deleteArchive(evilPath);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/pattern/i);
      // Critically: dir still exists, deleteArchive did NOT remove it.
      expect(fs.existsSync(evilPath)).toBe(true);
    });

    it('refuses path that LOOKS like archive but has wrong suffix', () => {
      const lookalike = path.join(tmpRoot, 'ActunaMail.v0.2-archive-NOT-TIMESTAMP');
      fs.mkdirSync(lookalike);
      const result = deleteArchive(lookalike);
      expect(result.ok).toBe(false);
      expect(fs.existsSync(lookalike)).toBe(true);
    });

    it('refuses path traversal attempt (..)', () => {
      const traversal = path.join(tmpRoot, 'foo', '..', 'bar');
      const result = deleteArchive(traversal);
      expect(result.ok).toBe(false);
    });

    it('accepts well-formed archive path matching pattern', () => {
      const okPath = path.join(tmpRoot, 'ActunaMail.v0.2-archive-2026-05-15-21-30-00');
      fs.mkdirSync(okPath);
      fs.writeFileSync(path.join(okPath, 'edgehill.db'), 'fake');
      const result = deleteArchive(okPath);
      expect(result.ok).toBe(true);
      expect(fs.existsSync(okPath)).toBe(false);
    });

    it('refuses non-existent path even if pattern matches', () => {
      const ghost = path.join(tmpRoot, 'ActunaMail.v0.2-archive-2026-05-15-21-30-00');
      const result = deleteArchive(ghost);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/does not exist/i);
    });
  });

  describe('happy path', () => {
    it('removes archive contents recursively', () => {
      const archiveDir = path.join(tmpRoot, 'ActunaMail.v0.2-archive-2026-05-15-21-30-00');
      fs.mkdirSync(archiveDir);
      fs.mkdirSync(path.join(archiveDir, 'subdir'));
      fs.writeFileSync(path.join(archiveDir, 'edgehill.db'), 'fake');
      fs.writeFileSync(path.join(archiveDir, 'subdir', 'mail_rules.json'), '{}');
      const result = deleteArchive(archiveDir);
      expect(result.ok).toBe(true);
      expect(fs.existsSync(archiveDir)).toBe(false);
    });
  });
});
