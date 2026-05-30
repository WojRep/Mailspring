/**
 * RED test — RodoConsentBanner (#113 UI).
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let RodoConsentBanner: any = null;
try {
  RodoConsentBanner = require('../internal_packages/rodo-consent/lib/rodo-consent-banner').default;
} catch (e) { /* RED */ }

const { ConsentStore } = require('../internal_packages/rodo-consent/lib/consent-store');

describe('RodoConsentBanner — #113 plan v1.0', () => {
  beforeEach(() => {
    if (ConsentStore._reset) { ConsentStore._reset(); ConsentStore.init(); }
  });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(RodoConsentBanner).not.toBeNull();
    expect(typeof RodoConsentBanner).toBe('function');
  });

  it('renderuje NIC gdy brak recipients', () => {
    if (!RodoConsentBanner) return;
    const { container } = render(<RodoConsentBanner recipients={[]} />);
    expect(container.querySelector('.rodo-consent-banner')).toBeNull();
  });

  it('renderuje NIC gdy wszyscy recipients mają consent', () => {
    if (!RodoConsentBanner) return;
    ConsentStore.grantConsent('ok@example.com', { source: 'manual' });
    const { container } = render(<RodoConsentBanner recipients={['ok@example.com']} />);
    expect(container.querySelector('.rodo-consent-banner')).toBeNull();
  });

  it('renderuje warning gdy część recipients bez consent', () => {
    if (!RodoConsentBanner) return;
    const { container } = render(<RodoConsentBanner recipients={['unknown@example.com']} />);
    const banner = container.querySelector('.rodo-consent-banner');
    expect(banner).not.toBeNull();
    const html = container.innerHTML;
    expect(html).toContain('unknown@example.com');
  });

  it('role=region + aria-label PL+EN', () => {
    if (!RodoConsentBanner) return;
    const { container } = render(<RodoConsentBanner recipients={['x@y.com']} />);
    const banner = container.querySelector('.rodo-consent-banner') as HTMLElement;
    expect(banner.getAttribute('role')).toBe('region');
    expect(banner.getAttribute('aria-label')).toMatch(/rodo|consent|zgod|gdpr/i);
  });

  it('click "Grant consent" wywołuje ConsentStore.grantConsent', () => {
    if (!RodoConsentBanner) return;
    const spy = spyOn(ConsentStore, 'grantConsent').andCallThrough();
    const { container } = render(<RodoConsentBanner recipients={['new@example.com']} />);
    const btn = container.querySelector('.rodo-grant-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalled();
  });
});
