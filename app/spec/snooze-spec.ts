/**
 * Bilet MVP #104 — Snooze unit tests.
 *
 * Pokrycie:
 *  - resolvePreset z deterministic Date input (8 cases: later_today day + late, tomorrow morning/evening, weekend, next week, next month, someday).
 *  - SnoozeStore snoozeByPreset / snoozeUntil / modify / unsnooze.
 *  - tickWake aware threads o czasie.
 *  - listForAccount filtering.
 *  - nextWakeAt + countLocalOnly.
 *  - ariaLabel PL/EN (WCAG 4.1.3).
 *  - localStorage persistence.
 *  - Listen.
 */

import {
  resolvePreset,
  PRESET_LABELS_PL,
  PRESET_LABELS_EN,
} from '../internal_packages/snooze/lib/snooze-presets';
import { SnoozeStore } from '../internal_packages/snooze/lib/snooze-store';

describe('Snooze — bilet MVP #104', () => {

  beforeEach(() => {
    SnoozeStore._reset();
    SnoozeStore.init();
  });

  // === resolvePreset ===

  describe('resolvePreset', () => {
    // Anchor: Wednesday 2026-05-27, 14:30 lokalnego czasu
    const baseWed = new Date(2026, 4, 27, 14, 30, 0, 0);

    it('later_today: +3h gdy w bezpiecznym oknie', () => {
      const t = resolvePreset('later_today', baseWed);
      const dt = new Date(t);
      // 14:30 + 3h = 17:30 (przed cap 22:00) — OK
      expect(dt.getHours()).toBe(17);
      expect(dt.getMinutes()).toBe(30);
    });

    it('later_today: fallback do tomorrow morning gdy po 22:00', () => {
      const late = new Date(2026, 4, 27, 22, 30);
      const t = resolvePreset('later_today', late);
      const dt = new Date(t);
      expect(dt.getDate()).toBe(28);
      expect(dt.getHours()).toBe(9);
    });

    it('tomorrow_morning: jutro 09:00', () => {
      const t = resolvePreset('tomorrow_morning', baseWed);
      const dt = new Date(t);
      expect(dt.getDate()).toBe(28);
      expect(dt.getHours()).toBe(9);
      expect(dt.getMinutes()).toBe(0);
    });

    it('tomorrow_evening: jutro 18:00', () => {
      const t = resolvePreset('tomorrow_evening', baseWed);
      const dt = new Date(t);
      expect(dt.getDate()).toBe(28);
      expect(dt.getHours()).toBe(18);
    });

    it('this_weekend: najbliższa sobota 09:00', () => {
      // Środa 2026-05-27 — najbliższa sobota to 2026-05-30
      const t = resolvePreset('this_weekend', baseWed);
      const dt = new Date(t);
      expect(dt.getDay()).toBe(6); // Saturday
      expect(dt.getDate()).toBe(30);
      expect(dt.getHours()).toBe(9);
    });

    it('next_week: najbliższy poniedziałek 09:00', () => {
      // Środa → najbliższy poniedziałek to 2026-06-01
      const t = resolvePreset('next_week', baseWed);
      const dt = new Date(t);
      expect(dt.getDay()).toBe(1); // Monday
      expect(dt.getHours()).toBe(9);
    });

    it('next_month: pierwszy poniedziałek następnego miesiąca 09:00', () => {
      // Maj 2026 → Czerwiec 2026, 1 czerwca = poniedziałek (sprawdzam: 2026-06-01 is Mon)
      const t = resolvePreset('next_month', baseWed);
      const dt = new Date(t);
      expect(dt.getMonth()).toBe(5); // June
      expect(dt.getDay()).toBe(1);
      expect(dt.getHours()).toBe(9);
    });

    it('someday: +30 dni 09:00', () => {
      const t = resolvePreset('someday', baseWed);
      const dt = new Date(t);
      // 2026-05-27 + 30d = 2026-06-26
      expect(dt.getMonth()).toBe(5);
      expect(dt.getDate()).toBe(26);
      expect(dt.getHours()).toBe(9);
    });

    it('labels PL i EN dostępne dla każdego preset', () => {
      const presets: Array<keyof typeof PRESET_LABELS_PL> = [
        'later_today', 'tomorrow_morning', 'tomorrow_evening',
        'this_weekend', 'next_week', 'next_month', 'someday',
      ];
      for (const p of presets) {
        expect(PRESET_LABELS_PL[p]).toBeTruthy();
        expect(PRESET_LABELS_EN[p]).toBeTruthy();
      }
    });
  });

  // === SnoozeStore CRUD ===

  describe('snoozeByPreset / snoozeUntil', () => {
    it('snoozeByPreset tworzy entry z preset name', () => {
      const e = SnoozeStore.snoozeByPreset('t1', 'tomorrow_morning');
      expect(e.threadId).toBe('t1');
      expect(e.preset).toBe('tomorrow_morning');
      expect(e.wakeAt).toBeGreaterThan(Date.now());
      expect(e.serverSupport).toBe('local_only');
    });

    it('snoozeByPreset z opts: originalFolder + accountId + serverSupport', () => {
      const e = SnoozeStore.snoozeByPreset('t1', 'tomorrow_evening', {
        originalFolder: 'INBOX',
        accountId: 'acc-work',
        serverSupport: 'gmail',
      });
      expect(e.originalFolder).toBe('INBOX');
      expect(e.accountId).toBe('acc-work');
      expect(e.serverSupport).toBe('gmail');
    });

    it('snoozeUntil custom wakeAt', () => {
      const future = Date.now() + 86400000;
      const e = SnoozeStore.snoozeUntil('t1', future);
      expect(e.wakeAt).toBe(future);
      expect(e.preset).toBeUndefined();
    });

    it('snoozeUntil w przeszłości throws', () => {
      // Jasmine 1.x toThrow expects string match — sprawdzamy message ręcznie.
      let err: any;
      try { SnoozeStore.snoozeUntil('t1', Date.now() - 1000); } catch (e) { err = e; }
      expect(err && err.message).toMatch(/future/);
    });

    it('snooze threadId required', () => {
      let err: any;
      try { SnoozeStore.snoozeUntil('', Date.now() + 100000); } catch (e) { err = e; }
      expect(err && err.message).toMatch(/threadId/);
    });

    it('snooze drugi raz tego samego threadId nadpisuje', () => {
      SnoozeStore.snoozeByPreset('t1', 'tomorrow_morning');
      SnoozeStore.snoozeByPreset('t1', 'next_week');
      expect(SnoozeStore.get('t1')?.preset).toBe('next_week');
      expect(SnoozeStore.count()).toBe(1);
    });
  });

  describe('unsnooze / modify', () => {
    it('unsnooze usuwa entry', () => {
      SnoozeStore.snoozeByPreset('t1', 'tomorrow_morning');
      const removed = SnoozeStore.unsnooze('t1');
      expect(removed?.threadId).toBe('t1');
      expect(SnoozeStore.isSnoozed('t1')).toBe(false);
    });

    it('unsnooze nieistniejącego → undefined', () => {
      expect(SnoozeStore.unsnooze('t_nope')).toBeUndefined();
    });

    it('modify zmienia wakeAt + zeruje preset (custom override)', () => {
      SnoozeStore.snoozeByPreset('t1', 'tomorrow_morning');
      const newWake = Date.now() + 7 * 86400000;
      const upd = SnoozeStore.modify('t1', newWake);
      expect(upd?.wakeAt).toBe(newWake);
      expect(upd?.preset).toBeUndefined();
    });

    it('modify w przeszłości throws', () => {
      SnoozeStore.snoozeByPreset('t1', 'tomorrow_morning');
      let err: any;
      try { SnoozeStore.modify('t1', Date.now() - 1000); } catch (e) { err = e; }
      expect(err && err.message).toMatch(/future/);
    });

    it('modify nieistniejącego → undefined', () => {
      expect(SnoozeStore.modify('t_nope', Date.now() + 100000)).toBeUndefined();
    });
  });

  // === Query ===

  describe('list / listForAccount / nextWakeAt / countLocalOnly', () => {
    it('list sortuje po wakeAt ascending', () => {
      const now = Date.now();
      SnoozeStore.snoozeUntil('a', now + 3 * 3600 * 1000);
      SnoozeStore.snoozeUntil('b', now + 1 * 3600 * 1000);
      SnoozeStore.snoozeUntil('c', now + 2 * 3600 * 1000);
      const ids = SnoozeStore.list().map(e => e.threadId);
      expect(ids).toEqual(['b', 'c', 'a']);
    });

    it('listForAccount filtruje', () => {
      SnoozeStore.snoozeUntil('a', Date.now() + 100000, { accountId: 'x' });
      SnoozeStore.snoozeUntil('b', Date.now() + 100000, { accountId: 'y' });
      expect(SnoozeStore.listForAccount('x').map(e => e.threadId)).toEqual(['a']);
      expect(SnoozeStore.listForAccount('z')).toEqual([]);
    });

    it('nextWakeAt = earliest', () => {
      SnoozeStore.snoozeUntil('a', 5000_000_000_000);
      SnoozeStore.snoozeUntil('b', 4000_000_000_000);
      expect(SnoozeStore.nextWakeAt()).toBe(4000_000_000_000);
    });

    it('nextWakeAt undefined gdy empty', () => {
      expect(SnoozeStore.nextWakeAt()).toBeUndefined();
    });

    it('countLocalOnly', () => {
      SnoozeStore.snoozeUntil('a', Date.now() + 100000, { serverSupport: 'local_only' });
      SnoozeStore.snoozeUntil('b', Date.now() + 100000, { serverSupport: 'gmail' });
      SnoozeStore.snoozeUntil('c', Date.now() + 100000, { serverSupport: 'imap_keyword' });
      expect(SnoozeStore.countLocalOnly()).toBe(1);
    });
  });

  // === Wake tick ===

  describe('tickWake', () => {
    it('zwraca empty gdy żaden ready', () => {
      SnoozeStore.snoozeUntil('a', Date.now() + 86400000);
      const result = SnoozeStore.tickWake();
      expect(result.awakened).toEqual([]);
      expect(SnoozeStore.count()).toBe(1);
    });

    it('awakens entries z wakeAt <= now + usuwa z queue', () => {
      const past = Date.now() - 1000;
      const future = Date.now() + 86400000;
      // Bypass guard via direct seed (snoozeUntil rzuca dla past)
      // Use snoozeUntil z future, then tickWake z future +1 ms żeby symulować upływ czasu
      SnoozeStore.snoozeUntil('past', Date.now() + 100, { accountId: 'x' });
      SnoozeStore.snoozeUntil('future', future);
      const result = SnoozeStore.tickWake(Date.now() + 200);
      expect(result.awakened.length).toBe(1);
      expect(result.awakened[0].threadId).toBe('past');
      expect(SnoozeStore.count()).toBe(1);
      expect(SnoozeStore.isSnoozed('future')).toBe(true);
    });

    it('awakens many in one tick', () => {
      SnoozeStore.snoozeUntil('a', Date.now() + 100);
      SnoozeStore.snoozeUntil('b', Date.now() + 200);
      SnoozeStore.snoozeUntil('c', Date.now() + 86400000);
      const result = SnoozeStore.tickWake(Date.now() + 500);
      expect(result.awakened.length).toBe(2);
      expect(result.awakened.map(e => e.threadId).sort()).toEqual(['a', 'b']);
    });
  });

  // === a11y ===

  describe('ariaLabel (WCAG 4.1.3)', () => {
    it('PL: brak maili', () => {
      expect(SnoozeStore.ariaLabel('pl')).toBe('Brak maili w snooze');
    });

    it('EN: no snoozed mails', () => {
      expect(SnoozeStore.ariaLabel('en')).toBe('No snoozed mails');
    });

    it('PL: liczy maile + earliest', () => {
      SnoozeStore.snoozeUntil('a', Date.now() + 86400000);
      SnoozeStore.snoozeUntil('b', Date.now() + 2 * 86400000);
      const label = SnoozeStore.ariaLabel('pl');
      expect(label).toContain('2');
      expect(label).toContain('w snooze');
      expect(label).toContain('najwcześniejszy wraca');
    });

    it('EN: liczy + earliest', () => {
      SnoozeStore.snoozeUntil('a', Date.now() + 86400000);
      const label = SnoozeStore.ariaLabel('en');
      expect(label).toContain('1');
      expect(label).toContain('snoozed mail');
      expect(label).toContain('earliest returns');
    });
  });

  // === Persistence ===

  describe('persistence', () => {
    it('persists do localStorage', () => {
      SnoozeStore.snoozeByPreset('t1', 'tomorrow_morning');
      expect(localStorage.getItem('actuna.snoozed-threads')).toContain('t1');
    });

    it('load po restart', () => {
      SnoozeStore.snoozeByPreset('a', 'tomorrow_morning');
      const raw = localStorage.getItem('actuna.snoozed-threads')!;
      SnoozeStore._reset();
      localStorage.setItem('actuna.snoozed-threads', raw);
      SnoozeStore.init();
      expect(SnoozeStore.count()).toBe(1);
    });
  });

  // === Listen ===

  describe('listen', () => {
    it('emit na snooze/modify/unsnooze/tickWake (gdy zmiana)', () => {
      let n = 0;
      const unsub = SnoozeStore.listen(() => n++);
      SnoozeStore.snoozeByPreset('a', 'tomorrow_morning');
      SnoozeStore.modify('a', Date.now() + 7 * 86400000);
      SnoozeStore.unsnooze('a');
      expect(n).toBe(3);
      // tickWake z empty awakened → NO emit
      SnoozeStore.tickWake();
      expect(n).toBe(3);
      unsub();
    });
  });
});
