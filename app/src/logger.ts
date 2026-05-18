// Mandarynka logger (ticket #04 — phases 04a-04c).
//
// Structured pino logger that replaced the legacy `emorikawa/debug#nylas`
// git fork (debug@2.6.3 — GHSA-9vvw-cc9w-f27h / GHSA-gxpj-cx7g-858c).
// Emits JSON-line output; the level comes from the ACTUNA_LOG_LEVEL env
// var (default `info`, `debug` when the app runs with the --dev flag).
//
// 04b: every logged object passes through the redaction layer.
// 04c: from a renderer process each finished line is also forwarded to the
//      main process over IPC, which is the only place lines hit disk
//      (see browser/log-channel.ts). Renderers never write the log file.
import pino from 'pino';
import { redactLogObject } from './utils/log-redaction';

// IPC channel name shared with the main-process log sink (log-channel.ts).
export const LOG_IPC_CHANNEL = 'actuna-log';

function resolveLevel(): pino.LevelWithSilent {
  const fromEnv = process.env.ACTUNA_LOG_LEVEL as pino.LevelWithSilent | undefined;
  if (fromEnv) {
    return fromEnv;
  }
  return process.argv.includes('--dev') ? 'debug' : 'info';
}

// pino destination: echo to stdout (visible in dev); from a renderer hand the
// finished JSON line to the main process over IPC; from the main process
// append it straight to the log file. Either way the renderer never writes
// the log file itself.
const destination = {
  write(line: string) {
    process.stdout.write(line);
    if (process.type === 'renderer') {
      try {
        require('electron').ipcRenderer.send(LOG_IPC_CHANNEL, line);
      } catch {
        // IPC unavailable (e.g. spec runner) — stdout already has the line.
      }
    } else {
      try {
        require('./browser/log-channel').appendLogLine(line);
      } catch {
        // log-channel unavailable (non-Electron child process) — stdout only.
      }
    }
  },
};

// Single shared root logger. `base: undefined` drops the pid/hostname fields
// pino adds by default — noise for a desktop mail client; each child logger
// carries a `name` instead. `formatters.log` runs redaction on every record.
export const logger = pino(
  {
    level: resolveLevel(),
    base: undefined,
    formatters: {
      log: redactLogObject,
    },
  },
  destination
);

// Namespaced child logger — the replacement for `createDebug('app:Foo')`.
// Verbose call sites that used a `:all` namespace should log at `trace`
// level, guarded by `log.isLevelEnabled('trace')`.
export function createLogger(name: string) {
  return logger.child({ name });
}

export default logger;
