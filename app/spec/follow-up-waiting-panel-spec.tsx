/**
 * RED test — FollowUpWaitingPanel (#106 UI) per plan v1.0 mockup 18-follow-up-waiting.html.
 *
 * Per user mandate 2026-05-30 "automatycznie z TDD" + "100% e2e coverage" +
 * "kontynuuj wszystkie punkty po kolei".
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let FollowUpWaitingPanel: any = null;
try {
  FollowUpWaitingPanel = require('../internal_packages/follow-up/lib/follow-up-waiting-panel').default;
} catch (e) { /* RED */ }

const { FollowUpStore } = require('../internal_packages/follow-up/lib/follow-up-store');

describe('FollowUpWaitingPanel — #106 plan v1.0', () => {
  beforeEach(() => {
    if (FollowUpStore._reset) { FollowUpStore._reset(); FollowUpStore.init(); }
  });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(FollowUpWaitingPanel).not.toBeNull();
    expect(typeof FollowUpWaitingPanel).toBe('function');
  });

  it('renderuje pusty state gdy 0 waiting threads', () => {
    if (!FollowUpWaitingPanel) return;
    const { container } = render(<FollowUpWaitingPanel />);
    const empty = container.querySelector('.follow-up-waiting-empty');
    expect(empty).not.toBeNull();
  });

  it('renderuje listę gdy są waiting threads', () => {
    if (!FollowUpWaitingPanel) return;
    // Use detection runDetection — simulate outbound 14 days ago, no reply
    const past = Date.now() - 14 * 24 * 60 * 60 * 1000;
    FollowUpStore.runDetection([{
      threadId: 't1', lastOutboundAt: past, recipient: 'jan@example.com', subject: 'Faktura',
    }]);
    const { container } = render(<FollowUpWaitingPanel />);
    const items = container.querySelectorAll('.follow-up-waiting-item');
    expect(items.length).toBeGreaterThan(0);
    const html = container.innerHTML;
    expect(html).toContain('Faktura');
  });

  it('renderuje role="region" + aria-label PL+EN', () => {
    if (!FollowUpWaitingPanel) return;
    const { container } = render(<FollowUpWaitingPanel />);
    const region = container.querySelector('.follow-up-waiting-panel[role="region"]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.getAttribute('aria-label')).toMatch(/waiting|oczekuj|follow/i);
  });

  it('click "Dismiss" wywołuje FollowUpStore.dismiss', () => {
    if (!FollowUpWaitingPanel) return;
    const past = Date.now() - 14 * 24 * 60 * 60 * 1000;
    FollowUpStore.runDetection([{
      threadId: 't2', lastOutboundAt: past, recipient: 'a@b.com', subject: 'Test',
    }]);
    const spy = spyOn(FollowUpStore, 'dismiss').andCallThrough();
    const { container } = render(<FollowUpWaitingPanel />);
    const btn = container.querySelector('.follow-up-dismiss-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalled();
  });

  it('click "Resolved" wywołuje FollowUpStore.markResolved', () => {
    if (!FollowUpWaitingPanel) return;
    const past = Date.now() - 14 * 24 * 60 * 60 * 1000;
    FollowUpStore.runDetection([{
      threadId: 't3', lastOutboundAt: past, recipient: 'c@d.com', subject: 'Other',
    }]);
    const spy = spyOn(FollowUpStore, 'markResolved').andCallThrough();
    const { container } = render(<FollowUpWaitingPanel />);
    const btn = container.querySelector('.follow-up-resolved-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalled();
  });
});
