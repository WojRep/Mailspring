/**
 * RED test — ContactCardOverlay (#102 UI). Plan v1.0 mockup
 * design/mockups/10-contact-card.html.
 *
 * MVP: single Overview tab z email + relationship tags + open/close.
 * Pełne tabs (Threads/Files/Notes/Tasks/Custom) odłożone na follow-up.
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let ContactCardOverlay: any = null;
try {
  ContactCardOverlay = require('../internal_packages/contact-card/lib/contact-card-overlay').default;
} catch (e) { /* RED */ }

const { ContactCardUIBus } = require('../internal_packages/contact-card/lib/contact-card-ui-bus');
const { ContactCardStore } = require('../internal_packages/contact-card/lib/contact-card-store');

describe('ContactCardOverlay — #102 plan v1.0', () => {
  beforeEach(() => {
    ContactCardUIBus._reset();
    if (ContactCardStore._reset) { ContactCardStore._reset(); ContactCardStore.init(); }
  });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(ContactCardOverlay).not.toBeNull();
    expect(typeof ContactCardOverlay).toBe('function');
  });

  it('hidden gdy UIBus zamknięty', () => {
    if (!ContactCardOverlay) return;
    const { container } = render(<ContactCardOverlay />);
    expect(container.querySelector('.contact-card-overlay')).toBeNull();
  });

  it('renderuje dialog z role + aria-modal + aria-label po open', () => {
    if (!ContactCardOverlay) return;
    ContactCardStore.upsert('jan@example.com', { name: 'Jan Kowalski' });
    const { container } = render(<ContactCardOverlay />);
    ContactCardUIBus.openFor('jan@example.com');
    const overlay = container.querySelector('.contact-card-overlay[role="dialog"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-label')).toMatch(/contact|kontakt/i);
  });

  it('pokazuje email + display name', () => {
    if (!ContactCardOverlay) return;
    ContactCardStore.upsert('anna@example.com', { name: 'Anna Nowak' });
    const { container } = render(<ContactCardOverlay />);
    ContactCardUIBus.openFor('anna@example.com');
    const html = container.innerHTML;
    expect(html).toContain('anna@example.com');
    expect(html).toContain('Anna Nowak');
  });

  it('pokazuje relationship tags chips', () => {
    if (!ContactCardOverlay) return;
    ContactCardStore.upsert('vip@example.com', { name: 'VIP Client' });
    ContactCardStore.addRelationshipTag('vip@example.com', 'VIP');
    ContactCardStore.addRelationshipTag('vip@example.com', 'client');
    const { container } = render(<ContactCardOverlay />);
    ContactCardUIBus.openFor('vip@example.com');
    const html = container.innerHTML;
    expect(html).toContain('VIP');
    expect(html).toContain('client');
  });

  it('close button zamyka overlay', () => {
    if (!ContactCardOverlay) return;
    const { container } = render(<ContactCardOverlay />);
    ContactCardUIBus.openFor('test@example.com');
    const close = container.querySelector('.contact-card-close') as HTMLButtonElement;
    expect(close).not.toBeNull();
    fireEvent.click(close);
    expect(ContactCardUIBus.isOpen()).toBe(false);
  });

  it('Escape zamyka overlay', () => {
    if (!ContactCardOverlay) return;
    const { container } = render(<ContactCardOverlay />);
    ContactCardUIBus.openFor('esc@example.com');
    const overlay = container.querySelector('.contact-card-overlay') as HTMLElement;
    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(ContactCardUIBus.isOpen()).toBe(false);
  });
});
