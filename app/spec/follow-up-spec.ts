/**
 * Bilet MVP #106 — Follow-up auto-detection + Waiting sidebar + manual reminder.
 *
 * Pokrycie:
 *  - Settings (detectionThresholdDays bounds 1-14).
 *  - runDetection: creates new pending entries, auto-resolves replied, skips existing.
 *  - snooze / dismiss / markResolved / tickUnsnooze.
 *  - Manual reminder (setManualReminder + tickManualReminders).
 *  - Queries: listActive (sorted ageing), listByStatus, listForRecipient, countActive.
 *  - localStorage persistence + load clamp.
 *  - Listen notifications.
 */

import {
  FollowUpStore,
  DETECTION_THRESHOLD_DEFAULT_DAYS,
  DETECTION_THRESHOLD_MIN_DAYS,
  DETECTION_THRESHOLD_MAX_DAYS,
} from '../internal_packages/follow-up/lib/follow-up-store';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Follow-up — bilet MVP #106', () => {

  beforeEach(() => {
    FollowUpStore._reset();
    FollowUpStore.init();
  });

  // === Settings ===

  describe('settings', () => {
    it('default threshold = 3 dni', () => {
      expect(FollowUpStore.getSettings().detectionThresholdDays).toBe(DETECTION_THRESHOLD_DEFAULT_DAYS);
      expect(DETECTION_THRESHOLD_DEFAULT_DAYS).toBe(3);
    });

    it('bounds 1..14', () => {
      expect(DETECTION_THRESHOLD_MIN_DAYS).toBe(1);
      expect(DETECTION_THRESHOLD_MAX_DAYS).toBe(14);
    });

    it('setDetectionThreshold w bounds OK', () => {
      FollowUpStore.setDetectionThreshold(7);
      expect(FollowUpStore.getSettings().detectionThresholdDays).toBe(7);
    });

    it('setDetectionThreshold poza bounds throws', () => {
      { let _err; try { FollowUpStore.setDetectionThreshold(0); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/1-14/); }
      { let _err; try { FollowUpStore.setDetectionThreshold(15); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/1-14/); }
    });
  });

  // === Detection ===

  describe('runDetection', () => {
    it('tworzy pending entries dla outbound starszych niż threshold + brak reply', () => {
      const now = Date.now();
      const result = FollowUpStore.runDetection([
        {
          threadId: 't_old',
          lastOutboundAt: now - 5 * DAY_MS,
          recipient: 'bob@x.com',
          subject: 'Proposal',
        },
      ], now);
      expect(result.newWaiting.length).toBe(1);
      expect(result.newWaiting[0].status).toBe('pending');
      expect(FollowUpStore.countActive()).toBe(1);
    });

    it('skip outbound świeższy niż threshold', () => {
      const now = Date.now();
      const result = FollowUpStore.runDetection([
        { threadId: 't_fresh', lastOutboundAt: now - 1 * DAY_MS },
      ], now);
      expect(result.newWaiting.length).toBe(0);
      expect(FollowUpStore.countActive()).toBe(0);
    });

    it('skip gdy lastInbound > lastOutbound (juz reply)', () => {
      const now = Date.now();
      const result = FollowUpStore.runDetection([
        {
          threadId: 't_replied',
          lastOutboundAt: now - 5 * DAY_MS,
          lastInboundAt: now - 1 * DAY_MS,
        },
      ], now);
      expect(result.newWaiting.length).toBe(0);
    });

    it('auto-resolve istniejący pending gdy lastInbound > lastOutbound (reply came)', () => {
      const now = Date.now();
      // Najpierw create pending
      FollowUpStore.runDetection([
        { threadId: 't1', lastOutboundAt: now - 5 * DAY_MS },
      ], now);
      // Druga sweep — recipient odpowiedział
      const result = FollowUpStore.runDetection([
        {
          threadId: 't1',
          lastOutboundAt: now - 5 * DAY_MS,
          lastInboundAt: now - 1 * DAY_MS,
        },
      ], now);
      expect(result.autoResolved.length).toBe(1);
      expect(FollowUpStore.get('t1')?.status).toBe('resolved');
      expect(FollowUpStore.countActive()).toBe(0);
    });

    it('skip istniejący pending bez reply (no-op)', () => {
      const now = Date.now();
      FollowUpStore.runDetection([
        { threadId: 't1', lastOutboundAt: now - 5 * DAY_MS },
      ], now);
      const result = FollowUpStore.runDetection([
        { threadId: 't1', lastOutboundAt: now - 5 * DAY_MS },
      ], now);
      expect(result.newWaiting.length).toBe(0);
      expect(result.skippedExisting).toBe(1);
    });

    it('respektuje custom threshold', () => {
      FollowUpStore.setDetectionThreshold(7);
      const now = Date.now();
      const result = FollowUpStore.runDetection([
        { threadId: 't_5d', lastOutboundAt: now - 5 * DAY_MS }, // poniżej 7
        { threadId: 't_10d', lastOutboundAt: now - 10 * DAY_MS }, // powyżej 7
      ], now);
      expect(result.newWaiting.length).toBe(1);
      expect(result.newWaiting[0].threadId).toBe('t_10d');
    });
  });

  // === Per-thread actions ===

  describe('snooze / dismiss / markResolved / tickUnsnooze', () => {
    function seed(): string {
      const now = Date.now();
      FollowUpStore.runDetection([
        { threadId: 't1', lastOutboundAt: now - 5 * DAY_MS },
      ], now);
      return 't1';
    }

    it('snooze ustawia status + snoozeUntil', () => {
      const tid = seed();
      const until = Date.now() + 2 * DAY_MS;
      const e = FollowUpStore.snooze(tid, until);
      expect(e?.status).toBe('snoozed');
      expect(e?.snoozeUntil).toBe(until);
      expect(FollowUpStore.countActive()).toBe(0);
    });

    it('snooze w przeszłości throws', () => {
      const tid = seed();
      { let _err; try { FollowUpStore.snooze(tid, Date.now() - 1000); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/future/); }
    });

    it('dismiss → status="dismissed"', () => {
      const tid = seed();
      const e = FollowUpStore.dismiss(tid);
      expect(e?.status).toBe('dismissed');
      expect(FollowUpStore.countActive()).toBe(0);
    });

    it('markResolved → status="resolved"', () => {
      const tid = seed();
      const e = FollowUpStore.markResolved(tid);
      expect(e?.status).toBe('resolved');
    });

    it('actions na nieistniejącym → undefined', () => {
      expect(FollowUpStore.snooze('t_nope', Date.now() + 1000)).toBeUndefined();
      expect(FollowUpStore.dismiss('t_nope')).toBeUndefined();
      expect(FollowUpStore.markResolved('t_nope')).toBeUndefined();
    });

    it('tickUnsnooze przywraca snoozed do pending gdy expired', () => {
      const tid = seed();
      FollowUpStore.snooze(tid, Date.now() + 1000);
      const restored = FollowUpStore.tickUnsnooze(Date.now() + 2000);
      expect(restored.length).toBe(1);
      expect(restored[0].status).toBe('pending');
      expect(restored[0].snoozeUntil).toBeUndefined();
    });

    it('tickUnsnooze NIE rusza pending/dismissed/resolved', () => {
      const tid = seed();
      const restored = FollowUpStore.tickUnsnooze(Date.now() + 86400000);
      expect(restored.length).toBe(0);
      expect(FollowUpStore.get(tid)?.status).toBe('pending');
    });
  });

  // === Manual reminder ===

  describe('setManualReminder / tickManualReminders', () => {
    it('setManualReminder tworzy entry z manualRemindAt + status=pending', () => {
      const lastOut = Date.now();
      const e = FollowUpStore.setManualReminder('t1', 'bob@x.com', 'Subject', lastOut, 3);
      expect(e.manualRemindAt).toBe(lastOut + 3 * DAY_MS);
      expect(e.status).toBe('pending');
      expect(e.recipient).toBe('bob@x.com');
    });

    it('setManualReminder na istniejącym entry patches manualRemindAt', () => {
      const lastOut = Date.now();
      FollowUpStore.setManualReminder('t1', 'bob@x.com', 'S', lastOut, 3);
      const upd = FollowUpStore.setManualReminder('t1', undefined, undefined, lastOut, 7);
      expect(upd.manualRemindAt).toBe(lastOut + 7 * DAY_MS);
      // Recipient nie zmieniony bo undefined fallback
      expect(upd.recipient).toBe('bob@x.com');
    });

    it('setManualReminder days poza bounds throws', () => {
      { let _err; try { FollowUpStore.setManualReminder('t1', undefined, undefined, Date.now(), 0); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/1-30/); }
      { let _err; try { FollowUpStore.setManualReminder('t1', undefined, undefined, Date.now(), 31); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/1-30/); }
    });

    it('tickManualReminders fires due + clears manualRemindAt', () => {
      const lastOut = Date.now() - 10 * DAY_MS;
      // Set reminder 3 days from lastOut → past now
      FollowUpStore.setManualReminder('t1', undefined, undefined, lastOut, 3);
      const due = FollowUpStore.tickManualReminders(Date.now());
      expect(due.length).toBe(1);
      expect(FollowUpStore.get('t1')?.manualRemindAt).toBeUndefined();
    });

    it('tickManualReminders NIE fires gdy future', () => {
      const lastOut = Date.now();
      FollowUpStore.setManualReminder('t1', undefined, undefined, lastOut, 3);
      const due = FollowUpStore.tickManualReminders(Date.now());
      expect(due.length).toBe(0);
    });

    it('tickManualReminders skip non-pending', () => {
      const lastOut = Date.now() - 10 * DAY_MS;
      FollowUpStore.setManualReminder('t1', undefined, undefined, lastOut, 3);
      FollowUpStore.dismiss('t1');
      const due = FollowUpStore.tickManualReminders(Date.now());
      expect(due.length).toBe(0);
    });
  });

  // === Queries ===

  describe('queries', () => {
    it('listActive zwraca tylko pending, sorted ageing (oldest lastOutbound first)', () => {
      const now = Date.now();
      FollowUpStore.runDetection([
        { threadId: 't_recent', lastOutboundAt: now - 4 * DAY_MS },
        { threadId: 't_oldest', lastOutboundAt: now - 14 * DAY_MS },
        { threadId: 't_mid', lastOutboundAt: now - 7 * DAY_MS },
      ], now);
      const ids = FollowUpStore.listActive().map(e => e.threadId);
      expect(ids).toEqual(['t_oldest', 't_mid', 't_recent']);
    });

    it('listByStatus filtruje', () => {
      const now = Date.now();
      FollowUpStore.runDetection([
        { threadId: 'a', lastOutboundAt: now - 5 * DAY_MS },
        { threadId: 'b', lastOutboundAt: now - 5 * DAY_MS },
      ], now);
      FollowUpStore.dismiss('a');
      expect(FollowUpStore.listByStatus('dismissed').length).toBe(1);
      expect(FollowUpStore.listByStatus('pending').length).toBe(1);
    });

    it('listForRecipient filtruje active po email', () => {
      const now = Date.now();
      FollowUpStore.runDetection([
        { threadId: 'a', lastOutboundAt: now - 5 * DAY_MS, recipient: 'bob@x.com' },
        { threadId: 'b', lastOutboundAt: now - 5 * DAY_MS, recipient: 'alice@x.com' },
        { threadId: 'c', lastOutboundAt: now - 5 * DAY_MS, recipient: 'BOB@X.COM' }, // case test
      ], now);
      const forBob = FollowUpStore.listForRecipient('bob@x.com').map(e => e.threadId).sort();
      expect(forBob).toEqual(['a', 'c']);
    });

    it('countActive vs count', () => {
      const now = Date.now();
      FollowUpStore.runDetection([
        { threadId: 'a', lastOutboundAt: now - 5 * DAY_MS },
        { threadId: 'b', lastOutboundAt: now - 5 * DAY_MS },
      ], now);
      FollowUpStore.dismiss('a');
      expect(FollowUpStore.count()).toBe(2);
      expect(FollowUpStore.countActive()).toBe(1);
    });
  });

  // === Persistence ===

  describe('persistence', () => {
    it('persists entries + settings', () => {
      FollowUpStore.setDetectionThreshold(7);
      FollowUpStore.runDetection([
        { threadId: 't1', lastOutboundAt: Date.now() - 10 * DAY_MS },
      ]);
      expect(localStorage.getItem('actuna.waiting-followups')).toContain('t1');
      expect(localStorage.getItem('actuna.followup-settings')).toContain('7');
    });

    it('load clamp settings do bounds', () => {
      // _reset() czyści localStorage — wykonać PRZED setItem.
      FollowUpStore._reset();
      localStorage.setItem('actuna.followup-settings', JSON.stringify({ detectionThresholdDays: 99 }));
      FollowUpStore.init();
      expect(FollowUpStore.getSettings().detectionThresholdDays).toBe(DETECTION_THRESHOLD_MAX_DAYS);
    });
  });

  // === Listen ===

  describe('listen', () => {
    it('emit na runDetection (new) + actions', () => {
      let n = 0;
      const unsub = FollowUpStore.listen(() => n++);
      const now = Date.now();
      FollowUpStore.runDetection([{ threadId: 't1', lastOutboundAt: now - 5 * DAY_MS }], now);
      FollowUpStore.snooze('t1', Date.now() + 1000);
      FollowUpStore.dismiss('t1');
      expect(n).toBe(3);
      unsub();
    });

    it('NO emit gdy runDetection bez zmian', () => {
      const now = Date.now();
      // Detection bez results
      let n = 0;
      const unsub = FollowUpStore.listen(() => n++);
      FollowUpStore.runDetection([{ threadId: 't_fresh', lastOutboundAt: now - 1000 }], now);
      expect(n).toBe(0);
      unsub();
    });
  });
});
