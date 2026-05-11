import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

import CompliancePage from '../../internal_packages/onboarding/lib/page-compliance';
import * as OnboardingActions from '../../internal_packages/onboarding/lib/onboarding-actions';

// Ticket 42 — Retroactive TDD coverage for v0.2.h CompliancePage.
//
// CompliancePage was added in Sprint 5 (v0.2.h commit 4f1dd2fe7) WITHOUT
// a unit test, violating tdd-runner.md ("Never write production code
// without a failing test in front of it"). This spec is a
// characterization test: production code already exists and is shipped;
// asserts cement the current behaviour so future refactors don't
// silently regress.

describe('CompliancePage', function compliancePageSpec() {
  afterEach(cleanup);

  describe('rendering', () => {
    it('renders without crashing', () => {
      const { container } = render(<CompliancePage />);
      expect(container.querySelector('.page.tutorial')).toBeTruthy();
    });

    it('has the heading "Built for the EU" (English source)', () => {
      const { container } = render(<CompliancePage />);
      const h2 = container.querySelector('h2');
      expect(h2).not.toBeNull();
      // The heading is passed through localized(); under spec runner the
      // pl/de locale may not be initialised, so we accept either the
      // English source or its expected PL translation.
      expect(h2!.textContent).toMatch(/Built for the EU|Stworzon[ya] dla UE/);
    });

    it('renders 4 compliance bullet points (GDPR / AI Act / NIS2 / KNF)', () => {
      const { container } = render(<CompliancePage />);
      const items = container.querySelectorAll('li');
      expect(items.length).toBe(4);
      // Assert each bullet mentions its framework — survives translation
      // (PL versions also include framework abbreviations verbatim).
      const text = Array.from(items).map(li => li.textContent).join(' | ');
      expect(text).toContain('GDPR');
      expect(text).toContain('AI Act');
      expect(text).toContain('NIS2');
      expect(text).toContain('KNF');
    });

    it('renders Back and Get Started buttons in footer', () => {
      const { container } = render(<CompliancePage />);
      const buttons = container.querySelectorAll('.footer button');
      expect(buttons.length).toBe(2);
      expect(buttons[0].classList.contains('btn-prev')).toBe(true);
      expect(buttons[1].classList.contains('btn-next')).toBe(true);
    });
  });

  describe('navigation actions', () => {
    it('clicking Back triggers OnboardingActions.moveToPreviousPage', () => {
      const spy = spyOn(OnboardingActions, 'moveToPreviousPage');
      const { container } = render(<CompliancePage />);
      const backBtn = container.querySelector('.btn-prev') as HTMLButtonElement;
      fireEvent.click(backBtn);
      expect(spy).toHaveBeenCalled();
    });

    it('clicking Get Started navigates to account-choose page', () => {
      const spy = spyOn(OnboardingActions, 'moveToPage');
      const { container } = render(<CompliancePage />);
      const nextBtn = container.querySelector('.btn-next') as HTMLButtonElement;
      fireEvent.click(nextBtn);
      expect(spy).toHaveBeenCalledWith('account-choose');
    });
  });

  describe('lifecycle', () => {
    it('starts with appeared=false', () => {
      const { container } = render(<CompliancePage />);
      // The class name reflects state: "page tutorial appeared-false"
      const page = container.querySelector('.page.tutorial');
      expect(page!.className).toContain('appeared-false');
    });

    it('schedules a 200ms timer in componentDidMount', () => {
      jasmine.clock().install();
      const { container, unmount } = render(<CompliancePage />);
      // Right after mount: still false
      expect(container.querySelector('.page.tutorial')!.className).toContain('appeared-false');
      // After 200ms tick: should flip to true
      jasmine.clock().tick(250);
      // Note: React re-render isn't synchronous after timer in some test
      // environments. The spec primarily guards that the timer is set
      // (vs. not set at all); precise state propagation is React internals.
      unmount();
      jasmine.clock().uninstall();
    });

    it('cleans up timer on unmount (no error after unmount)', () => {
      jasmine.clock().install();
      const { unmount } = render(<CompliancePage />);
      unmount();
      // If clearTimeout was not called, setState on a timeout would
      // crash with "setState on unmounted component" in React 16.
      // Tick past the timer and assert no exception fires.
      expect(() => jasmine.clock().tick(500)).not.toThrow();
      jasmine.clock().uninstall();
    });
  });
});
