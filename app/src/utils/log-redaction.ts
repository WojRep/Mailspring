// Mandarynka logger redaction layer (ticket #04 — phase 04b).
//
// Strips secrets (passwords, OAuth tokens, DB keys, …) from objects before
// they reach the pino log output, so production logs never carry credentials.
//
// A function rather than pino's native `redact` option: later 04b criteria
// (JWT value-regex redaction) need to inspect values, which pino's key-path
// redact cannot do. This recursive walker covers both.

const REDACTED = '[REDACTED]';

// Keys whose value is always a secret — redacted at any nesting depth.
// Matched case-insensitively. Mirrors ticket #04 04b.
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

// JWT-shaped tokens (`eyJ…` base64url) are secrets wherever they appear, so
// they are redacted by value even under a key that is not on the denylist.
const JWT_VALUE = /eyJ[A-Za-z0-9_-]{20,}/;

// A value that is *entirely* a long (>40-char) base64 blob is very likely an
// encoded secret (key material, encoded token) — redacted by value.
const BASE64_VALUE = /^[A-Za-z0-9+/]{41,}={0,2}$/;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = DENYLIST_KEYS.has(key.toLowerCase()) ? REDACTED : redactValue(val);
    }
    return out;
  }
  if (typeof value === 'string' && (JWT_VALUE.test(value) || BASE64_VALUE.test(value))) {
    return REDACTED;
  }
  return value;
}

// Returns a redacted deep copy of `input` — any denylisted key (at any depth)
// has its value replaced with `[REDACTED]`.
export function redactLogObject(input: Record<string, unknown>): Record<string, unknown> {
  return redactValue(input) as Record<string, unknown>;
}
