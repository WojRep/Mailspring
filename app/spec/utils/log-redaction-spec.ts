import { redactLogObject } from '../../src/utils/log-redaction';

// Ticket #04 phase 04b — Mandarynka logger redaction layer.
describe('log-redaction', () => {
  describe('redactLogObject — denylisted keys', () => {
    it('redacts a `password` value to [REDACTED]', () => {
      expect(redactLogObject({ password: 'hunter2' }).password).toEqual('[REDACTED]');
    });
  });

  describe('redactLogObject — JWT values', () => {
    it('redacts a JWT-shaped value even under a non-denylisted key', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdEFGH';
      expect(redactLogObject({ note: jwt }).note).toEqual('[REDACTED]');
    });
  });

  describe('redactLogObject — long base64 values', () => {
    it('redacts a >40-char base64 secret under a non-denylisted key', () => {
      const blob = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5'; // 48-char base64
      expect(redactLogObject({ blob }).blob).toEqual('[REDACTED]');
    });
  });
});
