/**
 * RED test — PgpEncryptButton (#112 UI).
 */
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

let PgpEncryptButton: any = null;
try {
  PgpEncryptButton = require('../internal_packages/pgp-smime/lib/pgp-encrypt-button').default;
} catch (e) { /* RED */ }

const { PgpKeyStore } = require('../internal_packages/pgp-smime/lib/pgp-key-store');

describe('PgpEncryptButton — #112 plan v1.0', () => {
  beforeEach(() => {
    if (PgpKeyStore._reset) { PgpKeyStore._reset(); PgpKeyStore.init(); }
  });
  afterEach(() => { cleanup(); });

  it('component exists', () => {
    expect(PgpEncryptButton).not.toBeNull();
    expect(typeof PgpEncryptButton).toBe('function');
  });

  it('renderuje NIC gdy brak recipientów', () => {
    if (!PgpEncryptButton) return;
    const { container } = render(<PgpEncryptButton recipients={[]} />);
    expect(container.querySelector('.pgp-encrypt-button')).toBeNull();
  });

  it('renderuje button gdy są recipients', () => {
    if (!PgpEncryptButton) return;
    const { container } = render(<PgpEncryptButton recipients={['a@b.com']} />);
    expect(container.querySelector('.pgp-encrypt-button')).not.toBeNull();
  });

  it('disabled gdy brak public key dla recipient', () => {
    if (!PgpEncryptButton) return;
    const { container } = render(<PgpEncryptButton recipients={['unknown@example.com']} />);
    const btn = container.querySelector('.pgp-encrypt-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enabled gdy public key dostępny', () => {
    if (!PgpEncryptButton) return;
    PgpKeyStore.importPublicKey({
      email: 'alice@example.com',
      publicKeyArmored: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nfake\n-----END PGP PUBLIC KEY BLOCK-----',
      fingerprint: 'ABC123',
      source: 'imported_armored',
      trustLevel: 'manual',
    });
    const { container } = render(<PgpEncryptButton recipients={['alice@example.com']} />);
    const btn = container.querySelector('.pgp-encrypt-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('aria-label + role=button', () => {
    if (!PgpEncryptButton) return;
    const { container } = render(<PgpEncryptButton recipients={['a@b.com']} />);
    const btn = container.querySelector('.pgp-encrypt-button') as HTMLElement;
    expect(btn.getAttribute('aria-label')).toMatch(/szyfru|encrypt/i);
  });
});
