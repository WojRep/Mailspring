import { EventEmitter } from 'events';

/**
 * SQLCipher Tier B lock/unlock state machine (ticket 46b).
 *
 * Main-process, Electron-free: this class only owns the LOCKED/UNLOCKED
 * state and the idle timer. The wiring layer (application.ts) translates
 * its `locked` / `unlocked` events into `KeyManager.lock()`, mailsync
 * teardown, and the `db-lock-state-changed` IPC broadcast — keeping the
 * transition logic unit-testable with an injected fake scheduler.
 *
 * Transitions:
 *   UNLOCKED --idle timeout / suspend / screen-lock / lockNow--> LOCKED
 *   LOCKED   --unlock()-------------------------------------->  UNLOCKED
 *
 * While LOCKED, user activity does NOT unlock — only an explicit
 * `unlock()` (driven by a correct master password) does. Per
 * analysis/13-sqlcipher-migration-design.md §3 Tier B lock triggers.
 */

export type LockState = 'LOCKED' | 'UNLOCKED';

export type LockReason = 'idle-timeout' | 'suspend' | 'screen-lock' | 'manual';

export interface LockConfig {
  /** Idle time before an automatic lock, in milliseconds. */
  idleMs: number;
  /** Lock when the OS reports a power-suspend event. */
  lockOnSuspend: boolean;
  /** Lock when the OS screen lock / screensaver engages. */
  lockOnScreenLock: boolean;
}

/** Memo §3 / ticket 46b default: 15-minute idle, lock on suspend + screen-lock. */
export const DEFAULT_LOCK_CONFIG: LockConfig = {
  idleMs: 15 * 60 * 1000,
  lockOnSuspend: true,
  lockOnScreenLock: true,
};

/** Idle-timeout options offered in Preferences > Security (minutes). */
export const IDLE_TIMEOUT_CHOICES_MIN = [1, 5, 15, 30, 60];

/** Injectable timer so specs can drive the idle timeout deterministically. */
export interface Scheduler {
  set(fn: () => void, ms: number): any;
  clear(handle: any): void;
}

const REAL_SCHEDULER: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
};

export class LockStateManager extends EventEmitter {
  private _state: LockState = 'UNLOCKED';
  private _config: LockConfig;
  private _scheduler: Scheduler;
  private _idleHandle: any = null;

  constructor(config: Partial<LockConfig> = {}, scheduler: Scheduler = REAL_SCHEDULER) {
    super();
    this._config = { ...DEFAULT_LOCK_CONFIG, ...config };
    this._scheduler = scheduler;
    this._armIdleTimer();
  }

  get state(): LockState {
    return this._state;
  }

  get config(): LockConfig {
    return { ...this._config };
  }

  isLocked(): boolean {
    return this._state === 'LOCKED';
  }

  /** Apply a partial config change; restarts the idle timer if unlocked. */
  configure(partial: Partial<LockConfig>): void {
    this._config = { ...this._config, ...partial };
    if (this._state === 'UNLOCKED') {
      this._armIdleTimer();
    }
    this.emit('config-changed', this.config);
  }

  /** Note user activity — resets the idle timer. No-op while LOCKED. */
  noteActivity(): void {
    if (this._state === 'UNLOCKED') {
      this._armIdleTimer();
    }
  }

  /** OS power-suspend hook. */
  onSuspend(): void {
    if (this._config.lockOnSuspend) {
      this.lock('suspend');
    }
  }

  /** OS screen-lock / screensaver hook. */
  onScreenLock(): void {
    if (this._config.lockOnScreenLock) {
      this.lock('screen-lock');
    }
  }

  /** Explicit user-triggered lock ("Lock now" button). */
  lockNow(): void {
    this.lock('manual');
  }

  /** Transition to LOCKED. Idempotent. */
  lock(reason: LockReason): void {
    if (this._state === 'LOCKED') {
      return;
    }
    this._state = 'LOCKED';
    this._clearIdleTimer();
    this.emit('locked', reason);
    this.emit('state-changed', this._state, reason);
  }

  /** Transition to UNLOCKED and re-arm the idle timer. Idempotent. */
  unlock(): void {
    if (this._state === 'UNLOCKED') {
      return;
    }
    this._state = 'UNLOCKED';
    this._armIdleTimer();
    this.emit('unlocked');
    this.emit('state-changed', this._state);
  }

  /** Stop the idle timer and remove listeners (app shutdown). */
  dispose(): void {
    this._clearIdleTimer();
    this.removeAllListeners();
  }

  private _armIdleTimer(): void {
    this._clearIdleTimer();
    if (this._config.idleMs > 0) {
      this._idleHandle = this._scheduler.set(() => {
        this._idleHandle = null;
        this.lock('idle-timeout');
      }, this._config.idleMs);
    }
  }

  private _clearIdleTimer(): void {
    if (this._idleHandle !== null) {
      this._scheduler.clear(this._idleHandle);
      this._idleHandle = null;
    }
  }
}
