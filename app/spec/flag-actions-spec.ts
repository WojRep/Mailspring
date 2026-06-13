/**
 * Test — akcje kolorowych flag: setFlagColor / clearFlag kolejkują JEDEN blok
 * (Actions.queueTasks) z ChangeKeywordsTask (bity) + ChangeStarredTask (\Flagged)
 * → atomowy undo (przegląd adversarialny).
 */

import { Actions } from 'actunamail-exports';
import { setFlagColor, clearFlag } from '../internal_packages/thread-list/lib/flag-actions';

describe('flag-actions — setFlagColor / clearFlag (atomowy queueTasks)', () => {
  it('setFlagColor(blue=4) → 1 blok: KeywordsTask add Bit2 / remove Bit0,Bit1 + StarredTask true', () => {
    spyOn(Actions, 'queueTasks');
    setFlagColor([{ id: 't1' }] as any, 4);
    const q = Actions.queueTasks as any;
    expect(q.callCount).toBe(1);
    const tasks = q.argsForCall[0][0];
    expect(tasks.length).toBe(2);
    expect(tasks[0].constructor.name).toBe('ChangeKeywordsTask');
    expect(tasks[0].keywordsToAdd).toEqual(['$MailFlagBit2']);
    expect(tasks[0].keywordsToRemove.slice().sort()).toEqual(['$MailFlagBit0', '$MailFlagBit1']);
    expect(tasks[1].constructor.name).toBe('ChangeStarredTask');
    expect(tasks[1].starred).toBe(true);
  });

  it('setFlagColor(red=0) → usuwa wszystkie bity + starred true (czerwona = gwiazdka)', () => {
    spyOn(Actions, 'queueTasks');
    setFlagColor([{ id: 't1' }] as any, 0);
    const tasks = (Actions.queueTasks as any).argsForCall[0][0];
    expect(tasks[0].keywordsToAdd).toEqual([]);
    expect(tasks[0].keywordsToRemove.slice().sort()).toEqual([
      '$MailFlagBit0',
      '$MailFlagBit1',
      '$MailFlagBit2',
    ]);
    expect(tasks[1].starred).toBe(true);
  });

  it('clearFlag → 1 blok: usuwa wszystkie bity + starred false', () => {
    spyOn(Actions, 'queueTasks');
    clearFlag([{ id: 't1' }] as any);
    const q = Actions.queueTasks as any;
    expect(q.callCount).toBe(1);
    const tasks = q.argsForCall[0][0];
    expect(tasks[0].keywordsToRemove.slice().sort()).toEqual([
      '$MailFlagBit0',
      '$MailFlagBit1',
      '$MailFlagBit2',
    ]);
    expect(tasks[1].starred).toBe(false);
  });

  it('pusta lista wątków → nic nie kolejkuje', () => {
    spyOn(Actions, 'queueTasks');
    setFlagColor([] as any, 4);
    clearFlag([] as any);
    expect((Actions.queueTasks as any).callCount).toBe(0);
  });
});
