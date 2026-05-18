import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { LOG_IPC_CHANNEL } from '../logger';
import { redactLogObject } from '../utils/log-redaction';

// Mandarynka logger — main-process log sink (ticket #04 phase 04c).
//
// Renderer processes forward their finished (already redacted) JSON log
// lines over the LOG_IPC_CHANNEL IPC channel. The main process is the only
// place log lines are written to disk — renderers have no direct log-file
// access. Lines are appended to a per-day file under the OS log directory
// (`app.getPath('logs')` — `~/Library/Logs/ActunaMail` on macOS, the
// platform equivalent on Windows/Linux).

let logStream: fs.WriteStream | null = null;
let installed = false;

// Resolve (and create) today's log file path. Exported for tests.
export function logFilePathForDate(date = new Date()): string {
  const dir = app.getPath('logs');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${date.toISOString().slice(0, 10)}.log`);
}

// Normalize a forwarded line so the file stays newline-delimited JSON.
export function normalizeLogLine(line: string): string {
  return line.endsWith('\n') ? line : `${line}\n`;
}

// Registers the IPC listener that persists forwarded renderer log lines.
// Idempotent — safe to call once per app launch.
export function installLogChannel(): void {
  if (installed) {
    return;
  }
  installed = true;

  try {
    logStream = fs.createWriteStream(logFilePathForDate(), { flags: 'a' });
  } catch {
    // Disk unavailable — degrade gracefully, the renderer still has stdout.
    logStream = null;
  }

  ipcMain.on(LOG_IPC_CHANNEL, (_event, line: unknown) => {
    if (logStream && typeof line === 'string') {
      logStream.write(normalizeLogLine(line));
    }
  });
}

// Append a finished JSON log line to the log file. Used by the main-process
// logger (ticket #61) — renderers reach the file over IPC instead.
export function appendLogLine(line: string): void {
  if (logStream && typeof line === 'string') {
    logStream.write(normalizeLogLine(line));
  }
}

// Write one main-process record straight to the log file. Synchronous so the
// shutdown record survives process exit. pino-compatible schema; meta is
// redacted like every other record.
function writeMainRecord(level: number, msg: string, meta: Record<string, unknown> = {}): void {
  try {
    const record = { level, time: Date.now(), name: 'main', msg, ...redactLogObject(meta) };
    fs.appendFileSync(logFilePathForDate(), `${JSON.stringify(record)}\n`);
  } catch {
    // Best-effort — never block startup/shutdown on a log write.
  }
}

// Startup heartbeat — ticket #04, gives a verifiable JSON line every launch.
export function logAppStarted(version: string): void {
  writeMainRecord(30, 'ActunaMail started', { version });
}

// Shutdown heartbeat — written synchronously from the before-quit handler.
export function logAppStopping(): void {
  writeMainRecord(30, 'ActunaMail shutting down');
}
