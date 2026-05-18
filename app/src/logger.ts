// Mandarynka logger (ticket #04 — phase 04a).
//
// Structured pino logger that replaces the legacy `emorikawa/debug#nylas`
// git fork (debug@2.6.3 — GHSA-9vvw-cc9w-f27h / GHSA-gxpj-cx7g-858c).
// Emits JSON-line output; the level comes from the ACTUNA_LOG_LEVEL env
// var (default `info`, `debug` when the app runs with the --dev flag).
//
// Later phases build on this baseline: 04b adds a redaction layer and
// 04c routes renderer logs to the main process over IPC.
import pino from 'pino';

function resolveLevel(): pino.LevelWithSilent {
  const fromEnv = process.env.ACTUNA_LOG_LEVEL as pino.LevelWithSilent | undefined;
  if (fromEnv) {
    return fromEnv;
  }
  return process.argv.includes('--dev') ? 'debug' : 'info';
}

// Single shared root logger. `base: undefined` drops the pid/hostname
// fields pino adds by default — noise for a desktop mail client; each
// child logger carries a `name` instead.
export const logger = pino({
  level: resolveLevel(),
  base: undefined,
});

// Namespaced child logger — the replacement for `createDebug('app:Foo')`.
// Verbose call sites that used a `:all` namespace should log at `trace`
// level, guarded by `log.isLevelEnabled('trace')`.
export function createLogger(name: string) {
  return logger.child({ name });
}

export default logger;
