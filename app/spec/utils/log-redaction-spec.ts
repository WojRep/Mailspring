import { createHash } from 'crypto';
import { redactLogObject } from '../../src/utils/log-redaction';

// Ticket #04 phase 04b — Mandarynka logger redaction layer.
// Ticket #60 — the debug bypass is gated on a DEV build, not the env var
// alone: a packaged production build always redacts even with
// `ACTUNA_LOG_LEVEL=debug` set. Tests that depend on the mode set and
// restore both `ACTUNA_LOG_LEVEL` and `process.defaultApp` explicitly.
describe('log-redaction', () => {
  describe('redactLogObject — denylisted keys', () => {
    it('redacts a `password` value', () => {
      expect(redactLogObject({ password: 'hunter2' }).password).toEqual('[REDACTED]');
    });

    it('redacts a `secret` value', () => {
      expect(redactLogObject({ secret: 's3cr3t' }).secret).toEqual('[REDACTED]');
    });

    it('redacts an `access_token` value', () => {
      expect(redactLogObject({ access_token: 'abc123' }).access_token).toEqual('[REDACTED]');
    });

    it('redacts a `refresh_token` value', () => {
      expect(redactLogObject({ refresh_token: 'rt-xyz' }).refresh_token).toEqual('[REDACTED]');
    });

    it('redacts a `client_secret` value', () => {
      expect(redactLogObject({ client_secret: 'cs-1' }).client_secret).toEqual('[REDACTED]');
    });

    it('redacts a `master_password` value', () => {
      expect(redactLogObject({ master_password: 'mp' }).master_password).toEqual('[REDACTED]');
    });

    it('redacts an `argon2_hash` value', () => {
      expect(redactLogObject({ argon2_hash: '$argon2id$...' }).argon2_hash).toEqual('[REDACTED]');
    });

    it('redacts an `authorization` value', () => {
      expect(redactLogObject({ authorization: 'Bearer x' }).authorization).toEqual('[REDACTED]');
    });

    it('redacts a hyphenated `set-cookie` key', () => {
      expect(redactLogObject({ 'set-cookie': 'sid=1' })['set-cookie']).toEqual('[REDACTED]');
    });

    it('matches denylisted keys case-insensitively', () => {
      expect(redactLogObject({ Password: 'hunter2' }).Password).toEqual('[REDACTED]');
    });

    it('redacts a denylisted key nested inside a child object', () => {
      const result = redactLogObject({ meta: { token: 'deep' } });
      expect((result.meta as { token: string }).token).toEqual('[REDACTED]');
    });
  });

  describe('redactLogObject — value-pattern redaction', () => {
    it('redacts a JWT-shaped value even under a non-denylisted key', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdEFGH';
      expect(redactLogObject({ note: jwt }).note).toEqual('[REDACTED]');
    });

    it('redacts a >40-char base64 secret under a non-denylisted key', () => {
      const blob = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5'; // 48-char base64
      expect(redactLogObject({ blob }).blob).toEqual('[REDACTED]');
    });

    it('leaves a short, non-secret string untouched', () => {
      expect(redactLogObject({ msg: 'hello world' }).msg).toEqual('hello world');
    });
  });

  describe('redactLogObject — allowlisted keys', () => {
    it('passes `account_id` through verbatim', () => {
      expect(redactLogObject({ account_id: '81880a6c' }).account_id).toEqual('81880a6c');
    });

    it('passes `thread_id` through verbatim even if it looks base64', () => {
      const tid = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5';
      expect(redactLogObject({ thread_id: tid }).thread_id).toEqual(tid);
    });

    it('passes `message_id` through verbatim', () => {
      expect(redactLogObject({ message_id: 'mid-42' }).message_id).toEqual('mid-42');
    });

    it('hashes `email` to an 8-char sha256 prefix in production', () => {
      const email = 'user@example.com';
      const expected = createHash('sha256').update(email).digest('hex').slice(0, 8);
      expect(redactLogObject({ email }).email).toEqual(expected);
    });
  });

  describe('redactLogObject — dev-build debug bypass (ticket #60)', () => {
    let prevLevel: string | undefined;
    let prevDefaultApp: any;

    beforeEach(() => {
      prevLevel = process.env.ACTUNA_LOG_LEVEL;
      prevDefaultApp = (process as any).defaultApp;
    });

    afterEach(() => {
      if (prevLevel === undefined) {
        delete process.env.ACTUNA_LOG_LEVEL;
      } else {
        process.env.ACTUNA_LOG_LEVEL = prevLevel;
      }
      (process as any).defaultApp = prevDefaultApp;
    });

    it('leaves secrets untouched in a DEV build with debug logging', () => {
      process.env.ACTUNA_LOG_LEVEL = 'debug';
      (process as any).defaultApp = true;
      expect(redactLogObject({ password: 'hunter2' }).password).toEqual('hunter2');
    });

    it('leaves `email` un-hashed in a DEV build with debug logging', () => {
      process.env.ACTUNA_LOG_LEVEL = 'debug';
      (process as any).defaultApp = true;
      expect(redactLogObject({ email: 'user@example.com' }).email).toEqual('user@example.com');
    });

    it('STILL redacts in a packaged build even with ACTUNA_LOG_LEVEL=debug', () => {
      // process.defaultApp is absent in a packaged production build.
      process.env.ACTUNA_LOG_LEVEL = 'debug';
      (process as any).defaultApp = undefined;
      expect(redactLogObject({ password: 'hunter2' }).password).toEqual('[REDACTED]');
    });

    it('STILL hashes `email` in a packaged build even with debug logging', () => {
      process.env.ACTUNA_LOG_LEVEL = 'debug';
      (process as any).defaultApp = undefined;
      expect(redactLogObject({ email: 'user@example.com' }).email).not.toEqual('user@example.com');
    });
  });
});
