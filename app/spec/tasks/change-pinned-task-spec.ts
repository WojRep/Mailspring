/**
 * Pin cross-device (decyzja plan_to_version_1.0/46) — Etap B (TS).
 *
 * Pin przestaje być stanem lokalnym; staje się atrybutem `pinned` na modelu
 * (round-trip z silnika, docelowo keyword IMAP `$Pinned`) + task ChangePinnedTask
 * — dokładna kalka `starred` / ChangeStarredTask.
 *
 * TDD RED: te asercje failują dopóki nie dodamy atrybutu `pinned` do Thread oraz
 * klasy ChangePinnedTask (zarejestrowanej w actunamail-exports).
 */
import { ChangePinnedTask, Thread } from 'actunamail-exports';

function makeThread(id: string) {
  return new Thread({ id, accountId: 'acct-1' } as any);
}

describe('Pin cross-device — Thread.pinned + ChangePinnedTask (decyzja #46)', () => {
  describe('Thread.pinned attribute (kalka starred)', () => {
    it('exposes a queryable pinned attribute', () => {
      expect((Thread as any).attributes.pinned).toBeDefined();
      expect((Thread as any).attributes.pinned.queryable).toBe(true);
    });

    it('round-trips the pinned boolean', () => {
      const t = new Thread({ id: 't1', pinned: true } as any);
      expect(t.pinned).toBe(true);
    });
  });

  describe('ChangePinnedTask (kalka ChangeStarredTask)', () => {
    it('sets pinned + threadIds from constructor', () => {
      const task = new ChangePinnedTask({ threads: [makeThread('t1')], pinned: true });
      expect(task.pinned).toBe(true);
      expect(task.threadIds).toEqual(['t1']);
    });

    it('createUndoTask flips pinned (toggle undo pattern)', () => {
      const task = new ChangePinnedTask({ threads: [makeThread('t1')], pinned: true });
      const undo = task.createUndoTask() as any;
      expect(undo.pinned).toBe(false);
    });

    it('willBeQueued throws when no threads provided', () => {
      const task = new ChangePinnedTask({ threads: [], pinned: true });
      expect(() => task.willBeQueued()).toThrow();
    });

    it('label differs for pin vs unpin', () => {
      const pin = new ChangePinnedTask({ threads: [makeThread('t1')], pinned: true });
      const unpin = new ChangePinnedTask({ threads: [makeThread('t1')], pinned: false });
      expect(typeof pin.label()).toBe('string');
      expect(pin.label()).not.toEqual(unpin.label());
    });
  });
});
