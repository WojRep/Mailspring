/**
 * Bilet MVP #91 — Background scheduler unit tests.
 */

import { SchedulerStore, BackgroundScheduler } from '../internal_packages/background-scheduler/lib/scheduler-store';

describe('Background scheduler — bilet MVP #91', () => {

  beforeEach(() => {
    SchedulerStore._reset();
  });

  it('schedule returns id', () => {
    const id = SchedulerStore.schedule({
      type: 'snooze',
      fireAt: Date.now() + 60_000,
      payload: { mailId: 'm1' },
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('list returns scheduled actions', () => {
    SchedulerStore.schedule({
      type: 'snooze',
      fireAt: Date.now() + 60_000,
      payload: {},
    });
    SchedulerStore.schedule({
      type: 'send-later',
      fireAt: Date.now() + 120_000,
      payload: {},
    });
    expect(SchedulerStore.list().length).toBe(2);
  });

  it('list filtered by type', () => {
    SchedulerStore.schedule({ type: 'snooze', fireAt: Date.now() + 60_000, payload: {} });
    SchedulerStore.schedule({ type: 'send-later', fireAt: Date.now() + 60_000, payload: {} });
    expect(SchedulerStore.list({ type: 'snooze' }).length).toBe(1);
    expect(SchedulerStore.list({ type: 'send-later' }).length).toBe(1);
  });

  it('list sorted by fireAt ascending', () => {
    const t1 = Date.now() + 60_000;
    const t2 = Date.now() + 30_000;
    const t3 = Date.now() + 90_000;
    SchedulerStore.schedule({ type: 'snooze', fireAt: t1, payload: {} });
    SchedulerStore.schedule({ type: 'snooze', fireAt: t2, payload: {} });
    SchedulerStore.schedule({ type: 'snooze', fireAt: t3, payload: {} });
    const list = SchedulerStore.list();
    expect(list[0].fireAt).toBe(t2);
    expect(list[1].fireAt).toBe(t1);
    expect(list[2].fireAt).toBe(t3);
  });

  it('cancel changes status to cancelled', () => {
    const id = SchedulerStore.schedule({
      type: 'snooze',
      fireAt: Date.now() + 60_000,
      payload: {},
    });
    expect(SchedulerStore.cancel(id)).toBe(true);
    expect(SchedulerStore.get(id)?.status).toBe('cancelled');
  });

  it('cancel returns false for unknown id', () => {
    expect(SchedulerStore.cancel('nonexistent')).toBe(false);
  });

  it('cancel idempotent — second call returns false', () => {
    const id = SchedulerStore.schedule({ type: 'snooze', fireAt: Date.now() + 60_000, payload: {} });
    expect(SchedulerStore.cancel(id)).toBe(true);
    expect(SchedulerStore.cancel(id)).toBe(false);
  });

  it('fireNow executes handler and marks done', async () => {
    let handlerCalled = false;
    SchedulerStore.registerHandler('custom', (action) => {
      handlerCalled = true;
      expect(action.payload.foo).toBe('bar');
    });
    const id = SchedulerStore.schedule({
      type: 'custom',
      fireAt: Date.now() + 60_000,
      payload: { foo: 'bar' },
    });
    const result = await SchedulerStore.fireNow(id);
    expect(result).toBe(true);
    expect(handlerCalled).toBe(true);
    expect(SchedulerStore.get(id)?.status).toBe('done');
    expect(SchedulerStore.get(id)?.firedAt).toBeGreaterThan(0);
  });

  it('fire is idempotent — re-fire after done is no-op', async () => {
    let callCount = 0;
    SchedulerStore.registerHandler('custom', () => { callCount++; });
    const id = SchedulerStore.schedule({ type: 'custom', fireAt: Date.now() + 60_000, payload: {} });
    await SchedulerStore.fireNow(id);
    await SchedulerStore.fireNow(id);
    await SchedulerStore.fireNow(id);
    expect(callCount).toBe(1);
  });

  it('fire without handler marks failed', async () => {
    spyOn(console, 'warn');
    const id = SchedulerStore.schedule({ type: 'custom', fireAt: Date.now() + 60_000, payload: {} });
    const result = await SchedulerStore.fireNow(id);
    expect(result).toBe(false);
    expect(SchedulerStore.get(id)?.status).toBe('failed');
    expect(SchedulerStore.get(id)?.failureReason).toContain('no handler');
  });

  it('fire with throwing handler marks failed with reason', async () => {
    spyOn(console, 'error');
    SchedulerStore.registerHandler('custom', () => {
      throw new Error('boom');
    });
    const id = SchedulerStore.schedule({ type: 'custom', fireAt: Date.now() + 60_000, payload: {} });
    await SchedulerStore.fireNow(id);
    expect(SchedulerStore.get(id)?.status).toBe('failed');
    expect(SchedulerStore.get(id)?.failureReason).toBe('boom');
  });

  it('stats counts per status', async () => {
    SchedulerStore.registerHandler('custom', () => {});
    const id1 = SchedulerStore.schedule({ type: 'custom', fireAt: Date.now() + 60_000, payload: {} });
    SchedulerStore.schedule({ type: 'custom', fireAt: Date.now() + 60_000, payload: {} });
    const id3 = SchedulerStore.schedule({ type: 'custom', fireAt: Date.now() + 60_000, payload: {} });
    await SchedulerStore.fireNow(id1);
    SchedulerStore.cancel(id3);
    const stats = SchedulerStore.stats();
    expect(stats.done).toBe(1);
    expect(stats.cancelled).toBe(1);
    expect(stats.pending).toBe(1);
  });

  it('listen notifies on changes', () => {
    let count = 0;
    const unsub = SchedulerStore.listen(() => count++);
    SchedulerStore.schedule({ type: 'snooze', fireAt: Date.now() + 60_000, payload: {} });
    expect((count) >= (1)).toBe(true);
    unsub();
  });

  it('persists to localStorage', () => {
    const id = SchedulerStore.schedule({ type: 'snooze', fireAt: Date.now() + 60_000, payload: { x: 1 } });
    expect(typeof localStorage).toBe('object');
    const raw = localStorage.getItem('actuna.scheduler.actions');
    expect(raw).toBeTruthy();
    expect(raw).toContain(id);
  });

  it('purgeOld removes completed actions older than retention', async () => {
    SchedulerStore.registerHandler('custom', () => {});
    const id = SchedulerStore.schedule({ type: 'custom', fireAt: Date.now() + 60_000, payload: {} });
    await SchedulerStore.fireNow(id);
    // Manipulate firedAt to be 60 dni temu
    const action = SchedulerStore.get(id)!;
    action.firedAt = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const purged = SchedulerStore.purgeOld(30);
    expect(purged).toBe(1);
    expect(SchedulerStore.get(id)).toBeUndefined();
  });

  it('purgeOld keeps recent completed', async () => {
    SchedulerStore.registerHandler('custom', () => {});
    const id = SchedulerStore.schedule({ type: 'custom', fireAt: Date.now() + 60_000, payload: {} });
    await SchedulerStore.fireNow(id);
    const purged = SchedulerStore.purgeOld(30);
    expect(purged).toBe(0);
    expect(SchedulerStore.get(id)).toBeDefined();
  });

  it('purgeOld never removes pending actions', () => {
    SchedulerStore.schedule({ type: 'snooze', fireAt: Date.now() + 60_000, payload: {} });
    const purged = SchedulerStore.purgeOld(0); // retention 0 dni
    expect(purged).toBe(0);
  });

  describe('public BackgroundScheduler API', () => {
    it('exposes schedule/cancel/list/get/stats/registerHandler/fireNow/purgeOld', () => {
      expect(typeof BackgroundScheduler.schedule).toBe('function');
      expect(typeof BackgroundScheduler.cancel).toBe('function');
      expect(typeof BackgroundScheduler.list).toBe('function');
      expect(typeof BackgroundScheduler.get).toBe('function');
      expect(typeof BackgroundScheduler.stats).toBe('function');
      expect(typeof BackgroundScheduler.registerHandler).toBe('function');
      expect(typeof BackgroundScheduler.fireNow).toBe('function');
      expect(typeof BackgroundScheduler.purgeOld).toBe('function');
    });

    it('public API delegates to store', () => {
      const id = BackgroundScheduler.schedule({ type: 'snooze', fireAt: Date.now() + 60_000, payload: {} });
      expect(BackgroundScheduler.get(id)).toBeDefined();
      expect(BackgroundScheduler.list().length).toBe(1);
      BackgroundScheduler.cancel(id);
      expect(BackgroundScheduler.get(id)?.status).toBe('cancelled');
    });
  });
});
