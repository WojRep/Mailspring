/**
 * Keymap presets — bilet MVP #109.
 *
 * 4 mappings: Default (ActunaMail) / Apple Mail / Gmail / Outlook.
 * Każdy preset to map command → shortcut(s).
 *
 * Switch w runtime przełącza wszystkie keymapy (rebind przez AppEnv.keymaps.set
 * dla każdej entry; UI ticket implementuje real swap. Tu definicje są źródłem prawdy.)
 */

export type KeymapPreset = 'default' | 'apple_mail' | 'gmail' | 'outlook';

export interface KeymapBinding {
  command: string;
  /** Shortcut w notacji "mod-shift-X". */
  shortcut: string;
  /** Human-readable label dla cheat sheet. */
  label: string;
  /** Category dla grouping w cheat sheet (Mail / View / Compose / Search / etc.). */
  category: KeymapCategory;
}

export type KeymapCategory =
  | 'mail'
  | 'view'
  | 'compose'
  | 'search'
  | 'navigation'
  | 'organization'
  | 'help';

/** Default ActunaMail bindings — core set. */
export const DEFAULT_BINDINGS: KeymapBinding[] = [
  // Mail actions
  { command: 'core:reply', shortcut: 'r', label: 'Odpowiedz', category: 'mail' },
  { command: 'core:reply-all', shortcut: 'shift-r', label: 'Odpowiedz wszystkim', category: 'mail' },
  { command: 'core:forward', shortcut: 'f', label: 'Prześlij dalej', category: 'mail' },
  { command: 'core:archive', shortcut: 'e', label: 'Archiwizuj', category: 'mail' },
  { command: 'core:delete', shortcut: '#', label: 'Usuń', category: 'mail' },
  { command: 'core:mark-as-read', shortcut: 'shift-i', label: 'Oznacz jako przeczytane', category: 'mail' },
  { command: 'core:mark-as-unread', shortcut: 'shift-u', label: 'Oznacz jako nieprzeczytane', category: 'mail' },
  { command: 'core:star', shortcut: 's', label: 'Oznacz gwiazdką', category: 'mail' },
  // Navigation
  { command: 'core:next-item', shortcut: 'j', label: 'Następna wiadomość', category: 'navigation' },
  { command: 'core:prev-item', shortcut: 'k', label: 'Poprzednia wiadomość', category: 'navigation' },
  { command: 'core:open-item', shortcut: 'enter', label: 'Otwórz wiadomość', category: 'navigation' },
  { command: 'core:return-to-inbox', shortcut: 'u', label: 'Wróć do Inbox', category: 'navigation' },
  // Compose
  { command: 'core:new-message', shortcut: 'c', label: 'Nowa wiadomość', category: 'compose' },
  // Search
  { command: 'core:focus-search', shortcut: '/', label: 'Szukaj', category: 'search' },
  // Help
  { command: 'keyboard-mapping:open-cheat-sheet', shortcut: '?', label: 'Pokaż wszystkie skróty', category: 'help' },
];

/** Apple Mail-style — minor differences. */
export const APPLE_MAIL_BINDINGS: KeymapBinding[] = [
  { command: 'core:reply', shortcut: 'mod-r', label: 'Reply', category: 'mail' },
  { command: 'core:reply-all', shortcut: 'mod-shift-r', label: 'Reply All', category: 'mail' },
  { command: 'core:forward', shortcut: 'mod-shift-f', label: 'Forward', category: 'mail' },
  { command: 'core:archive', shortcut: 'mod-ctrl-a', label: 'Archive', category: 'mail' },
  { command: 'core:delete', shortcut: 'delete', label: 'Delete', category: 'mail' },
  { command: 'core:mark-as-read', shortcut: 'mod-shift-u', label: 'Mark as Read', category: 'mail' },
  { command: 'core:star', shortcut: 'mod-l', label: 'Flag', category: 'mail' },
  { command: 'core:next-item', shortcut: 'down', label: 'Next Message', category: 'navigation' },
  { command: 'core:prev-item', shortcut: 'up', label: 'Previous Message', category: 'navigation' },
  { command: 'core:new-message', shortcut: 'mod-n', label: 'New Message', category: 'compose' },
  { command: 'core:focus-search', shortcut: 'mod-alt-f', label: 'Search Mail', category: 'search' },
  { command: 'keyboard-mapping:open-cheat-sheet', shortcut: '?', label: 'Show shortcuts', category: 'help' },
];

