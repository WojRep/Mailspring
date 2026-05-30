/**
 * Bilet MVP #105 — Send Later extras (Store + presets) unit tests.
 *
 * Nazwa "extras" — istnieje upstream send-later plugin z metadata-based send flow.
 * Mój wkład: SendLaterStore (Scheduled queue + Undo window) + preset resolvers +
 * KP soft warning + WCAG 2.2.1 undo window settings.
 *
 * Pokrycie:
 *  - resolveSendLaterPreset (in_1h, tomorrow_9am, next_monday_morning).
 *  - SendLaterStore schedule/cancel/modify/wakeScheduled.
 *  - enqueueForUndo/undo/tickFlush.
 *  - Undo window settings (WCAG 2.2.1 — bounds 5-30s).
 *  - isPozaGodzinamiPracy (KP right-to-disconnect).
 *  - localStorage persistence.
 *  - Listen notifications.
 */

import {
  resolveSendLaterPreset,
  SEND_LATER_LABELS_PL,
  SEND_LATER_LABELS_EN,
} from '../internal_packages/send-later/lib/send-later-presets';
import {
  SendLaterStore,
  UNDO_WINDOW_DEFAULT_SEC,
  UNDO_WINDOW_MIN_SEC,
  UNDO_WINDOW_MAX_SEC,
  WORK_HOURS_START,
  WORK_HOURS_END,
} from '../internal_packages/send-later/lib/send-later-store';

