/**
 * @mention engine — bilet MVP #108.
 *
 * Detect `@query` w composer body, search via #103 PeopleHubStore autocomplete,
 * insert highlighted `<span class="actuna-mention" data-email="...">@Name</span>`,
 * add email do To/Cc per insertMode.
 */

import { PeopleHubStore, AutocompleteEntry } from '../../people-hub/lib/people-hub-store';
import { ContactCardStore } from '../../contact-card/lib/contact-card-store';

export type MentionInsertMode = 'to' | 'cc' | 'inline_only';

export interface MentionMatch {
  /** Full mention entry. */
  entry: AutocompleteEntry;
  /** Display name dla wstawienia (preferuje name, fallback email user part). */
  displayName: string;
  /** Email address (do To/Cc). */
  email: string;
}

export interface MentionInsertion {
  /** HTML span do wstawienia w composer (highlighted). */
  html: string;
  /** Plain text fallback (multipart). */
  plainText: string;
  /** Email do dopisania (zależy od insertMode; undefined gdy 'inline_only'). */
  emailToAdd?: string;
  /** Insert mode użyty. */
  mode: MentionInsertMode;
}

/** Min characters po `@` zanim picker startuje. */
export const MENTION_TRIGGER_MIN_CHARS = 1;

/**
 * Detect @-pattern przed cursor: jeśli ostatni token zaczyna się od `@` i ma >= MIN chars,
 * zwróć query string (bez `@`). Inaczej null.
 *
 * Caller dostarcza tekst PRZED cursor (substring(0, cursorIdx)).
 */
export function detectMentionTrigger(textBeforeCursor: string): string | null {
  const match = textBeforeCursor.match(/(?:^|\s)@(\S*)$/);
  if (!match) return null;
  const query = match[1];
  if (query.length < MENTION_TRIGGER_MIN_CHARS) return null;
  return query;
}

/** Search po query — delegates to PeopleHubStore autocomplete. */
export function searchMentions(query: string, limit = 8): MentionMatch[] {
  const results = PeopleHubStore.searchAutocomplete(query, limit);
  return results.map(entry => ({
    entry,
    displayName: entry.name || extractEmailLocalPart(entry.email),
    email: entry.email,
  }));
}

/** Search z fallback do ContactCardStore.list() gdy autocomplete pusty. */
export function searchMentionsWithFallback(query: string, limit = 8): MentionMatch[] {
  const primary = searchMentions(query, limit);
  if (primary.length > 0) return primary;
  // Fallback — przeszukaj ContactCardStore
  const q = query.toLowerCase();
  const cards = ContactCardStore.list().filter(c => {
    const name = (c.name || '').toLowerCase();
    return c.email.includes(q) || name.includes(q);
  });
  return cards.slice(0, limit).map(c => ({
    entry: {
      email: c.email,
      name: c.name,
      frequency: 0,
      lastUsedAt: 0,
      inContacts: true,
    },
    displayName: c.name || extractEmailLocalPart(c.email),
    email: c.email,
  }));
}

/**
 * Build insertion payload — HTML span + plain text + opcjonalnie email do To/Cc.
 *
 * HTML: `<span class="actuna-mention" data-email="bob@x.com">@Bob Smith</span>`.
 * Plain text: `@Bob Smith`.
 */
export function buildMentionInsertion(match: MentionMatch, mode: MentionInsertMode = 'to'): MentionInsertion {
  const email = escapeAttr(match.email);
  const name = escapeHtml(match.displayName);
  return {
    html: `<span class="actuna-mention" data-email="${email}">@${name}</span>`,
    plainText: `@${match.displayName}`,
    emailToAdd: mode === 'inline_only' ? undefined : match.email,
    mode,
  };
}

/** Render plain mention HTML (recipient-side) — strip-safe alternatywa. */
export function renderMentionFallback(displayName: string): string {
  return `<strong>@${escapeHtml(displayName)}</strong>`;
}

/** Extract email z mention span attribute (event handler caller). */
export function extractEmailFromMention(html: string): string | null {
  const match = html.match(/data-email="([^"]+)"/);
  return match ? unescapeAttr(match[1]) : null;
}

// === internals ===

function extractEmailLocalPart(email: string): string {
  const idx = email.indexOf('@');
  return idx > 0 ? email.slice(0, idx) : email;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function unescapeAttr(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