/** Gmail-style — single-letter unmodified (j/k/e/etc.). */
export const GMAIL_BINDINGS: KeymapBinding[] = [
  { command: 'core:reply', shortcut: 'r', label: 'Reply', category: 'mail' },
  { command: 'core:reply-all', shortcut: 'a', label: 'Reply All', category: 'mail' },
  { command: 'core:forward', shortcut: 'f', label: 'Forward', category: 'mail' },
  { command: 'core:archive', shortcut: 'e', label: 'Archive', category: 'mail' },
  { command: 'core:delete', shortcut: '#', label: 'Delete', category: 'mail' },
  { command: 'core:mark-as-read', shortcut: 'shift-i', label: 'Mark as Read', category: 'mail' },
  { command: 'core:mark-as-unread', shortcut: 'shift-u', label: 'Mark as Unread', category: 'mail' },
  { command: 'core:star', shortcut: 's', label: 'Star', category: 'mail' },
  { command: 'core:next-item', shortcut: 'j', label: 'Newer conversation', category: 'navigation' },
  { command: 'core:prev-item', shortcut: 'k', label: 'Older conversation', category: 'navigation' },
  { command: 'core:open-item', shortcut: 'o', label: 'Open conversation', category: 'navigation' },
  { command: 'core:return-to-inbox', shortcut: 'u', label: 'Return to Inbox', category: 'navigation' },
  { command: 'core:new-message', shortcut: 'c', label: 'Compose', category: 'compose' },
  { command: 'core:focus-search', shortcut: '/', label: 'Search mail', category: 'search' },
  { command: 'keyboard-mapping:open-cheat-sheet', shortcut: '?', label: 'Keyboard shortcuts', category: 'help' },
];

/** Outlook-style — mod-heavy. */
export const OUTLOOK_BINDINGS: KeymapBinding[] = [
  { command: 'core:reply', shortcut: 'mod-r', label: 'Reply', category: 'mail' },
  { command: 'core:reply-all', shortcut: 'mod-shift-r', label: 'Reply All', category: 'mail' },
  { command: 'core:forward', shortcut: 'mod-f', label: 'Forward', category: 'mail' },
  { command: 'core:archive', shortcut: 'mod-e', label: 'Archive', category: 'mail' },
  { command: 'core:delete', shortcut: 'delete', label: 'Delete', category: 'mail' },
  { command: 'core:mark-as-read', shortcut: 'mod-q', label: 'Mark as Read', category: 'mail' },
  { command: 'core:mark-as-unread', shortcut: 'mod-u', label: 'Mark as Unread', category: 'mail' },
  { command: 'core:star', shortcut: 'insert', label: 'Flag', category: 'mail' },
  { command: 'core:next-item', shortcut: 'down', label: 'Next Item', category: 'navigation' },
  { command: 'core:prev-item', shortcut: 'up', label: 'Previous Item', category: 'navigation' },
  { command: 'core:new-message', shortcut: 'mod-n', label: 'New Email', category: 'compose' },
  { command: 'core:focus-search', shortcut: 'mod-e', label: 'Search', category: 'search' },
  { command: 'keyboard-mapping:open-cheat-sheet', shortcut: '?', label: 'Show shortcuts', category: 'help' },
];

export const PRESET_BINDINGS: Record<KeymapPreset, KeymapBinding[]> = {
  default: DEFAULT_BINDINGS,
  apple_mail: APPLE_MAIL_BINDINGS,
  gmail: GMAIL_BINDINGS,
  outlook: OUTLOOK_BINDINGS,
};

export const PRESET_LABELS_PL: Record<KeymapPreset, string> = {
  default: 'Domyślne (ActunaMail)',
  apple_mail: 'Apple Mail',
  gmail: 'Gmail',
  outlook: 'Outlook',
};

export const PRESET_LABELS_EN: Record<KeymapPreset, string> = {
  default: 'Default (ActunaMail)',
  apple_mail: 'Apple Mail',
  gmail: 'Gmail',
  outlook: 'Outlook',
};
