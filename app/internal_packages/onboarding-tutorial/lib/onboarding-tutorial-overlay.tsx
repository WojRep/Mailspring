/**
 * OnboardingTutorialOverlay — Vim-tutorial analog overlay #110.
 *
 * Plan v1.0 mockup design/mockups/22-onboarding-tutorial.html.
 *
 * Funkcje:
 *  - Overlay widoczny gdy TutorialStore.getState().status === 'in_progress'
 *  - Pokazuje current step: prompt + hint + shortcut hint + progress (N/M)
 *  - "Skip step" → TutorialStore.skipCurrentStep()
 *  - "Skip all" → TutorialStore.skipAll()
 *  - role="dialog" + aria-modal + aria-label PL+EN
 *  - Auto-rerender on TutorialStore.listen() change
 *
 * Hide gdy status NIE 'in_progress' (not_started / completed / skipped).
 */

import React from 'react';
import { TutorialStore, TutorialState } from './tutorial-store';
import { TutorialStep } from './tutorial-steps';

const { localized } = require('actunamail-exports');

interface State {
  status: TutorialState['status'];
  locale: 'pl' | 'en';
  currentStep: TutorialStep | null;
  progress: { completed: number; total: number; percent: number };
}

export default class OnboardingTutorialOverlay extends React.Component<{}, State> {
  static displayName = 'OnboardingTutorialOverlay';
  static containerRequired = false;

  state: State = this._readState();

  private _unsubscribe: (() => void) | null = null;

  componentDidMount() {
    this._unsubscribe = TutorialStore.listen(() => this.setState(this._readState()));
    this.setState(this._readState());
  }

  componentWillUnmount() {
    if (this._unsubscribe) this._unsubscribe();
  }

  private _readState(): State {
    const s = TutorialStore.getState();
    return {
      status: s.status,
      locale: s.locale,
      currentStep: TutorialStore.getCurrentStep(),
      progress: TutorialStore.progress(),
    };
  }

  private _onSkipStep = (): void => {
    TutorialStore.skipCurrentStep();
  };

  private _onSkipAll = (): void => {
    TutorialStore.skipAll();
  };

  render() {
    if (this.state.status !== 'in_progress') return null;
    const step = this.state.currentStep;
    if (!step) return null;

    const isPl = this.state.locale === 'pl';
    const prompt = isPl ? step.prompt_pl : step.prompt_en;
    const hint = isPl ? step.hint_pl : step.hint_en;
    const progressLabel = localized('Krok {N} z {M} / Step {N} of {M}')
      .replace(/\{N\}/g, String(this.state.progress.completed + 1))
      .replace(/\{M\}/g, String(this.state.progress.total));
    const ariaLabel = localized('Samouczek ActunaMail / ActunaMail tutorial');
    const skipStepLabel = localized('Pomiń krok / Skip step');
    const skipAllLabel = localized('Pomiń wszystko / Skip all');
    const shortcutLabel = localized('Skrót / Shortcut');

    return (
      <div
        className="onboarding-tutorial-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <div className="onboarding-tutorial-content">
          <div className="onboarding-tutorial-progress" aria-live="polite">
            {progressLabel}
          </div>
          <p className="onboarding-tutorial-prompt">{prompt}</p>
          <p className="onboarding-tutorial-hint">{hint}</p>
          {step.shortcut && (
            <p className="onboarding-tutorial-shortcut">
              <span className="onboarding-tutorial-shortcut-label">{shortcutLabel}:</span>{' '}
              <kbd>{step.shortcut}</kbd>
            </p>
          )}
          <div className="onboarding-tutorial-actions">
            <button
              type="button"
              className="onboarding-tutorial-skip-step"
              onClick={this._onSkipStep}
            >
              {skipStepLabel}
            </button>
            <button
              type="button"
              className="onboarding-tutorial-skip-all"
              onClick={this._onSkipAll}
            >
              {skipAllLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
