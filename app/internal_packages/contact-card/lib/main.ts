/**
 * Contact Card plugin entry — bilet MVP #102.
 *
 * activate():
 *   1. ContactCardStore.init().
 *   2. Bind Cmd+I → open card for current sender.
 *   3. Cmd+K palette commands.
 *   4. Expose AppEnv.contactCard API.
 *
 * Hover preview (200ms delay) wire-up odłożony do UI ticket.
 */

import {
  ContactCardStore,
  validateNIP,
  validateREGON,
  validateKRS,
  validatePESEL,
  validateIBAN,
  PL_VALIDATORS,
  TIER_B_ENCRYPTED_FIELDS,
} from './contact-card-store';

let shortcutDisposable: { dispose(): void } | null = null;

export function activate() {
  ContactCardStore.init();

  if ((window as any).AppEnv?.commands?.add) {
    shortcutDisposable = (window as any).AppEnv.commands.add(document.body, {
      'contact-card:open-for-current-sender': () => openForCurrentSender(),
      'contact-card:open-people-list': () => openPeopleList(),
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'contact-card:open-current',
      label: 'Pokaż kartę kontaktu / Show Contact Card',
      section: 'View',
      keywords: ['contact', 'card', 'kontakt', 'crm'],
      shortcut: ['⌘', 'I'],
      handler: () => openForCurrentSender(),
    });
    palette.register({
      id: 'contact-card:people',
      label: 'Otwórz listę osób / Open People List',
      section: 'View',
      keywords: ['people', 'osoby', 'contacts', 'list'],
      handler: () => openPeopleList(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.contactCard = {
    Store: ContactCardStore,
    validators: {
      nip: validateNIP,
      regon: validateREGON,
      krs: validateKRS,
      pesel: validatePESEL,
      iban: validateIBAN,
    },
    constants: {
      TIER_B_ENCRYPTED_FIELDS: Array.from(TIER_B_ENCRYPTED_FIELDS),
    },
  };
}

export function deactivate() {
  if (shortcutDisposable) {
    shortcutDisposable.dispose();
    shortcutDisposable = null;
  }
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('contact-card:open-current');
    palette.unregister('contact-card:people');
  }
  if ((window as any).AppEnv?.contactCard) {
    delete (window as any).AppEnv.contactCard;
  }
}

function openForCurrentSender(): void {
  console.info('[contact-card] open card for current sender');
  // TODO: pull current focused message from FocusedContentStore → resolve sender email → ContactCardStore.upsert(email) → open React modal
}

function openPeopleList(): void {
  console.info('[contact-card] open People list (foundation dla #103 People hub)');
  // TODO React People list view
}

export type { ContactCard, ContactNote, ContactTask, ContactStats, ThreadForStats, RelationshipTag, DealStatus } from './contact-card-store';
