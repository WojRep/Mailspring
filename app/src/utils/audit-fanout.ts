// Mandarynka logger — opt-in audit trail (ticket #04 phase 04e; ticket #62
// made it process-aware so the main process can audit too).
//
// KNF Rekomendacja D pkt 11.10 (rejestracja zdarzeń) calls for an audit
// trail of security-relevant events. This is OFF by default (config
// `core.audit.enabled`). When the user opts in, each audit event is
// appended as one redacted, newline-delimited JSON line to a local file
// under `<configDir>/audit/`. Audit data is NEVER sent over the network —
// there is no remote fan-out.
//
// Process-awareness: `auditLog()` runs in BOTH the renderer (where
// `AppEnv` exists) and the Electron main process (where it does not — e.g.
// the SQLCipher Tier B `KeyManager` operations in ticket #46/#62). Config
// and config-dir resolution branch on `process.type`, the same pattern as
// `key-manager.ts`.
import fs from 'fs';
import path from 'path';
import { redactLogObject } from './log-redaction';

const CONFIG_WRAPPER_KEY = '*';

/** Per-user config directory, resolved for both process types. */
function getConfigDir(): string {
  if (process.type === 'browser') {
    return require('electron').app.getPath('userData');
  }
  if (typeof AppEnv !== 'undefined' && AppEnv && typeof AppEnv.getConfigDirPath === 'function') {
    return AppEnv.getConfigDirPath();
  }
  return require('@electron/remote').app.getPath('userData');
}

/**
 * Whether the opt-in audit trail is enabled. Renderer reads `AppEnv.config`;
 * the main process (no `AppEnv`) reads `config.json` directly — the file is
 * wrapped under a top-level `"*"` key.
 */
function auditEnabled(): boolean {
  if (typeof AppEnv !== 'undefined' && AppEnv && AppEnv.config) {
    return AppEnv.config.get('core.audit.enabled') === true;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(getConfigDir(), 'config.json'), 'utf-8'));
    const root = raw[CONFIG_WRAPPER_KEY] || raw;
    return !!(root && root.core && root.core.audit && root.core.audit.enabled === true);
  } catch {
    return false;
  }
}

function auditFilePath(): string {
  const dir = path.join(getConfigDir(), 'audit');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${new Date().toISOString().slice(0, 10)}.audit.log`);
}

// Retention (ticket #60). Audit files are per-day (filename = ISO date),
// so the trail rotates daily on its own. Files older than the retention
// window are pruned once per process, on the first auditLog() call.
//
// 90 days is a local default that bounds disk use. KNF Rekomendacja D
// pkt 11.10 expects an event register; the deploying organisation sets
// its own legal retention period — a bank requiring longer retention (or
// tamper-evidence) should forward the audit files to its SIEM / archival
// system. This local trail is append-only by convention, NOT
// cryptographically tamper-evident — see SECURITY.md "Audit trail".
const AUDIT_RETENTION_DAYS = 90;
const AUDIT_FILE_RE = /^\d{4}-\d{2}-\d{2}\.audit\.log$/;
let _pruned = false;

function pruneOldAuditFiles(dir: string): void {
  try {
    const cutoff = Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(dir)) {
      if (!AUDIT_FILE_RE.test(name)) {
        continue;
      }
      const full = path.join(dir, name);
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
      }
    }
  } catch {
    // Pruning is best-effort — never block or crash the app on it.
  }
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
    const file = auditFilePath();
    if (!_pruned) {
      _pruned = true;
      pruneOldAuditFiles(path.dirname(file));
    }
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  } catch {
    // Audit logging is best-effort — never block or crash the app on it.
  }
}
