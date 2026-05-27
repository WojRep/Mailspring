/**
 * Tutorial steps — bilet MVP #110.
 *
 * 10 etapów keyboard-first onboarding (Vim-tutorial analog). Każdy etap:
 *  - id (0..9 stable identifier do progress tracking).
 *  - shortcut (klawisz/komenda do wykonania).
 *  - command (related AppEnv command — używane do verify).
 *  - prompt_pl/prompt_en (instrukcja dla użytkownika).
 *  - hint_pl/hint_en ("Help (show me)" content).
 *  - depends_on_ticket (informational — zaznacza zależność od shipped feature).
 */

export interface TutorialStep {
  id: number;
  shortcut: string;
  command: string;
  prompt_pl: string;
  prompt_en: string;
  hint_pl: string;
  hint_en: string;
  /** Ticket # gdzie feature dostarczony — informational. */
  depends_on_ticket?: number;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 0,
    shortcut: 'j',
    command: 'core:next-item',
    prompt_pl: 'Otwórz pierwszy mail. Wciśnij `J` lub strzałkę w dół.',
    prompt_en: 'Open the first email. Press `J` or arrow down.',
    hint_pl: 'Strzałka w dół na klawiaturze przeskakuje do następnej wiadomości.',
    hint_en: 'Down arrow on keyboard jumps to next message.',
  },
  {
    id: 1,
    shortcut: 'e',
    command: 'core:archive',
    prompt_pl: 'Zarchiwizuj tę wiadomość. Wciśnij `E`.',
    prompt_en: 'Archive this message. Press `E`.',
    hint_pl: '`E` = Archive — wiadomość zniknie z Inbox, ale nie zostanie usunięta.',
    hint_en: '`E` = Archive — message disappears from Inbox but is not deleted.',
  },
  {
    id: 2,
    shortcut: 'r',
    command: 'core:reply',
    prompt_pl: 'Odpowiedz na wiadomość. Wciśnij `R`.',
    prompt_en: 'Reply to the message. Press `R`.',
    hint_pl: '`R` = Reply (Odpowiedz). `Shift+R` = Reply All.',
    hint_en: '`R` = Reply. `Shift+R` = Reply All.',
  },
  {
    id: 3,
    shortcut: 'c',
    command: 'core:new-message',
    prompt_pl: 'Napisz nową wiadomość. Wciśnij `C`.',
    prompt_en: 'Compose a new message. Press `C`.',
    hint_pl: '`C` = Compose (Stwórz nową).',
    hint_en: '`C` = Compose new message.',
  },
  {
    id: 4,
    shortcut: 'mod-shift-h',
    command: 'snooze:open-picker',
    prompt_pl: 'Odłóż wiadomość na później (Snooze). Wciśnij `Cmd+Shift+H`.',
    prompt_en: 'Snooze the message for later. Press `Cmd+Shift+H`.',
    hint_pl: 'Snooze ukrywa wiadomość aż do wybranego momentu — wróci do Inbox jak nowy.',
    hint_en: 'Snooze hides the message until chosen time — returns as new in Inbox.',
    depends_on_ticket: 104,
  },
  {
    id: 5,
    shortcut: 'mod-l',
    command: 'tag-system:open-picker',
    prompt_pl: 'Dodaj tag do wiadomości. Wciśnij `Cmd+L`.',
    prompt_en: 'Add a tag to the message. Press `Cmd+L`.',
    hint_pl: 'Tagi to lekkie etykiety — możesz mieć wiele tagów na jednej wiadomości.',
    hint_en: 'Tags are lightweight labels — you can have multiple tags on one message.',
    depends_on_ticket: 98,
  },
  {
    id: 6,
    shortcut: 'mod-k',
    command: 'command-palette:open',
    prompt_pl: 'Otwórz palettę poleceń. Wciśnij `Cmd+K`.',
    prompt_en: 'Open command palette. Press `Cmd+K`.',
    hint_pl: 'Palette pokazuje wszystkie akcje + skróty + fuzzy search.',
    hint_en: 'Palette shows all actions + shortcuts + fuzzy search.',
    depends_on_ticket: 89,
  },
  {
    id: 7,
    shortcut: 'shift-p',
    command: 'priority-inbox:pin-thread',
    prompt_pl: 'Przypnij wiadomość. Wciśnij `Shift+P`.',
    prompt_en: 'Pin the message. Press `Shift+P`.',
    hint_pl: 'Pinned wiadomości pozostają na górze Inbox.',
    hint_en: 'Pinned messages stay at the top of Inbox.',
    depends_on_ticket: 93,
  },
  {
    id: 8,
    shortcut: 'mod-i',
    command: 'contact-card:open-for-current-sender',
    prompt_pl: 'Otwórz kartę kontaktu nadawcy. Wciśnij `Cmd+I`.',
    prompt_en: 'Open sender contact card. Press `Cmd+I`.',
    hint_pl: 'Karta kontaktu pokazuje wszystkie wątki z tą osobą + tagi + notatki.',
    hint_en: 'Contact card shows all threads with this person + tags + notes.',
    depends_on_ticket: 102,
  },
  {
    id: 9,
    shortcut: 'mod-f',
    command: 'core:focus-search',
    prompt_pl: 'Wyszukaj z prefiksem. Wpisz `tag:Q3` w pasku szukania.',
    prompt_en: 'Search with prefix. Type `tag:Q3` in the search bar.',
    hint_pl: 'Prefiksy: `tag:` `from:` `has:attachment` `-tag:` (negacja).',
    hint_en: 'Prefixes: `tag:` `from:` `has:attachment` `-tag:` (negation).',
    depends_on_ticket: 99,
  },
];

export const TOTAL_STEPS = TUTORIAL_STEPS.length;
