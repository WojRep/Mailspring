/**
 * Onboarding Tutorial Store — bilet MVP #110.
 *
 * Tutorial state: current step, completed steps, skipped, completed flag.
 * Manual control: start, advance, completeStep, skip, restart.
 * UI ticket implementuje React modal z 10 etapów Vim-tutorial analog.
 */

import { TUTORIAL_STEPS, TOTAL_STEPS, TutorialStep } from './tutorial-steps';

export type TutorialStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface TutorialState {
  status: TutorialStatus;
  /** Current step index (0..9). Undefined gdy status='not_started' / 'completed' / 'skipped'. */
  currentStepId?: number;
  /** Completed step ids set. */
  completedSteps: number[];
  startedAt?: number;
  completedAt?: number;
  /** Locale wybrane na czas tutoriala. */
  locale: 'pl' | 'en';
}

const STORAGE_KEY = 'actuna.onboarding-tutorial';

class TutorialStoreImpl {
  private _state: TutorialState = {
    status: 'not_started',
    completedSteps: [],
    locale: 'pl',
  };
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === State ===

  getState(): TutorialState {
    return {
      status: this._state.status,
      currentStepId: this._state.currentStepId,
      completedSteps: [...this._state.completedSteps],
      startedAt: this._state.startedAt,
      completedAt: this._state.completedAt,
      locale: this._state.locale,
    };
  }

  setLocale(locale: 'pl' | 'en'): void {
    this._state.locale = locale;
    this._save();
    this._emit();
  }

  // === Control ===

  /** Start tutorial — ustawia status, current step = 0 (lub continue od last incomplete). */
  start(locale: 'pl' | 'en' = 'pl'): void {
    this._state.status = 'in_progress';
    this._state.locale = locale;
    if (!this._state.startedAt) this._state.startedAt = Date.now();
    this._state.currentStepId = this._firstIncompleteStep();
    this._save();
    this._emit();
  }

  /** Mark current step completed + auto-advance do next incomplete (lub mark whole tutorial complete). */
  completeStep(stepId: number): void {
    if (!this._state.completedSteps.includes(stepId)) {
      this._state.completedSteps.push(stepId);
    }
    if (this._state.completedSteps.length >= TOTAL_STEPS) {
      this._state.status = 'completed';
      this._state.currentStepId = undefined;
      this._state.completedAt = Date.now();
    } else {
      this._state.currentStepId = this._firstIncompleteStep();
    }
    this._save();
    this._emit();
  }

  /** Manual advance bez complete (skip pojedynczy step). */
  skipCurrentStep(): void {
    if (this._state.currentStepId === undefined) return;
    const cur = this._state.currentStepId;
    // Mark as completed bez wykonywania
    if (!this._state.completedSteps.includes(cur)) {
      this._state.completedSteps.push(cur);
    }
    if (this._state.completedSteps.length >= TOTAL_STEPS) {
      this._state.status = 'completed';
      this._state.currentStepId = undefined;
      this._state.completedAt = Date.now();
    } else {
      this._state.currentStepId = this._firstIncompleteStep();
    }
    this._save();
    this._emit();
  }

  /** Skip whole tutorial. */
  skipAll(): void {
    this._state.status = 'skipped';
    this._state.currentStepId = undefined;
    this._save();
    this._emit();
  }

  /** Restart — wyczyść progress + start od 0. */
  restart(locale: 'pl' | 'en' = this._state.locale): void {
    this._state = {
      status: 'in_progress',
      currentStepId: 0,
      completedSteps: [],
      startedAt: Date.now(),
      completedAt: undefined,
      locale,
    };
    this._save();
    this._emit();
  }

  // === Query ===

  /** True gdy nigdy nie uruchomiono — UI pokazuje "Chcesz nauczyć się?" modal. */
  shouldOfferOnFirstLaunch(): boolean {
    return this._state.status === 'not_started';
  }

  /** Current step object lub null gdy completed/skipped/not_started. */
  getCurrentStep(): TutorialStep | null {
    if (this._state.currentStepId === undefined) return null;
    return TUTORIAL_STEPS.find(s => s.id === this._state.currentStepId) || null;
  }

  isStepCompleted(stepId: number): boolean {
    return this._state.completedSteps.includes(stepId);
  }

  progress(): { completed: number; total: number; percent: number } {
    const completed = this._state.completedSteps.length;
    return {
      completed,
      total: TOTAL_STEPS,
      percent: Math.round((completed / TOTAL_STEPS) * 100),
    };
  }

  getAllSteps(): TutorialStep[] {
    return [...TUTORIAL_STEPS];
  }

  /** Verify step completion — caller dostarcza command name (np. po dispatched action).
   *  Returns true gdy current step expects this command — wtedy auto completeStep. */
  verifyAndCompleteByCommand(command: string): boolean {
    const cur = this.getCurrentStep();
    if (!cur) return false;
    if (cur.command === command) {
      this.completeStep(cur.id);
      return true;
    }
    return false;
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._state = { status: 'not_started', completedSteps: [], locale: 'pl' };
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  // === internals ===

  private _firstIncompleteStep(): number {
    for (const step of TUTORIAL_STEPS) {
      if (!this._state.completedSteps.includes(step.id)) return step.id;
    }
    return TUTORIAL_STEPS[0].id;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<TutorialState>;
      if (s.status === 'not_started' || s.status === 'in_progress' || s.status === 'completed' || s.status === 'skipped') {
        this._state.status = s.status;
      }
      if (typeof s.currentStepId === 'number') this._state.currentStepId = s.currentStepId;
      if (Array.isArray(s.completedSteps)) {
        this._state.completedSteps = s.completedSteps.filter(id => typeof id === 'number' && id >= 0 && id < TOTAL_STEPS);
      }
      if (typeof s.startedAt === 'number') this._state.startedAt = s.startedAt;
      if (typeof s.completedAt === 'number') this._state.completedAt = s.completedAt;
      if (s.locale === 'pl' || s.locale === 'en') this._state.locale = s.locale;
    } catch (e) {
      console.error('[Tutorial] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    } catch (e) {
      console.error('[Tutorial] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[Tutorial] listener error', e); }
    }
  }
}

export const TutorialStore = new TutorialStoreImpl();
