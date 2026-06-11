/**
 * ContactCardOverlay — Cmd+I modal dla kontaktu (#102 plan v1.0).
 *
 * MVP single-tab Overview: email + name + organization + relationship tags +
 * deal status + stats. Pełne tabs (Threads/Files/Notes/Tasks/Custom) — follow-up.
 *
 * Funkcje MVP:
 *  - role=dialog + aria-modal + aria-label PL+EN
 *  - Escape + backdrop click + close × button
 *  - Relationship tag chips
 *  - Subscribes do ContactCardUIBus + ContactCardStore changes
 */

import React from 'react';
import { ContactCardUIBus } from './contact-card-ui-bus';
import { ContactCardStore, ContactCard } from './contact-card-store';

const { localized } = require('actunamail-exports');

interface State {
  open: boolean;
  email: string | null;
  contact: ContactCard | null;
  previousActiveElement: Element | null;
}

export default class ContactCardOverlay extends React.Component<{}, State> {
  static displayName = 'ContactCardOverlay';
  static containerRequired = false;

  state: State = {
    open: false,
    email: null,
    contact: null,
    previousActiveElement: null,
  };

  private _unsubscribeBus: (() => void) | null = null;
  private _unsubscribeStore: (() => void) | null = null;
  private _dialogRef = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this._unsubscribeBus = ContactCardUIBus.listen(() => this._sync());
    if ((ContactCardStore as any).listen) {
      this._unsubscribeStore = (ContactCardStore as any).listen(() => this._sync());
    }
    this._sync();
  }

  componentWillUnmount() {
    if (this._unsubscribeBus) this._unsubscribeBus();
    if (this._unsubscribeStore) this._unsubscribeStore();
  }

  componentDidUpdate(_: {}, prev: State) {
    if (this.state.open && !prev.open) {
      setTimeout(() => this._dialogRef.current?.focus(), 0);
    }
    if (!this.state.open && prev.open && prev.previousActiveElement) {
      const el = prev.previousActiveElement as HTMLElement;
      if (el && typeof el.focus === 'function') {
        try {
          el.focus();
        } catch (e) {
          /* */
        }
      }
    }
  }

  private _sync = (): void => {
    const open = ContactCardUIBus.isOpen();
    const email = ContactCardUIBus.getEmail();
    const previousActiveElement =
      open && !this.state.open ? document.activeElement : this.state.previousActiveElement;
    const contact = email ? ContactCardStore.get(email) || null : null;
    this.setState({ open, email, contact, previousActiveElement });
  };

  private _close = (): void => {
    ContactCardUIBus.close();
  };

  private _onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._close();
    }
  };

  private _onBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) {
      this._close();
    }
  };

  render() {
    if (!this.state.open) return null;
    const email = this.state.email;
    const contact = this.state.contact;
    const ariaLabel = localized('Karta kontaktu / Contact card');
    const closeLabel = localized('Zamknij / Close');
    const noContactLabel = localized(
      'Kontakt nieznany — utwórz aby zobaczyć szczegóły. / Unknown contact — create to see details.'
    );

    return (
      <div className="contact-card-backdrop" onClick={this._onBackdropClick}>
        <div
          ref={this._dialogRef}
          className="contact-card-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={this._onKeyDown}
        >
          <header className="contact-card-header">
            <h2 className="contact-card-title">{contact?.name || email || ariaLabel}</h2>
            <button
              type="button"
              className="contact-card-close"
              aria-label={closeLabel}
              onClick={this._close}
            >
              ×
            </button>
          </header>

          <div className="contact-card-body">
            {email && (
              <div className="contact-card-email-row">
                <span className="contact-card-label">{localized('Email')}:</span>
                <a className="contact-card-email" href={`mailto:${email}`}>
                  {email}
                </a>
              </div>
            )}
            {contact && (
              <>
                {contact.organization && (
                  <div className="contact-card-org-row">
                    <span className="contact-card-label">
                      {localized('Organizacja / Organization')}:
                    </span>
                    <span>{contact.organization}</span>
                  </div>
                )}
                {contact.relationshipTags.length > 0 && (
                  <div className="contact-card-tags">
                    {contact.relationshipTags.map((tag) => (
                      <span key={tag} className="contact-card-tag-chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {contact.dealStatus && contact.dealStatus !== 'none' && (
                  <div className="contact-card-deal-row">
                    <span className="contact-card-label">{localized('Status')}:</span>
                    <span
                      className={`contact-card-deal-status contact-card-deal-${contact.dealStatus}`}
                    >
                      {contact.dealStatus}
                    </span>
                  </div>
                )}
              </>
            )}
            {!contact && email && <p className="contact-card-empty">{noContactLabel}</p>}
          </div>
        </div>
      </div>
    );
  }
}
