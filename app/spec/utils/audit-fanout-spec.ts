import fs from 'fs';
import os from 'os';
import path from 'path';
import { auditLog } from '../../src/utils/audit-fanout';

// Ticket #62 — opt-in audit trail (`audit-fanout.ts`), made process-aware
// so the main process can audit Tier B operations too.
//
// These specs run in the renderer test env (`AppEnv` present), exercising
// the `AppEnv.config` branch of `auditEnabled()`. The audit file is written
// into a real tmpdir.

describe('audit-fanout — auditLog (ticket #62)', () => {
  let dir: string;
  let enabled: boolean;

  const auditDir = () => path.join(dir, 'audit');
  const readAuditLines = (): any[] => {
    const files = fs.existsSync(auditDir()) ? fs.readdirSync(auditDir()) : [];
    const lines: any[] = [];
    for (const f of files) {
      const text = fs.readFileSync(path.join(auditDir(), f), 'utf-8').trim();
      if (text) {
        text.split('\n').forEach((l) => lines.push(JSON.parse(l)));
      }
    }
    return lines;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-audit-'));
    enabled = true;
    spyOn(AppEnv, 'getConfigDirPath').andCallFake(() => dir);
    spyOn(AppEnv.config, 'get').andCallFake((key: string) =>
      key === 'core.audit.enabled' ? enabled : undefined
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      /* best effort */
    }
  });

  it('is a no-op when the audit trail is disabled', () => {
    enabled = false;
    auditLog('test-event', { foo: 'bar' });
    expect(fs.existsSync(auditDir())).toBe(false);
  });

  it('appends a JSON record with `audit` and `time` when enabled', () => {
    auditLog('tier-b-enabled', {});
    const lines = readAuditLines();
    expect(lines.length).toBe(1);
    expect(lines[0].audit).toBe('tier-b-enabled');
    expect(typeof lines[0].time).toBe('number');
  });

  it('appends one newline-delimited record per call', () => {
    auditLog('event-a', {});
    auditLog('event-b', {});
    const lines = readAuditLines();
    expect(lines.map((l) => l.audit)).toEqual(['event-a', 'event-b']);
  });

  it('redacts secret keys in the event meta', () => {
    auditLog('tier-b-enabled', { password: 'hunter2', method: 'master-password' });
    const lines = readAuditLines();
    expect(lines[0].password).toBe('[REDACTED]');
    expect(lines[0].method).toBe('master-password');
  });
});
