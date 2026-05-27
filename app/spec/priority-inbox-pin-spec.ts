/**
 * Bilet MVP #93 — Priority Inbox + Pin unit tests.
 */

import { PinStore } from '../internal_packages/priority-inbox-pin/lib/pin-store';
import {
  classifyThread,
  bucketThreads,
  REGULAR_CONTACT_THRESHOLD,
  TAG_PRIORITY_OVERRIDE,
  TAG_OTHER_OVERRIDE,
  TAG_IMPORTANT,
  TAG_VIP,
} from '../internal_packages/priority-inbox-pin/lib/priority-classifier';

describe('Priority Inbox + Pin — bilet MVP #93', () => {

  beforeEach(() => {
    PinStore._reset();
  });

  describe('PinStore', () => {
    it('isPinned returns false for unknown thread', () => {
      expect(PinStore.isPinned('t1')).toBe(false);
    });

    it('pin adds thread to pinned set', () => {
      PinStore.pin('t1');
      expect(PinStore.isPinned('t1')).toBe(true);
      expect(PinStore.count()).toBe(1);
    });

    it('pin is idempotent', () => {
      PinStore.pin('t1');
      PinStore.pin('t1');
      PinStore.pin('t1');
      expect(PinStore.count()).toBe(1);
    });

    it('unpin removes thread', () => {
      PinStore.pin('t1');
      PinStore.unpin('t1');
      expect(PinStore.isPinned('t1')).toBe(false);
      expect(PinStore.count()).toBe(0);
    });

    it('unpin of non-pinned is no-op', () => {
      PinStore.unpin('nonexistent');
      expect(PinStore.count()).toBe(0);
    });

    it('toggle pins then unpins', () => {
      expect(PinStore.toggle('t1')).toBe(true); // pin
      expect(PinStore.isPinned('t1')).toBe(true);
      expect(PinStore.toggle('t1')).toBe(false); // unpin
      expect(PinStore.isPinned('t1')).toBe(false);
    });

    it('list returns sorted by pinnedAt desc', (done) => {
      PinStore.pin('t1');
      setTimeout(() => {
        PinStore.pin('t2');
        setTimeout(() => {
          PinStore.pin('t3');
          const list = PinStore.list();
          expect(list.length).toBe(3);
          expect(list[0].threadId).toBe('t3'); // najnowsze pierwsze
          expect(list[2].threadId).toBe('t1');
          done();
        }, 5);
      }, 5);
    });

    it('listen notifies on changes', () => {
      let count = 0;
      const unsub = PinStore.listen(() => count++);
      PinStore.pin('t1');
      PinStore.unpin('t1');
      expect(count).toBe(2);
      unsub();
    });

    it('persists to localStorage', () => {
      PinStore.pin('persisted-thread');
      const raw = localStorage.getItem('actuna.pinned-threads');
      expect(raw).toBeTruthy();
      expect(raw).toContain('persisted-thread');
    });

    it('ignores empty threadId', () => {
      PinStore.pin('');
      expect(PinStore.count()).toBe(0);
    });
  });

  describe('priority classifier', () => {
    it('returns other for empty thread', () => {
      expect(classifyThread({ id: 't1' })).toBe('other');
    });

    it('returns priority when pinned', () => {
      PinStore.pin('t1');
      expect(classifyThread({ id: 't1' })).toBe('priority');
    });

    it('returns priority for VIP tag', () => {
      expect(classifyThread({ id: 't1', tags: [TAG_VIP] })).toBe('priority');
    });

    it('returns priority for Important tag', () => {
      expect(classifyThread({ id: 't1', tags: [TAG_IMPORTANT] })).toBe('priority');
    });

    it('returns priority for manual __system_priority override', () => {
      expect(classifyThread({ id: 't1', tags: [TAG_PRIORITY_OVERRIDE] })).toBe('priority');
    });

    it('returns other for __system_other override (overrides pin)', () => {
      PinStore.pin('t1');
      expect(classifyThread({ id: 't1', tags: [TAG_OTHER_OVERRIDE] })).toBe('other');
    });

    it('returns priority for regular correspondent + replied', () => {
      expect(classifyThread({
        id: 't1',
        hasReplied: true,
        contactExchangeCount: REGULAR_CONTACT_THRESHOLD + 1,
      })).toBe('priority');
    });

    it('returns other when reply but exchange count below threshold', () => {
      expect(classifyThread({
        id: 't1',
        hasReplied: true,
        contactExchangeCount: REGULAR_CONTACT_THRESHOLD - 1,
      })).toBe('other');
    });

    it('returns other when no reply (even with high exchange count)', () => {
      expect(classifyThread({
        id: 't1',
        hasReplied: false,
        contactExchangeCount: 100,
      })).toBe('other');
    });

    it('returns other for empty/null thread', () => {
      expect(classifyThread(null as any)).toBe('other');
      expect(classifyThread({ id: '' } as any)).toBe('other');
    });
  });

  describe('bucketThreads', () => {
    it('splits threads into priority and other', () => {
      PinStore.pin('p1');
      const threads = [
        { id: 'p1' }, // pinned → priority
        { id: 'p2', tags: [TAG_VIP] }, // VIP → priority
        { id: 'o1' }, // empty → other
        { id: 'o2', hasReplied: true, contactExchangeCount: 2 }, // below threshold
      ];
      const result = bucketThreads(threads);
      expect(result.priority.length).toBe(2);
      expect(result.other.length).toBe(2);
      expect(result.priority.map(t => t.id).sort()).toEqual(['p1', 'p2']);
    });

    it('handles empty input', () => {
      const result = bucketThreads([]);
      expect(result.priority).toEqual([]);
      expect(result.other).toEqual([]);
    });
  });
});
