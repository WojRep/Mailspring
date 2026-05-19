import {
  LockStateManager,
  DEFAULT_LOCK_CONFIG,
  Scheduler,
} from '../../src/browser/lock-state-manager';

// Ticket 46 sub-faza 46b — Tier B lock/unlock state machine.
// Per analysis/13-sqlcipher-migration-design.md §3 Tier B lock triggers.
//
// The idle timer is driven by an injected FakeScheduler so timeouts
// fire deterministically without real wall-clock waits.

class FakeScheduler implements Scheduler {
  private _next = 1;
  private _timers = new Map<number, () => void>();

  set(fn: () => void, _ms: number): number {
    const id = this._next++;
    this._timers.set(id, fn);
    return id;
  }

  clear(handle: number): void {
    this._timers.delete(handle);
  }

  /** Fire a specific timer id (no-op if it was cleared). */
  fire(id: number): void {
    const fn = this._timers.get(id);
    if (fn) {
      this._timers.delete(id);
      fn();
    }
  }

  get pendingCount(): number {
    return this._timers.size;
  }
}

describe('LockStateManager (ticket 46b)', () => {
  let sched: FakeScheduler;

  beforeEach(() => {
    sched = new FakeScheduler();
  });

  it('starts UNLOCKED with an armed idle timer', () => {
    const m = new LockStateManager({}, sched);
    expect(m.state).toBe('UNLOCKED');
    expect(m.isLocked()).toBe(false);
    expect(sched.pendingCount).toBe(1);
  });

  it('exposes the default config (15 min, suspend, screen-lock)', () => {
    const m = new LockStateManager({}, sched);
    expect(m.config).toEqual(DEFAULT_LOCK_CONFIG);
  });

  describe('idle timeout', () => {
    it('locks with reason idle-timeout when the timer fires', () => {
      const m = new LockStateManager({}, sched);
      let reason: string | undefined;
      m.on('locked', (r) => {
        reason = r;
      });
      sched.fire(1);
      expect(m.state).toBe('LOCKED');
      expect(reason).toBe('idle-timeout');
    });

    it('resets the timer on user activity (old timer is cancelled)', () => {
      const m = new LockStateManager({}, sched);
      m.noteActivity(); // cancels timer 1, arms timer 2
      sched.fire(1); // stale timer — must not lock
      expect(m.state).toBe('UNLOCKED');
      sched.fire(2); // current timer — locks
      expect(m.state).toBe('LOCKED');
    });

    it('does not arm an idle timer when idleMs is 0 ("never")', () => {
      const m = new LockStateManager({ idleMs: 0 }, sched);
      expect(sched.pendingCount).toBe(0);
    });
  });

  describe('suspend / screen-lock triggers', () => {
    it('locks on suspend when lockOnSuspend is true', () => {
      const m = new LockStateManager({}, sched);
      m.onSuspend();
      expect(m.state).toBe('LOCKED');
    });

    it('ignores suspend when lockOnSuspend is false', () => {
      const m = new LockStateManager({ lockOnSuspend: false }, sched);
      m.onSuspend();
      expect(m.state).toBe('UNLOCKED');
    });

    it('locks on screen-lock when lockOnScreenLock is true', () => {
      const m = new LockStateManager({}, sched);
      m.onScreenLock();
      expect(m.state).toBe('LOCKED');
    });

    it('ignores screen-lock when lockOnScreenLock is false', () => {
      const m = new LockStateManager({ lockOnScreenLock: false }, sched);
      m.onScreenLock();
      expect(m.state).toBe('UNLOCKED');
    });
  });

  describe('manual lock / unlock', () => {
    it('lockNow locks with reason manual', () => {
      const m = new LockStateManager({}, sched);
      let reason: string | undefined;
      m.on('locked', (r) => {
        reason = r;
      });
      m.lockNow();
      expect(m.state).toBe('LOCKED');
      expect(reason).toBe('manual');
    });

    it('unlock returns to UNLOCKED and re-arms the idle timer', () => {
      const m = new LockStateManager({}, sched);
      m.lockNow();
      const before = sched.pendingCount;
      m.unlock();
      expect(m.state).toBe('UNLOCKED');
      expect(sched.pendingCount).toBe(before + 1);
    });
  });

  describe('locked state ignores activity', () => {
    it('does not unlock on user activity while LOCKED', () => {
      const m = new LockStateManager({}, sched);
      m.lockNow();
      m.noteActivity();
      expect(m.state).toBe('LOCKED');
    });

    it('arms no idle timer while LOCKED', () => {
      const m = new LockStateManager({}, sched);
      m.lockNow();
      expect(sched.pendingCount).toBe(0);
    });
  });

  describe('idempotence', () => {
    it('a second lock() emits no further locked event', () => {
      const m = new LockStateManager({}, sched);
      let count = 0;
      m.on('locked', () => {
        count += 1;
      });
      m.lockNow();
      m.lockNow();
      expect(count).toBe(1);
    });

    it('unlock() while already UNLOCKED emits no unlocked event', () => {
      const m = new LockStateManager({}, sched);
      let count = 0;
      m.on('unlocked', () => {
        count += 1;
      });
      m.unlock();
      expect(count).toBe(0);
    });
  });

  describe('configure', () => {
    it('emits config-changed and applies the new idle timeout', () => {
      const m = new LockStateManager({}, sched);
      let emitted: any;
      m.on('config-changed', (c) => {
        emitted = c;
      });
      m.configure({ idleMs: 60000 });
      expect(emitted.idleMs).toBe(60000);
      expect(m.config.idleMs).toBe(60000);
    });

    it('re-arms the idle timer when unlocked', () => {
      const m = new LockStateManager({}, sched);
      m.configure({ idleMs: 1000 }); // cancels timer 1, arms timer 2
      sched.fire(1);
      expect(m.state).toBe('UNLOCKED');
      sched.fire(2);
      expect(m.state).toBe('LOCKED');
    });
  });
});
