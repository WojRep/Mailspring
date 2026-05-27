/**
 * Sender Approval plugin entry — bilet MVP #94.
 *
 * activate():
 *   1. SenderApprovalStore.init().
 *   2. Register config schema `core.privacy.senderApproval` (default OFF, opt-in).
 *   3. Cmd+K palette commands.
 *   4. Expose `AppEnv.senderApproval` public API.
 */

import { SenderApprovalStore } from './sender-approval-store';

const FLAG_KEY = 'core.privacy.senderApproval';

export function activate() {
  SenderApprovalStore.init();

  if ((window as any).AppEnv?.config?.setSchema) {
    (window as any).AppEnv.config.setSchema(FLAG_KEY, {
      type: 'boolean',
      default: false,
      title: 'Sender Approval (kwarantanna nieznanych nadawców)',
      description: 'Pierwszy mail od nowego nadawcy trafia do kolejki kwarantanny, NIE do Inbox. Killer privacy feature dla PL-MŚP / KNF. Default OFF — opt-in w Preferences > Privacy.',
    });
  }

  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'sender-approval:open-quarantine',
      label: 'Otwórz kwarantannę nadawców / Open Sender Approval queue',
      section: 'Privacy',
      keywords: ['sender approval', 'kwarantanna', 'quarantine', 'gatekeeper', 'unknown'],
      handler: () => {
        // Navigation handler — open quarantine folder view
        // (UI wired w osobnym ticket; placeholder dispatch dla teraz)
        if ((window as any).AppEnv?.commands?.dispatch) {
          (window as any).AppEnv.commands.dispatch('navigation:go-to-sender-approval', document.body);
        }
      },
    });
    palette.register({
      id: 'sender-approval:toggle',
      label: 'Toggle Sender Approval mode',
      section: 'Privacy',
      keywords: ['sender approval', 'toggle', 'privacy'],
      handler: () => {
        const cur = (window as any).AppEnv?.config?.get?.(FLAG_KEY) ?? false;
        (window as any).AppEnv?.config?.set?.(FLAG_KEY, !cur);
      },
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.senderApproval = {
    Store: SenderApprovalStore,
    isEnabled: () => !!(window as any).AppEnv?.config?.get?.(FLAG_KEY),
    FLAG_KEY,
  };
}

export function deactivate() {
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('sender-approval:open-quarantine');
    palette.unregister('sender-approval:toggle');
  }
  if ((window as any).AppEnv?.senderApproval) {
    delete (window as any).AppEnv.senderApproval;
  }
}
