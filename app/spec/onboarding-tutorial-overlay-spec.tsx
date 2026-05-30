/**
 * RED test — OnboardingTutorialOverlay (#110 UI) per plan v1.0 mockup
 * design/mockups/22-onboarding-tutorial.html. Vim-tutorial state machine.
 *
 * Per user mandate 2026-05-30 (automatycznie TDD).
 */

import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let OnboardingTutorialOverlay: any = null;
try {
  OnboardingTutorialOverlay = require('../internal_packages/onboarding-tutorial/lib/onboarding-tutorial-overlay').default;
} catch (e) { /* RED phase */ }

const { TutorialStore } = require('../internal_packages/onboarding-tutorial/lib/tutorial-store');

describe('OnboardingTutorialOverlay UI — #110 plan v1.0', () => {
  beforeEach(() => {
    if (TutorialStore._reset) {
      TutorialStore._reset();
    }
    TutorialStore.init();
  });

  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(OnboardingTutorialOverlay).not.toBeNull();
    expect(typeof OnboardingTutorialOverlay).toBe('function');
  });

  it('renderuje NIC gdy tutorial NIE in_progress', () => {
    if (!OnboardingTutorialOverlay) return;
    // Default state: not_started
    const { container } = render(<OnboardingTutorialOverlay />);
    expect(container.querySelector('.onboarding-tutorial-overlay')).toBeNull();
  });

  it('renderuje overlay gdy tutorial in_progress', () => {
    if (!OnboardingTutorialOverlay) return;
    TutorialStore.start('pl');
    const { container } = render(<OnboardingTutorialOverlay />);
    expect(container.querySelector('.onboarding-tutorial-overlay')).not.toBeNull();
  });

  it('overlay ma role=dialog + aria-modal + aria-label', () => {
    if (!OnboardingTutorialOverlay) return;
    TutorialStore.start('pl');
    const { container } = render(<OnboardingTutorialOverlay />);
    const overlay = container.querySelector('.onboarding-tutorial-overlay') as HTMLElement;
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-label')).toMatch(/.+/);
  });

  it('renderuje step prompt (pl lub en) z TutorialStore.getCurrentStep()', () => {
    if (!OnboardingTutorialOverlay) return;
    TutorialStore.start('pl');
    const step = TutorialStore.getCurrentStep();
    const { container } = render(<OnboardingTutorialOverlay />);
    const html = container.innerHTML;
    if (step) {
      const hasPrompt = (step.prompt_pl && html.includes(step.prompt_pl)) ||
                        (step.prompt_en && html.includes(step.prompt_en));
      expect(hasPrompt).toBe(true);
    }
  });

  it('renderuje progress indicator (krok N z M)', () => {
    if (!OnboardingTutorialOverlay) return;
    TutorialStore.start('pl');
    const { container } = render(<OnboardingTutorialOverlay />);
    const progress = container.querySelector('.onboarding-tutorial-progress');
    expect(progress).not.toBeNull();
    expect(progress!.textContent).toMatch(/\d+/);
  });

  it('click "Pomiń krok / Skip step" wywołuje TutorialStore.skipCurrentStep', () => {
    if (!OnboardingTutorialOverlay) return;
    TutorialStore.start('pl');
    const spy = spyOn(TutorialStore, 'skipCurrentStep').andCallThrough();
    const { container } = render(<OnboardingTutorialOverlay />);
    const skipBtn = container.querySelector('.onboarding-tutorial-skip-step') as HTMLButtonElement;
    expect(skipBtn).not.toBeNull();
    fireEvent.click(skipBtn);
    expect(spy).toHaveBeenCalled();
  });

  it('click "Pomiń wszystko / Skip all" wywołuje TutorialStore.skipAll', () => {
    if (!OnboardingTutorialOverlay) return;
    TutorialStore.start('pl');
    const spy = spyOn(TutorialStore, 'skipAll').andCallThrough();
    const { container } = render(<OnboardingTutorialOverlay />);
    const skipAllBtn = container.querySelector('.onboarding-tutorial-skip-all') as HTMLButtonElement;
    expect(skipAllBtn).not.toBeNull();
    fireEvent.click(skipAllBtn);
    expect(spy).toHaveBeenCalled();
  });
});
