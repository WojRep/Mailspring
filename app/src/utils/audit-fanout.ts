// Mandarynka logger — opt-in audit trail (ticket #04 phase 04e).
//
// KNF Rec. D §22 calls for an audit trail of security-relevant events.
// This is OFF by default (config `core.audit.enabled`). When the user opts
// in, each audit event is appended as one redacted, newline-delimited JSON
// line to a local file under `<configDir>/audit/`. Audit data is NEVER sent
// over the network — there is no remote fan-out.
import fs from 'fs';
import path from 'path';
import { redactLogObject } from './log-redaction';

function auditEnabled(): boolean {
  return AppEnv.config.get('core.audit.enabled') === true;
}

function auditFilePath(): string {
  const dir = path.join(AppEnv.getConfigDirPath(), 'audit');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${new Date().toISOString().slice(0, 10)}.audit.log`);
}

// Records one audit event. No-op unless the user enabled the audit trail.
// `meta` runs through the redaction layer so credentials never reach the
// audit file.
export function auditLog(event: string, meta: Record<string, unknown> = {}): void {
  if (!auditEnabled()) {
    return;
  }
  const record = {
    time: Date.now(),
    audit: event,
    ...redactLogObject(meta),
  };
  try {
    fs.appendFileSync(auditFilePath(), `${JSON.stringify(record)}\n`);
  } catch {
    // Audit logging is best-effort — never block or crash the app on it.
  }
}
