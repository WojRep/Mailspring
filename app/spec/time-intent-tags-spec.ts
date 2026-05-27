/**
 * Bilet MVP #96 — Time-Intent Tags unit tests.
 */

import {
  TimeIntentStore,
  SYSTEM_TAGS,
  TAG_TODAY,
  TAG_UPCOMING,
  TAG_ANYTIME,
} from '../internal_packages/time-intent-tags/lib/time-intent-store';

describe('Time-Intent Tags — bilet MVP #96', () => {

  beforeEach(() => {
    TimeIntentStore._reset();
  });

  describe('system tags', () => {
    it('SYSTEM_TAGS mapuje intent na tag string', () => {
      expect(SYSTEM_TAGS.today).toBe(TAG_TODAY);
      expect(SYSTEM_TAGS.upcoming).toBe(TAG_UPCOMING);
      expect(SYSTEM_TAGS.anytime).toBe(TAG_ANYTIME);
    });

    it('tagi prefiksowane __system_', () => {
      expect(TAG_TODAY).toMatch(/^__system_/);
      expect(TAG_UPCOMING).toMatch(/^__system_/);
      expect(TAG_ANYTIME).toMatch(/^__system_/);
    });
  });

  describe('get/set/clear', () => {
    it('get returns undefined for unassigned thread', () => {
      expect(TimeIntentStore.get('t1')).toBeUndefined();
    });

    it('set assigns intent', () => {
      TimeIntentStore.set('t1', 'today');
      expect(TimeIntentStore.get('t1')).toBe('today');
    });

    it('set is exclusive (overrides previous)', () => {
      TimeIntentStore.set('t1', 'today');
      TimeIntentStore.set('t1', 'upcoming');
      expect(TimeIntentStore.get('t1')).toBe('upcoming');
    });

    it('set is idempotent', () => {
      let count = 0;
      const unsub = TimeIntentStore.listen(() => count++);
      TimeIntentStore.set('t1', 'today');
      TimeIntentStore.set('t1', 'today');
      TimeIntentStore.set('t1', 'today');
      expect(count).toBe(1);
      unsub();
    });

    it('clear removes assignment', () => {
      TimeIntentStore.set('t1', 'anytime');
      expect(TimeIntentStore.clear('t1')).toBe(true);
      expect(TimeIntentStore.get('t1')).toBeUndefined();
    });

    it('clear of unassigned returns false', () => {
      expect(TimeIntentStore.clear('nonexistent')).toBe(false);
    });

    it('set ignores empty threadId', () => {
      TimeIntentStore.set('', 'today');
      expect(TimeIntentStore.stats().today).toBe(0);
    });
  });

  describe('list/stats', () => {
    it('list returns threads with given intent', () => {
      TimeIntentStore.set('a', 'today');
      TimeIntentStore.set('b', 'today');
      TimeIntentStore.set('c', 'upcoming');
      expect(TimeIntentStore.list('today').sort()).toEqual(['a', 'b']);
      expect(TimeIntentStore.list('upcoming')).toEqual(['c']);
      expect(TimeIntentStore.list('anytime')).toEqual([]);
    });

    it('stats counts per intent', () => {
      TimeIntentStore.set('a', 'today');
      TimeIntentStore.set('b', 'today');
      TimeIntentStore.set('c', 'upcoming');
      TimeIntentStore.set('d', 'anytime');
      TimeIntentStore.set('e', 'anytime');
      TimeIntentStore.set('f', 'anytime');
      const s = TimeIntentStore.stats();
      expect(s.today).toBe(2);
      expect(s.upcoming).toBe(1);
      expect(s.anytime).toBe(3);
    });
  });

  describe('rollover (midnight auto Today → Anytime)', () => {
    it('rolloverNow moves all Today → Anytime', () => {
      TimeIntentStore.set('a', 'today');
      TimeIntentStore.set('b', 'today');
      TimeIntentStore.set('c', 'upcoming');
      const count = TimeIntentStore.rolloverNow();
      expect(count).toBe(2);
      expect(TimeIntentStore.get('a')).toBe('anytime');
      expect(TimeIntentStore.get('b')).toBe('anytime');
      expect(TimeIntentStore.get('c')).toBe('upcoming'); // unchanged
    });

    it('rolloverNow updates lastRollover timestamp', () => {
      const before = TimeIntentStore.getLastRollover();
      TimeIntentStore.rolloverNow();
      expect(TimeIntentStore.getLastRollover()).toBeGreaterThan(before);
    });

    it('rolloverNow with no Today items returns 0', () => {
      TimeIntentStore.set('a', 'upcoming');
      expect(TimeIntentStore.rolloverNow()).toBe(0);
    });
  });

  describe('persistence', () => {
    it('persists assignments to localStorage', () => {
      TimeIntentStore.set('persist1', 'today');
      const raw = localStorage.getItem('actuna.time-intent-tags');
      expect(raw).toContain('persist1');
      expect(raw).toContain('today');
    });

    it('persists lastRollover timestamp', () => {
      TimeIntentStore.rolloverNow();
      const raw = localStorage.getItem('actuna.time-intent-tags.last-rollover');
      expect(raw).toBeTruthy();
      expect(parseInt(raw!, 10)).toBeGreaterThan(0);
    });
  });

  describe('listen', () => {
    it('notifies on set + clear', () => {
      let count = 0;
      const unsub = TimeIntentStore.listen(() => count++);
      TimeIntentStore.set('a', 'today');
      TimeIntentStore.clear('a');
      expect(count).toBe(2);
      unsub();
    });

    it('notifies on rolloverNow when changes occur', () => {
      TimeIntentStore.set('a', 'today');
      let count = 0;
      const unsub = TimeIntentStore.listen(() => count++);
      TimeIntentStore.rolloverNow();
      expect(count).toBe(1);
      unsub();
    });
  });
});
