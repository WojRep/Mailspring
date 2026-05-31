/**
 * Pin cross-device (decyzja plan_to_version_1.0/46) — Etap B spięcie.
 *
 * PinStore.pin/unpin nadal aktualizują lokalny cache (instant UI), ale DODATKOWO
 * wysyłają ChangePinnedTask → silnik C++ ustawia keyword IMAP `$Pinned` na
 * serwerze (uniwersalny, cross-device). localStorage = tylko cache, model/keyword
 * = źródło prawdy między urządzeniami.
 *
 * TDD RED: failuje dopóki pin/unpin nie dyspozycjonują tasku.
 */
import { PinStore } from '../internal_packages/priority-inbox-pin/lib/pin-store';
import { DatabaseStore, Thread, Actions } from 'actunamail-exports';

describe('PinStore — cross-device dispatch (ChangePinnedTask, decyzja #46)', () => {
  beforeEach(() => {
    PinStore._reset();
    PinStore.init();
  });
  afterEach(() => {
    PinStore._reset();
  });

  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('pin(id) queues a ChangePinnedTask(pinned=true) for the resolved thread', async () => {
    const thread = new Thread({ id: 'thr-1', accountId: 'acct-1' } as any);
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(thread) as any);
    spyOn(Actions, 'queueTask');

    PinStore.pin('thr-1');
    await flush();

    expect(Actions.queueTask).toHaveBeenCalled();
    const task = (Actions.queueTask as any).mostRecentCall.args[0];
    expect(task.constructor.name).toBe('ChangePinnedTask');
    expect(task.pinned).toBe(true);
    expect(task.threadIds).toEqual(['thr-1']);
  });

  it('unpin(id) queues a ChangePinnedTask(pinned=false)', async () => {
    PinStore.pin('thr-2');
    const thread = new Thread({ id: 'thr-2', accountId: 'acct-1' } as any);
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(thread) as any);
    spyOn(Actions, 'queueTask');

    PinStore.unpin('thr-2');
    await flush();

    expect(Actions.queueTask).toHaveBeenCalled();
    const task = (Actions.queueTask as any).mostRecentCall.args[0];
    expect(task.pinned).toBe(false);
  });

  it('does not queue when the thread is not found in the database', async () => {
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(null) as any);
    spyOn(Actions, 'queueTask');

    PinStore.pin('ghost');
    await flush();

    expect(Actions.queueTask).not.toHaveBeenCalled();
  });

  describe('one-time migration of pre-existing local pins', () => {
    const STORAGE_KEY = 'actuna.pinned-threads';
    const MIGRATED_KEY = 'actuna.pinned-migrated-v46';

    it('pushes cached local pins to the server on first init, then sets the guard', async () => {
      PinStore._reset();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          ['old-1', 1],
          ['old-2', 2],
        ])
      );
      spyOn(DatabaseStore, 'find').andReturn(
        Promise.resolve(new Thread({ id: 'resolved', accountId: 'a' } as any)) as any
      );
      spyOn(Actions, 'queueTask');

      PinStore.init();
      await flush();

      expect((Actions.queueTask as any).callCount).toBe(2);
      expect(localStorage.getItem(MIGRATED_KEY)).toBeTruthy();
    });

    it('does not re-migrate when the guard flag is already set', async () => {
      PinStore._reset();
      localStorage.setItem(STORAGE_KEY, JSON.stringify([['old-1', 1]]));
      localStorage.setItem(MIGRATED_KEY, '1');
      spyOn(DatabaseStore, 'find').andReturn(
        Promise.resolve(new Thread({ id: 'x' } as any)) as any
      );
      spyOn(Actions, 'queueTask');

      PinStore.init();
      await flush();

      expect((Actions.queueTask as any).callCount).toBe(0);
    });
  });
});