describe('Send Later extras — bilet MVP #105', () => {

  beforeEach(() => {
    SendLaterStore._reset();
    SendLaterStore.init();
  });

  // === Preset resolvers ===

  describe('resolveSendLaterPreset', () => {
    const baseWed = new Date(2026, 4, 27, 14, 30, 0, 0); // Wed 2026-05-27 14:30

    it('in_1h → +1 godzina', () => {
      const t = resolveSendLaterPreset('in_1h', baseWed);
      expect(t - baseWed.getTime()).toBe(60 * 60 * 1000);
    });

    it('tomorrow_9am → jutro 09:00', () => {
      const t = resolveSendLaterPreset('tomorrow_9am', baseWed);
      const dt = new Date(t);
      expect(dt.getDate()).toBe(28);
      expect(dt.getHours()).toBe(9);
      expect(dt.getMinutes()).toBe(0);
    });

    it('next_monday_morning → najbliższy poniedziałek 09:00', () => {
      const t = resolveSendLaterPreset('next_monday_morning', baseWed);
      const dt = new Date(t);
      expect(dt.getDay()).toBe(1); // Monday
      expect(dt.getHours()).toBe(9);
    });

    it('PL + EN labels dla każdego preset', () => {
      const presets: Array<keyof typeof SEND_LATER_LABELS_PL> = [
        'in_1h', 'tomorrow_9am', 'next_monday_morning', 'custom',
      ];
      for (const p of presets) {
        expect(SEND_LATER_LABELS_PL[p]).toBeTruthy();
        expect(SEND_LATER_LABELS_EN[p]).toBeTruthy();
      }
    });
  });

  // === Scheduled queue ===

  describe('schedule / cancel / modify / wakeScheduled', () => {
    it('schedule wymaga draftId + future sendAt', () => {
      { let _err; try { SendLaterStore.schedule({ draftId: '', sendAt: Date.now() + 1000 }); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/draftId/); }
      { let _err; try { SendLaterStore.schedule({ draftId: 'd1', sendAt: Date.now() - 1000 }); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/future/); }
    });

    it('schedule defaults: serverSupport=local_only', () => {
      const d = SendLaterStore.schedule({ draftId: 'd1', sendAt: Date.now() + 100000 });
      expect(d.serverSupport).toBe('local_only');
    });

    it('schedule z opts', () => {
      const t = Date.now() + 100000;
      const d = SendLaterStore.schedule({
        draftId: 'd1',
        sendAt: t,
        accountId: 'acc',
        serverSupport: 'gmail_api',
        preset: 'tomorrow_9am',
        snapshot: { subject: 'Test', to: ['x@y.com'] },
      });
      expect(d.serverSupport).toBe('gmail_api');
      expect(d.snapshot?.subject).toBe('Test');
    });

    it('cancel usuwa entry', () => {
      const d = SendLaterStore.schedule({ draftId: 'd1', sendAt: Date.now() + 100000 });
      const cancelled = SendLaterStore.cancel(d.draftId);
      expect(cancelled?.draftId).toBe('d1');
      expect(SendLaterStore.countScheduled()).toBe(0);
    });

    it('cancel nieistniejącego → undefined', () => {
      expect(SendLaterStore.cancel('d_nope')).toBeUndefined();
    });

    it('modify zmienia sendAt + zeruje preset', () => {
      const d = SendLaterStore.schedule({ draftId: 'd1', sendAt: Date.now() + 100000, preset: 'in_1h' });
      const newSendAt = Date.now() + 7 * 86400000;
      const upd = SendLaterStore.modify(d.draftId, newSendAt);
      expect(upd?.sendAt).toBe(newSendAt);
      expect(upd?.preset).toBeUndefined();
    });

    it('modify w przeszłości throws', () => {
      const d = SendLaterStore.schedule({ draftId: 'd1', sendAt: Date.now() + 100000 });
      { let _err; try { SendLaterStore.modify(d.draftId, Date.now() - 1000); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/future/); }
    });

    it('listScheduled sortuje wakeAt asc', () => {
      const now = Date.now();
      SendLaterStore.schedule({ draftId: 'a', sendAt: now + 3000 });
      SendLaterStore.schedule({ draftId: 'b', sendAt: now + 1000 });
      SendLaterStore.schedule({ draftId: 'c', sendAt: now + 2000 });
      expect(SendLaterStore.listScheduled().map(d => d.draftId)).toEqual(['b', 'c', 'a']);
    });

    it('listScheduledForAccount filtruje', () => {
      SendLaterStore.schedule({ draftId: 'a', sendAt: Date.now() + 1000, accountId: 'x' });
      SendLaterStore.schedule({ draftId: 'b', sendAt: Date.now() + 1000, accountId: 'y' });
      expect(SendLaterStore.listScheduledForAccount('x').map(d => d.draftId)).toEqual(['a']);
    });

    it('wakeScheduled zwraca due + usuwa', () => {
      SendLaterStore.schedule({ draftId: 'past', sendAt: Date.now() + 100 });
      SendLaterStore.schedule({ draftId: 'future', sendAt: Date.now() + 86400000 });
      const result = SendLaterStore.wakeScheduled(Date.now() + 200);
      expect(result.due.length).toBe(1);
      expect(result.due[0].draftId).toBe('past');
      expect(SendLaterStore.countScheduled()).toBe(1);
    });
  });

  // === Undo window ===

  describe('enqueueForUndo / undo / tickFlush', () => {
    it('enqueueForUndo tworzy entry z holdUntil = now + undoWindowSec*1000', () => {
      const t0 = Date.now();
      const e = SendLaterStore.enqueueForUndo({ draftId: 'd1' });
      const expected = t0 + UNDO_WINDOW_DEFAULT_SEC * 1000;
      expect((e.holdUntil) >= (expected - 50)).toBe(true);
      expect((e.holdUntil) <= (expected + 50)).toBe(true);
      expect(e.undoWindowSec).toBe(UNDO_WINDOW_DEFAULT_SEC);
    });

    it('enqueueForUndo wymaga draftId', () => {
      { let _err; try { SendLaterStore.enqueueForUndo({ draftId: '' }); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/draftId/); }
    });

    it('undo w oknie zwraca entry + usuwa', () => {
      SendLaterStore.setUndoWindow(30);
      const e = SendLaterStore.enqueueForUndo({ draftId: 'd1' });
      const undone = SendLaterStore.undo('d1');
      expect(undone?.draftId).toBe('d1');
      expect(SendLaterStore.countUndoWindow()).toBe(0);
    });

    it('undo poza oknem → undefined (już za późno)', () => {
      SendLaterStore.setUndoWindow(5); // min
      // Manually inject entry z holdUntil w przeszłości
      const past: any = {
        draftId: 'd1',
        holdUntil: Date.now() - 1000,
        undoWindowSec: 5,
        enqueuedAt: Date.now() - 6000,
      };
      // bypass enqueueForUndo:
      (SendLaterStore as any)._undoWindow.set('d1', past);
      const undone = SendLaterStore.undo('d1');
      expect(undone).toBeUndefined();
      // Entry pozostaje (tickFlush usuwa, nie undo)
      expect(SendLaterStore.countUndoWindow()).toBe(1);
    });

    it('undo nieistniejącego → undefined', () => {
      expect(SendLaterStore.undo('d_nope')).toBeUndefined();
    });

    it('tickFlush zwraca toSend + usuwa', () => {
      const past: any = {
        draftId: 'd1',
        holdUntil: Date.now() - 100,
        undoWindowSec: 5,
        enqueuedAt: Date.now() - 6000,
      };
      const future: any = {
        draftId: 'd2',
        holdUntil: Date.now() + 86400000,
        undoWindowSec: 5,
        enqueuedAt: Date.now(),
      };
      (SendLaterStore as any)._undoWindow.set('d1', past);
      (SendLaterStore as any)._undoWindow.set('d2', future);
      const result = SendLaterStore.tickFlush();
      expect(result.toSend.length).toBe(1);
      expect(result.toSend[0].draftId).toBe('d1');
      expect(SendLaterStore.countUndoWindow()).toBe(1);
    });
  });

  // === Settings (WCAG 2.2.1) ===

  describe('undo window settings (WCAG 2.2.1 Timing Adjustable)', () => {
    it('default = 5s', () => {
      expect(SendLaterStore.getSettings().undoWindowSec).toBe(UNDO_WINDOW_DEFAULT_SEC);
      expect(UNDO_WINDOW_DEFAULT_SEC).toBe(5);
    });

    it('bounds 5..30s', () => {
      expect(UNDO_WINDOW_MIN_SEC).toBe(5);
      expect(UNDO_WINDOW_MAX_SEC).toBe(30);
    });

    it('setUndoWindow w bounds OK', () => {
      SendLaterStore.setUndoWindow(15);
      expect(SendLaterStore.getSettings().undoWindowSec).toBe(15);
      SendLaterStore.setUndoWindow(30);
      expect(SendLaterStore.getSettings().undoWindowSec).toBe(30);
    });

    it('setUndoWindow poza bounds throws', () => {
      { let _err; try { SendLaterStore.setUndoWindow(4); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/5-30/); }
      { let _err; try { SendLaterStore.setUndoWindow(31); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/5-30/); }
    });
  });

  // === KP right-to-disconnect ===

  describe('isPozaGodzinamiPracy (KP right-to-disconnect)', () => {
    it('weekday w godzinach 8-18 → false', () => {
      // Wed 10:00
      const wed10 = new Date(2026, 4, 27, 10, 0).getTime();
      expect(SendLaterStore.isPozaGodzinamiPracy(wed10)).toBe(false);
      const wed17 = new Date(2026, 4, 27, 17, 30).getTime();
      expect(SendLaterStore.isPozaGodzinamiPracy(wed17)).toBe(false);
    });

    it('weekday przed 8:00 → true', () => {
      const wed7 = new Date(2026, 4, 27, 7, 30).getTime();
      expect(SendLaterStore.isPozaGodzinamiPracy(wed7)).toBe(true);
    });

    it('weekday po 18:00 → true', () => {
      const wed19 = new Date(2026, 4, 27, 19, 0).getTime();
      expect(SendLaterStore.isPozaGodzinamiPracy(wed19)).toBe(true);
    });

    it('weekend → true zawsze', () => {
      const sat10 = new Date(2026, 4, 30, 10, 0).getTime();
      const sun15 = new Date(2026, 4, 31, 15, 0).getTime();
      expect(SendLaterStore.isPozaGodzinamiPracy(sat10)).toBe(true);
      expect(SendLaterStore.isPozaGodzinamiPracy(sun15)).toBe(true);
    });

    it('WORK_HOURS constants', () => {
      expect(WORK_HOURS_START).toBe(8);
      expect(WORK_HOURS_END).toBe(18);
    });
  });

  // === Persistence ===

  describe('persistence', () => {
    it('persists scheduled + undo + settings do localStorage', () => {
      SendLaterStore.schedule({ draftId: 'd1', sendAt: Date.now() + 100000 });
      SendLaterStore.enqueueForUndo({ draftId: 'u1' });
      SendLaterStore.setUndoWindow(15);
      expect(localStorage.getItem('actuna.scheduled-drafts')).toContain('d1');
      expect(localStorage.getItem('actuna.undo-window')).toContain('u1');
      expect(localStorage.getItem('actuna.send-later-settings')).toContain('15');
    });

    it('load po restart', () => {
      SendLaterStore.schedule({ draftId: 'd1', sendAt: Date.now() + 100000 });
      const raw = localStorage.getItem('actuna.scheduled-drafts')!;
      SendLaterStore._reset();
      localStorage.setItem('actuna.scheduled-drafts', raw);
      SendLaterStore.init();
      expect(SendLaterStore.countScheduled()).toBe(1);
    });

    it('load clamp settings do bounds', () => {
      // _reset() czyści localStorage — wykonać PRZED setItem.
      SendLaterStore._reset();
      localStorage.setItem('actuna.send-later-settings', JSON.stringify({ undoWindowSec: 999 }));
      SendLaterStore.init();
      // _load clampuje do MAX
      expect(SendLaterStore.getSettings().undoWindowSec).toBe(UNDO_WINDOW_MAX_SEC);
    });
  });

  // === Listen ===

  describe('listen', () => {
    it('emit na schedule/cancel/modify', () => {
      let n = 0;
      const unsub = SendLaterStore.listen(() => n++);
      const d = SendLaterStore.schedule({ draftId: 'd1', sendAt: Date.now() + 100000 });
      SendLaterStore.modify(d.draftId, Date.now() + 200000);
      SendLaterStore.cancel(d.draftId);
      expect(n).toBe(3);
      unsub();
    });

    it('emit na undo/enqueue', () => {
      SendLaterStore.setUndoWindow(30);
      let n = 0;
      const unsub = SendLaterStore.listen(() => n++);
      SendLaterStore.enqueueForUndo({ draftId: 'u1' });
      SendLaterStore.undo('u1');
      expect(n).toBe(2);
      unsub();
    });
  });
});
