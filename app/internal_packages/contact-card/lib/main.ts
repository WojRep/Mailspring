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

import { ComponentRegistry, WorkspaceStore } from 'actunamail-exports';
import ContactCardOverlay from './contact-card-overlay';
import { ContactCardUIBus } from './contact-card-ui-bus';
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

  // Mount overlay w Sheet.Global.Footer. Plan v1.0 #102 + mockup 10-contact-card.html.
  ComponentRegistry.register(ContactCardOverlay, {
    location: WorkspaceStore.Sheet.Global.Footer,
  });

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
  ComponentRegistry.unregister(ContactCardOverlay);
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
  // Resolve sender email z FocusedContentStore → upsert do ContactCardStore →
  // open overlay przez UIBus. Gdy brak focused thread / sender — open empty
  // (user widzi state hint).
  let email: string | null = null;
  try {
    const focused = (window as any).$m?.FocusedContentStore?.focused?.('thread');
    const lastMsg = focused?.messages?.[focused.messages.length - 1];
    email = (lastMsg?.from?.[0]?.email || lastMsg?.fromContact?.email || null);
    if (email) {
      ContactCardStore.upsert(email);
    }
  } catch (e) { /* no focused */ }
  ContactCardUIBus.openFor(email);
}

function openPeopleList(): void {
  console.info('[contact-card] open People list (foundation dla #103 People hub) — UI follow-up ticket');
}

export type { ContactCard, ContactNote, ContactTask, ContactStats, ThreadForStats, RelationshipTag, DealStatus } from './contact-card-store';
