/**
 * Built-in commands ładowane przy activate() pluginu command-palette.
 *
 * Bilet MVP #89 — 30+ built-in commands jest acceptance criterion.
 * Pokrywa wszystkie typowe akcje user'a w ActunaMail.
 *
 * Każdy command może mieć handler() lub dispatchCommand (przez AppEnv.commands.dispatch).
 * dispatchCommand wymaga że odpowiedni command istnieje w app/keymaps/base.json
 * lub jest zarejestrowany przez inny plugin.
 *
 * Localized strings — używamy `localized()` z actunamail-exports.
 */

import { PaletteCommand } from './command-palette-store';

const { localized, Actions } = require('actunamail-exports');

export function getBuiltInCommands(): PaletteCommand[] {
  return [
    // === NAVIGATION ===
    {
      id: 'nav:inbox',
      label: localized('Idź do skrzynki / Go to Inbox'),
      keywords: ['inbox', 'skrzynka', 'odebrane', 'mail'],
      section: localized('Nawigacja / Navigation'),
      shortcut: ['G', 'I'],
      dispatchCommand: 'navigation:go-to-inbox',
    },
    {
      id: 'nav:sent',
      label: localized('Idź do wysłanych / Go to Sent'),
      keywords: ['sent', 'wysłane', 'wysłane'],
      section: localized('Nawigacja / Navigation'),
      shortcut: ['G', 'S'],
      dispatchCommand: 'navigation:go-to-sent',
    },
    {
      id: 'nav:drafts',
      label: localized('Idź do szkiców / Go to Drafts'),
      keywords: ['drafts', 'szkice', 'wersje robocze'],
      section: localized('Nawigacja / Navigation'),
      shortcut: ['G', 'D'],
      dispatchCommand: 'navigation:go-to-drafts',
    },
    {
      id: 'nav:snoozed',
      label: localized('Idź do odłożonych / Go to Snoozed'),
      keywords: ['snoozed', 'odłożone', 'snooze'],
      section: localized('Nawigacja / Navigation'),
      shortcut: ['G', 'Z'],
      dispatchCommand: 'navigation:go-to-snoozed',
    },
    {
      id: 'nav:trash',
      label: localized('Idź do kosza / Go to Trash'),
      keywords: ['trash', 'kosz', 'usunięte'],
      section: localized('Nawigacja / Navigation'),
      dispatchCommand: 'navigation:go-to-trash',
    },
    {
      id: 'nav:archive',
      label: localized('Idź do archiwum / Go to Archive'),
      keywords: ['archive', 'archiwum'],
      section: localized('Nawigacja / Navigation'),
      shortcut: ['G', 'A'],
      dispatchCommand: 'navigation:go-to-all',
    },

    // === COMPOSE ===
    {
      id: 'compose:new',
      label: localized('Nowa wiadomość / New message'),
      keywords: ['compose', 'new', 'write', 'nowa', 'napisz', 'kompozytor'],
      section: localized('Compose'),
      shortcut: ['⌘', 'N'],
      dispatchCommand: 'application:new-message',
    },

    // === MAIL ACTIONS ===
    {
      id: 'mail:reply',
      label: localized('Odpowiedz / Reply'),
      keywords: ['reply', 'odpowiedz', 'r'],
      section: localized('Mail'),
      shortcut: ['R'],
      dispatchCommand: 'core:reply',
    },
    {
      id: 'mail:reply-all',
      label: localized('Odpowiedz wszystkim / Reply all'),
      keywords: ['reply all', 'odpowiedz wszystkim', 'odpowiedz wszystkim'],
      section: localized('Mail'),
      shortcut: ['⇧', 'R'],
      dispatchCommand: 'core:reply-all',
    },
    {
      id: 'mail:forward',
      label: localized('Przekaż / Forward'),
      keywords: ['forward', 'przekaż', 'fwd'],
      section: localized('Mail'),
      shortcut: ['F'],
      dispatchCommand: 'core:forward',
    },
    {
      id: 'mail:archive',
      label: localized('Archiwizuj / Archive'),
      keywords: ['archive', 'archiwizuj', 'e'],
      section: localized('Mail'),
      shortcut: ['E'],
      dispatchCommand: 'core:archive-item',
    },
    {
      id: 'mail:delete',
      label: localized('Usuń / Delete'),
      keywords: ['delete', 'usuń', 'trash'],
      section: localized('Mail'),
      shortcut: ['⌫'],
      dispatchCommand: 'core:remove-from-view',
    },
    {
      id: 'mail:mark-read',
      label: localized('Oznacz jako przeczytane / Mark as read'),
      keywords: ['mark read', 'przeczytane', 'unread'],
      section: localized('Mail'),
      shortcut: ['⇧', 'I'],
      dispatchCommand: 'core:mark-as-read',
    },
    {
      id: 'mail:mark-unread',
      label: localized('Oznacz jako nieprzeczytane / Mark as unread'),
      keywords: ['mark unread', 'nieprzeczytane'],
      section: localized('Mail'),
      shortcut: ['⇧', 'U'],
      dispatchCommand: 'core:mark-as-unread',
    },
    {
      id: 'mail:star',
      label: localized('Gwiazdka / Star'),
      keywords: ['star', 'gwiazdka', 'oznacz'],
      section: localized('Mail'),
      shortcut: ['S'],
      dispatchCommand: 'core:star-item',
    },
    {
      id: 'mail:snooze',
      label: localized('Odłóż na później / Snooze'),
      keywords: ['snooze', 'odłóż', 'później'],
      section: localized('Mail'),
      shortcut: ['⌘', '⇧', 'H'],
      dispatchCommand: 'core:snooze-item',
    },
    {
      id: 'mail:tag',
      label: localized('Dodaj tag / Add tag'),
      keywords: ['tag', 'label', 'etykieta'],
      section: localized('Mail'),
      shortcut: ['⌘', 'L'],
      dispatchCommand: 'core:show-keybase-tag-picker',
    },

    // === SEARCH ===
    {
      id: 'search:focus',
      label: localized('Wyszukaj / Search'),
      keywords: ['search', 'find', 'szukaj', 'wyszukaj'],
      section: localized('Search'),
      shortcut: ['⌘', 'F'],
      dispatchCommand: 'core:focus-search',
    },

    // === SETTINGS / PREFERENCES ===
    {
      id: 'app:preferences',
      label: localized('Otwórz preferencje / Open preferences'),
      keywords: ['preferences', 'settings', 'preferencje', 'ustawienia', 'configuration'],
      section: localized('Settings'),
      shortcut: ['⌘', ','],
      dispatchCommand: 'application:open-preferences',
    },
    {
      id: 'app:keybindings',
      label: localized('Pokaż skróty klawiszowe / Show keyboard shortcuts'),
      keywords: ['keybindings', 'shortcuts', 'skróty', 'klawiszowe'],
      section: localized('Settings'),
      shortcut: ['?'],
      dispatchCommand: 'application:open-keybindings',
    },
    {
      id: 'app:accounts',
      label: localized('Zarządzaj kontami / Manage accounts'),
      keywords: ['accounts', 'konta'],
      section: localized('Settings'),
      dispatchCommand: 'application:show-accounts',
    },

    // === VIEW ===
    {
      id: 'view:reload',
      label: localized('Przeładuj okno / Reload window'),
      keywords: ['reload', 'refresh', 'przeładuj', 'odśwież'],
      section: localized('View'),
      shortcut: ['⌘', 'R'],
      dispatchCommand: 'window:reload',
    },
    {
      id: 'view:zoom-in',
      label: localized('Powiększ / Zoom in'),
      keywords: ['zoom in', 'powiększ'],
      section: localized('View'),
      shortcut: ['⌘', '+'],
      dispatchCommand: 'window:increase-font-size',
    },
    {
      id: 'view:zoom-out',
      label: localized('Pomniejsz / Zoom out'),
      keywords: ['zoom out', 'pomniejsz'],
      section: localized('View'),
      shortcut: ['⌘', '-'],
      dispatchCommand: 'window:decrease-font-size',
    },
    {
      id: 'view:zoom-reset',
      label: localized('Reset powiększenia / Reset zoom'),
      keywords: ['zoom reset', 'reset zoom', '100%'],
      section: localized('View'),
      shortcut: ['⌘', '0'],
      dispatchCommand: 'window:reset-font-size',
    },
    {
      id: 'view:toggle-sidebar',
      label: localized('Pokaż / ukryj sidebar'),
      keywords: ['sidebar', 'toggle', 'hide', 'show'],
      section: localized('View'),
      shortcut: ['⌘', '⇧', 'S'],
      dispatchCommand: 'application:toggle-message-list-sidebar',
    },

    // === DEV / DEBUG ===
    {
      id: 'dev:devtools',
      label: localized('Otwórz DevTools / Open DevTools'),
      keywords: ['devtools', 'developer tools', 'inspect', 'debug'],
      section: localized('Developer'),
      shortcut: ['⌘', '⌥', 'I'],
      dispatchCommand: 'application:open-dev-tools',
    },

    // === ACCOUNT ===
    {
      id: 'account:lock',
      label: localized('Zablokuj aplikację / Lock app'),
      keywords: ['lock', 'zablokuj', 'sqlcipher', 'lock app'],
      section: localized('Account'),
      shortcut: ['⌘', '⇧', 'L'],
      dispatchCommand: 'core:lock-app',
    },

    // === APPLICATION ===
    {
      id: 'app:quit',
      label: localized('Wyjdź z aplikacji / Quit'),
      keywords: ['quit', 'exit', 'wyjdź'],
      section: localized('Application'),
      shortcut: ['⌘', 'Q'],
      dispatchCommand: 'application:quit',
    },
    {
      id: 'app:hide',
      label: localized('Ukryj aplikację / Hide app'),
      keywords: ['hide', 'ukryj'],
      section: localized('Application'),
      shortcut: ['⌘', 'H'],
      dispatchCommand: 'application:hide',
    },
    {
      id: 'app:minimize',
      label: localized('Minimalizuj okno / Minimize window'),
      keywords: ['minimize', 'minimalizuj'],
      section: localized('Application'),
      shortcut: ['⌘', 'M'],
      dispatchCommand: 'application:minimize',
    },
  ];
}
