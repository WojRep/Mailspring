/**
 * Bilet MVP #110 — Onboarding Tutorial unit tests.
 */

import { TutorialStore } from '../internal_packages/onboarding-tutorial/lib/tutorial-store';
import { TUTORIAL_STEPS, TOTAL_STEPS } from '../internal_packages/onboarding-tutorial/lib/tutorial-steps';

describe('Onboarding Tutorial — bilet MVP #110', () => {

  beforeEach(() => {
    TutorialStore._reset();
    TutorialStore.init();
  });

  describe('TUTORIAL_STEPS — 10 etapów', () => {
    it('ma 10 etapów', () => {
      expect(TOTAL_STEPS).toBe(10);
      expect(TUTORIAL_STEPS.length).toBe(10);
    });

    it('każdy etap ma unique id 0..9', () => {
      const ids = TUTORIAL_STEPS.map(s => s.id).sort((a, b) => a - b);
      expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('każdy etap ma PL + EN prompt + hint', () => {
      for (const s of TUTORIAL_STEPS) {
        expect(s.prompt_pl).toBeTruthy();
        expect(s.prompt_en).toBeTruthy();
        expect(s.hint_pl).toBeTruthy();
        expect(s.hint_en).toBeTruthy();
        expect(s.shortcut).toBeTruthy();
        expect(s.command).toBeTruthy();
      }
    });

    it('etapy z depends_on_ticket referują shipped tickets', () => {
      const dependents = TUTORIAL_STEPS.filter(s => s.depends_on_ticket !== undefined);
      expect(dependents.length).toBeGreaterThan(0);
      // Snooze, tag, command palette, pin, contact card, search — wszystkie shipped w Faza D
      const tickets = dependents.map(s => s.depends_on_ticket);
      expect(tickets).toContain(89);  // command palette
      expect(tickets).toContain(98);  // tag
      expect(tickets).toContain(99);  // smart folder search
      expect(tickets).toContain(102); // contact card
      expect(tickets).toContain(104); // snooze
    });
  });

  describe('initial state', () => {
    it('status=not_started, no current step', () => {
      const state = TutorialStore.getState();
      expect(state.status).toBe('not_started');
      expect(state.currentStepId).toBeUndefined();
      expect(state.completedSteps).toEqual([]);
      expect(state.locale).toBe('pl');
    });

    it('shouldOfferOnFirstLaunch true gdy not_started', () => {
      expect(TutorialStore.shouldOfferOnFirstLaunch()).toBe(true);
    });
  });

  describe('start / completeStep / skip / restart', () => {
    it('start → status=in_progress + current step = 0', () => {
      TutorialStore.start('pl');
      const state = TutorialStore.getState();
      expect(state.status).toBe('in_progress');
      expect(state.currentStepId).toBe(0);
      expect(state.startedAt).toBeGreaterThan(0);
    });

    it('start z EN locale', () => {
      TutorialStore.start('en');
      expect(TutorialStore.getState().locale).toBe('en');
    });

    it('completeStep dodaje do completedSteps + advances do next', () => {
      TutorialStore.start();
      TutorialStore.completeStep(0);
      const state = TutorialStore.getState();
      expect(state.completedSteps).toEqual([0]);
      expect(state.currentStepId).toBe(1);
    });

    it('completeStep idempotent — duplikat nie dodaje', () => {
      TutorialStore.start();
      TutorialStore.completeStep(0);
      TutorialStore.completeStep(0);
      expect(TutorialStore.getState().completedSteps).toEqual([0]);
    });

    it('completeStep wszystkich → status=completed', () => {
      TutorialStore.start();
      for (let i = 0; i < TOTAL_STEPS; i++) {
        TutorialStore.completeStep(i);
      }
      const state = TutorialStore.getState();
      expect(state.status).toBe('completed');
      expect(state.currentStepId).toBeUndefined();
      expect(state.completedAt).toBeGreaterThan(0);
    });

    it('skipCurrentStep marks completed + advances', () => {
      TutorialStore.start();
      TutorialStore.skipCurrentStep();
      const state = TutorialStore.getState();
      expect(state.completedSteps).toContain(0);
      expect(state.currentStepId).toBe(1);
    });

    it('skipAll → status=skipped', () => {
      TutorialStore.start();
      TutorialStore.skipAll();
      expect(TutorialStore.getState().status).toBe('skipped');
      expect(TutorialStore.getState().currentStepId).toBeUndefined();
    });

    it('restart wymazuje progress', () => {
      TutorialStore.start();
      TutorialStore.completeStep(0);
      TutorialStore.completeStep(1);
      TutorialStore.restart();
      const state = TutorialStore.getState();
      expect(state.status).toBe('in_progress');
      expect(state.completedSteps).toEqual([]);
      expect(state.currentStepId).toBe(0);
    });

    it('shouldOfferOnFirstLaunch false po start', () => {
      TutorialStore.start();
      expect(TutorialStore.shouldOfferOnFirstLaunch()).toBe(false);
    });
  });

  describe('getCurrentStep + isStepCompleted', () => {
    it('getCurrentStep zwraca pełen step object', () => {
      TutorialStore.start();
      const cur = TutorialStore.getCurrentStep();
      expect(cur?.id).toBe(0);
      expect(cur?.shortcut).toBe('j');
      expect(cur?.command).toBe('core:next-item');
    });

    it('getCurrentStep null gdy completed', () => {
      TutorialStore.start();
      for (let i = 0; i < TOTAL_STEPS; i++) TutorialStore.completeStep(i);
      expect(TutorialStore.getCurrentStep()).toBeNull();
    });

    it('isStepCompleted', () => {
      TutorialStore.start();
      TutorialStore.completeStep(0);
      TutorialStore.completeStep(3);
      expect(TutorialStore.isStepCompleted(0)).toBe(true);
      expect(TutorialStore.isStepCompleted(1)).toBe(false);
      expect(TutorialStore.isStepCompleted(3)).toBe(true);
    });
  });

  describe('progress', () => {
    it('zwraca completed/total/percent', () => {
      TutorialStore.start();
      TutorialStore.completeStep(0);
      TutorialStore.completeStep(1);
      const p = TutorialStore.progress();
      expect(p.completed).toBe(2);
      expect(p.total).toBe(10);
      expect(p.percent).toBe(20);
    });

    it('progress 0% na początku', () => {
      expect(TutorialStore.progress().percent).toBe(0);
    });

    it('progress 100% po complete all', () => {
      TutorialStore.start();
      for (let i = 0; i < TOTAL_STEPS; i++) TutorialStore.completeStep(i);
      expect(TutorialStore.progress().percent).toBe(100);
    });
  });

  describe('verifyAndCompleteByCommand', () => {
    it('matches current step command → auto completes', () => {
      TutorialStore.start();
      const ok = TutorialStore.verifyAndCompleteByCommand('core:next-item');
      expect(ok).toBe(true);
      expect(TutorialStore.isStepCompleted(0)).toBe(true);
      expect(TutorialStore.getState().currentStepId).toBe(1);
    });

    it('NIE matches → false bez progressu', () => {
      TutorialStore.start();
      const ok = TutorialStore.verifyAndCompleteByCommand('some:other-command');
      expect(ok).toBe(false);
      expect(TutorialStore.isStepCompleted(0)).toBe(false);
    });

    it('null current step → false', () => {
      // bez start
      expect(TutorialStore.verifyAndCompleteByCommand('core:next-item')).toBe(false);
    });
  });

  describe('locale', () => {
    it('setLocale przełącza', () => {
      TutorialStore.setLocale('en');
      expect(TutorialStore.getState().locale).toBe('en');
    });
  });

  describe('persistence', () => {
    it('persists state', () => {
      TutorialStore.start('en');
      TutorialStore.completeStep(0);
      expect(localStorage.getItem('actuna.onboarding-tutorial')).toContain('in_progress');
    });

    it('load preserves progress', () => {
      TutorialStore.start();
      TutorialStore.completeStep(0);
      TutorialStore.completeStep(1);
      const raw = localStorage.getItem('actuna.onboarding-tutorial')!;
      TutorialStore._reset();
      localStorage.setItem('actuna.onboarding-tutorial', raw);
      TutorialStore.init();
      expect(TutorialStore.getState().completedSteps).toEqual([0, 1]);
      expect(TutorialStore.getState().status).toBe('in_progress');
    });

    it('load skip invalid step ids', () => {
      localStorage.setItem('actuna.onboarding-tutorial', JSON.stringify({
        status: 'in_progress',
        completedSteps: [0, 99, -1, 5],
        locale: 'pl',
      }));
      TutorialStore._reset();
      TutorialStore.init();
      expect(TutorialStore.getState().completedSteps.sort()).toEqual([0, 5]);
    });
  });

  describe('listen', () => {
    it('emit na start/complete/skip', () => {
      let n = 0;
      const unsub = TutorialStore.listen(() => n++);
      TutorialStore.start();
      TutorialStore.completeStep(0);
      TutorialStore.skipCurrentStep();
      expect(n).toBe(3);
      unsub();
    });
  });
});
