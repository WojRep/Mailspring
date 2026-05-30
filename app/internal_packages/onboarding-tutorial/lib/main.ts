/**
 * Onboarding Tutorial plugin entry — bilet MVP #110.
 */

import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import OnboardingTutorialOverlay from './onboarding-tutorial-overlay';
import { TutorialStore } from './tutorial-store';
import { TUTORIAL_STEPS, TOTAL_STEPS } from './tutorial-steps';

export function activate() {
  TutorialStore.init();

  // Mount overlay w Sheet.Global.Footer — visible gdy tutorial in_progress.
  // Plan v1.0 #110 + mockup 22-onboarding-tutorial.html.
  ComponentRegistry.register(OnboardingTutorialOverlay, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'tutorial:start',
      label: 'Rozpocznij tutorial / Start onboarding tutorial',
      section: 'Help',
      keywords: ['tutorial', 'onboarding', 'start', 'pomoc'],
      handler: () => startTutorial(),
    });
    palette.register({
      id: 'tutorial:restart',
      label: 'Zrestartuj tutorial od początku',
      section: 'Help',
      keywords: ['tutorial', 'restart', 'reset'],
      handler: () => TutorialStore.restart(),
    });
    palette.register({
      id: 'tutorial:skip',
      label: 'Pomiń tutorial (skip all)',
      section: 'Help',
      keywords: ['tutorial', 'skip', 'pomiń'],
      handler: () => TutorialStore.skipAll(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.tutorial = {
    Store: TutorialStore,
    steps: TUTORIAL_STEPS,
    totalSteps: TOTAL_STEPS,
  };
}

export function deactivate() {
  ComponentRegistry.unregister(OnboardingTutorialOverlay);
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    ['tutorial:start', 'tutorial:restart', 'tutorial:skip'].forEach(id => palette.unregister(id));
  }
  if ((window as any).AppEnv?.tutorial) {
    delete (window as any).AppEnv.tutorial;
  }
}

function startTutorial(): void {
  const locale: 'pl' | 'en' = (((window as any).AppEnv?.config?.get('locale') || 'pl').startsWith('pl')) ? 'pl' : 'en';
  TutorialStore.start(locale);
}

export type { TutorialStep } from './tutorial-steps';
export type { TutorialStatus, TutorialState } from './tutorial-store';
