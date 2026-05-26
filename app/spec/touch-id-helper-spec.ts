import { canUseTouchID, promptTouchID } from '../src/touch-id-helper';

/**
 * Ticket #41 — Touch ID helper unit spec.
 *
 * Bezpieczne testowanie bez signed build: canUseTouchID() musi
 * gracefully return false na non-darwin platformach, a promptTouchID()
 * musi rzucić jasny błąd zamiast crashować.
 */

describe('touch-id-helper (ticket #41)', () => {
  describe('canUseTouchID', () => {
    it('returns false na non-darwin platform', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        expect(canUseTouchID()).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('returns false na win32', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        expect(canUseTouchID()).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('na darwin nie crashuje (return wartość zależy od hardware)', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      try {
        const result = canUseTouchID();
        expect(typeof result).toBe('boolean');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });

  describe('promptTouchID', () => {
    it('rzuca jasny błąd na non-darwin', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      try {
        let caught: Error | null = null;
        try {
          await promptTouchID('unlock test');
        } catch (err) {
          caught = err as Error;
        }
        expect(caught).not.toBeNull();
        expect(caught!.message).toMatch(/macOS/i);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });
});
