/**
 * RED test — BulkUnsubscribeBanner (#115 UI) per plan v1.0 mockup
 * design/mockups/24-bulk-unsubscribe.html.
 *
 * Cycle:
 *  - RED: component nie istnieje
 *  - GREEN: minimalna implementacja React renderuje banner z sender list +
 *    1-click unsubscribe button gdy thread.headers['List-Unsubscribe'] exists
 *  - REFACTOR: extract item gdy widoczna duplikacja
 *
 * Per user mandate 2026-05-30 "automatycznie z TDD" + "100% e2e coverage".
 */

import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let BulkUnsubscribeBanner: any = null;
try {
  BulkUnsubscribeBanner = require('../internal_packages/bulk-unsubscribe/lib/bulk-unsubscribe-banner').default;
} catch (e) { /* RED phase */ }

const { SubscriptionStore } = require('../internal_packages/bulk-unsubscribe/lib/subscription-store');

describe('BulkUnsubscribeBanner UI — #115 plan v1.0', () => {
  beforeEach(() => {
    if (SubscriptionStore._reset) {
      SubscriptionStore._reset();
      SubscriptionStore.init();
    }
  });

  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(BulkUnsubscribeBanner).not.toBeNull();
    expect(typeof BulkUnsubscribeBanner).toBe('function');
  });

  it('renderuje NIC gdy brak thread prop (defensive)', () => {
    if (!BulkUnsubscribeBanner) return;
    const { container } = render(<BulkUnsubscribeBanner />);
    expect(container.querySelector('.bulk-unsubscribe-banner')).toBeNull();
  });

  it('renderuje NIC gdy thread bez List-Unsubscribe header', () => {
    if (!BulkUnsubscribeBanner) return;
    const thread = { id: 't1', headers: {} };
    const { container } = render(<BulkUnsubscribeBanner thread={thread} />);
    expect(container.querySelector('.bulk-unsubscribe-banner')).toBeNull();
  });

  it('renderuje banner gdy thread.headers["List-Unsubscribe"] istnieje', () => {
    if (!BulkUnsubscribeBanner) return;
    const thread = {
      id: 't1',
      sender: 'news@example.com',
      headers: { 'List-Unsubscribe': '<mailto:unsubscribe@example.com>' },
    };
    const { container } = render(<BulkUnsubscribeBanner thread={thread} />);
    expect(container.querySelector('.bulk-unsubscribe-banner')).not.toBeNull();
    const html = container.innerHTML;
    expect(html).toMatch(/unsubscribe|wypisz/i);
  });

  it('banner ma role=region/button + aria-label PL+EN', () => {
    if (!BulkUnsubscribeBanner) return;
    const thread = {
      id: 't2',
      sender: 'a@b.com',
      headers: { 'List-Unsubscribe': '<mailto:x@b.com>' },
    };
    const { container } = render(<BulkUnsubscribeBanner thread={thread} />);
    const banner = container.querySelector('.bulk-unsubscribe-banner') as HTMLElement;
    expect(banner.getAttribute('role')).toBe('region');
    expect(banner.getAttribute('aria-label')).toMatch(/unsubscribe|wypisz/i);
  });

  it('click "Wypisz" button wywołuje SubscriptionStore.markSent', () => {
    if (!BulkUnsubscribeBanner) return;
    SubscriptionStore.recordIncoming({
      sender: 'spam@example.com',
      threadId: 't3',
      mailto: 'unsubscribe@example.com',
    });
    const spy = spyOn(SubscriptionStore, 'markSent').andCallThrough();
    const thread = {
      id: 't3',
      sender: 'spam@example.com',
      headers: { 'List-Unsubscribe': '<mailto:unsubscribe@example.com>' },
    };
    const { container } = render(<BulkUnsubscribeBanner thread={thread} />);
    const btn = container.querySelector('.bulk-unsubscribe-action') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalled();
  });
});
