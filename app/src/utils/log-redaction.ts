// Mandarynka logger redaction layer (ticket #04 — phase 04b).
//
// Strips secrets (passwords, OAuth tokens, DB keys, …) from objects before
// they reach the pino log output, so production logs never carry credentials.
//
// Redaction is active in production only. When a DEV build runs with
// debug-level logging (`ACTUNA_LOG_LEVEL=debug`) the input is returned
// untouched, so developers can inspect full tokens while debugging.
//
// Ticket #60 — the bypass is gated on the build being a non-packaged DEV
// build, NOT merely on the env var: a packaged production build started
// with `ACTUNA_LOG_LEVEL=debug` in its environment must STILL redact, so
// the env var alone can never expose credentials in a shipped build.
//
// A function rather than pino's native `redact` option: JWT / base64 value
// redaction needs to inspect values, which pino's key-path redact cannot do.
import { createHash } from 'crypto';

const REDACTED = '[REDACTED]';

// Keys whose value is always a secret — redacted at any nesting depth.
// Matched case-insensitively.
const DENYLIST_KEYS = new Set<string>([
  'password',
  'pw',
  'secret',
  'token',
  'refresh_token',
  'access_token',
  'client_secret',
  'cookie',
  'set-cookie',
  'authorization',
  'mailspring_db_key',
  'master_password',
  'recovery_code',
  'argon2_salt',
  'argon2_hash',
]);

// Keys that are safe to log verbatim — their values are never treated as
// secrets even if the value happens to look like a token (e.g. a base64-ish
// thread id). `email` is allowlisted but hashed (see redactValue).
const ALLOWLIST_KEYS = new Set<string>(['account_id', 'thread_id', 'message_id']);

// JWT-shaped tokens (`eyJ…` base64url) are secrets wherever they appear, so
// they are redacted by value even under a key that is not on the denylist.
const JWT_VALUE = /eyJ[A-Za-z0-9_-]{20,}/;

// A value that is *entirely* a long (>40-char) base64 blob is very likely an
// encoded secret (key material, encoded token) — redacted by value.
const BASE64_VALUE = /^[A-Za-z0-9+/]{41,}={0,2}$/;

// True only for a non-packaged DEV build. Electron sets `process.defaultApp`
// when the app is started unpackaged (`electron .` / `npm start` / --dev);
// a packaged production build never has it. The agent process (a plain
// `child_process` fork) also lacks it — treated as non-dev, i.e. redaction
// always on, which is the safe default.
function isDevBuild(): boolean {
  return (process as any).defaultApp === true;
}

// Redaction is disabled ONLY in a dev build running with debug logging.
// A packaged production build always redacts, even if the environment
// carries `ACTUNA_LOG_LEVEL=debug` — the env var alone cannot expose
// credentials in a shipped build (#60).
function isRedactionEnabled(): boolean {
  if (process.env.ACTUNA_LOG_LEVEL === 'debug' && isDevBuild()) {
    return false;
  }
  return true;
}

// Email is identifying but useful for support — keep a stable 8-char hash
// rather than the full address.
function hashEmail(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (DENYLIST_KEYS.has(lowerKey)) {
        out[key] = REDACTED;
      } else if (lowerKey === 'email') {
        out[key] = hashEmail(val);
      } else if (ALLOWLIST_KEYS.has(lowerKey)) {
        out[key] = val;
      } else {
        out[key] = redactValue(val);
      }
    }
    return out;
  }
  if (typeof value === 'string' && (JWT_VALUE.test(value) || BASE64_VALUE.test(value))) {
    return REDACTED;
  }
  return value;
}

// Returns a redacted deep copy of `input` — denylisted keys, JWT/base64 values
// and the `email` address are masked. In debug mode `input` is returned as-is.
export function redactLogObject(input: Record<string, unknown>): Record<string, unknown> {
  if (!isRedactionEnabled()) {
    return input;
  }
  return redactValue(input) as Record<string, unknown>;
}
