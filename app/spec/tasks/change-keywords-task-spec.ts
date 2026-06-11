/**
 * Bilet #117 — tag sync cross-device, warstwa TS.
 *
 * Generalizacja wzorca `$Pinned` (decyzja plan_to_version_1.0/46) na dowolne
 * keywordy IMAP: atrybut `customKeywords` na Thread/Message (round-trip z
 * silnika C++) + ChangeKeywordsTask (kalka ChangePinnedTask z multi-value
 * toAdd/toRemove jak ChangeLabelsTask).
 *
 * TDD RED: failuje dopóki nie dodamy atrybutów + klasy ChangeKeywordsTask
 * (zarejestrowanej w actunamail-exports).
 */
import { ChangeKeywordsTask, Thread, Message } from 'actunamail-exports';

function makeThread(id: string) {
  return new Thread({ id, accountId: 'acct-1' } as any);
}

describe('Tag sync — Thread.customKeywords + ChangeKeywordsTask (bilet #117)', () => {
  describe('customKeywords attribute (kalka pinned)', () => {
    it('Thread exposes a customKeywords attribute', () => {
      expect((Thread as any).attributes.customKeywords).toBeDefined();
    });

    it('Thread round-trips the customKeywords array', () => {
      const t = new Thread({ id: 't1', customKeywords: ['ProjektX', 'Q1'] } as any);
      expect((t as any).customKeywords).toEqual(['ProjektX', 'Q1']);
    });

    it('Message exposes a customKeywords attribute', () => {
      expect((Message as any).attributes.customKeywords).toBeDefined();
    });
  });

  describe('ChangeKeywordsTask (kalka ChangePinnedTask + toAdd/toRemove)', () => {
    it('sets keywordsToAdd/keywordsToRemove + threadIds from constructor', () => {
      const task = new ChangeKeywordsTask({
        threads: [makeThread('t1')],
        keywordsToAdd: ['Q1'],
        keywordsToRemove: [],
      });
      expect(task.keywordsToAdd).toEqual(['Q1']);
      expect(task.keywordsToRemove).toEqual([]);
      expect(task.threadIds).toEqual(['t1']);
    });

    it('createUndoTask swaps toAdd and toRemove', () => {
      const task = new ChangeKeywordsTask({
        threads: [makeThread('t1')],
        keywordsToAdd: ['Q1'],
        keywordsToRemove: ['Q2'],
      });
      const undo = task.createUndoTask() as any;
      expect(undo.keywordsToAdd).toEqual(['Q2']);
      expect(undo.keywordsToRemove).toEqual(['Q1']);
    });

    it('willBeQueued throws when no threads provided', () => {
      const task = new ChangeKeywordsTask({
        threads: [],
        keywordsToAdd: ['Q1'],
        keywordsToRemove: [],
      });
      expect(() => task.willBeQueued()).toThrow();
    });

    it('willBeQueued throws when keyword arrays missing', () => {
      const task = new ChangeKeywordsTask({ threads: [makeThread('t1')] } as any);
      expect(() => task.willBeQueued()).toThrow();
    });

    it('label() is a non-empty string', () => {
      const task = new ChangeKeywordsTask({
        threads: [makeThread('t1')],
        keywordsToAdd: ['Q1'],
        keywordsToRemove: [],
      });
      expect(typeof task.label()).toBe('string');
      expect(task.label().length).toBeGreaterThan(0);
    });
  });
});
