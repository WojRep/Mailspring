/**
 * Priority Classifier — deterministic bucket per thread.
 *
 * Bilet MVP #93. Algorithm: **brak AI** w MVP (manifest §1 explicit).
 *
 * Heurystyka Priority bucket (boolean — yes/no):
 *   (a) Pin (via PinStore) — zawsze Priority.
 *   (b) Manual override (tag `__system_priority` lub `__system_other`).
 *   (c) Regular correspondent: 2-way history ≥5 exchanges OR explicit reply by user.
 *   (d) Explicit "Important" tag (np. user-applied VIP).
 *
 * Else: Other.
 *
 * Threads bez Priority Inbox toggle (default OFF) wszystkie pojawiają się
 * razem w standard Inbox.
 */

import { PinStore } from './pin-store';

export type PriorityBucket = 'priority' | 'other';

export interface ThreadSnapshot {
  id: string;
  /** Liczba maili w wątku */
  messageCount?: number;
  /** Czy user kiedyś odpowiedział w tym wątku */
  hasReplied?: boolean;
  /** Liczba 2-way exchanges (sent + received) z tym kontaktem (history) */
  contactExchangeCount?: number;
  /** Wszystkie tagi przypisane do wątku */
  tags?: string[];
  /** Czy ma którykolwiek manual override tag */
  hasImportantTag?: boolean;
}

/** Manual override tags. */
export const TAG_PRIORITY_OVERRIDE = '__system_priority';
export const TAG_OTHER_OVERRIDE = '__system_other';
export const TAG_IMPORTANT = 'Important';
export const TAG_VIP = 'VIP';

/** Próg historii kontaktu dla automatic Priority (per manifest §1). */
export const REGULAR_CONTACT_THRESHOLD = 5;

export function classifyThread(thread: ThreadSnapshot): PriorityBucket {
  if (!thread || !thread.id) return 'other';

  // (a) Pin
  if (PinStore.isPinned(thread.id)) return 'priority';

  // (b) Manual override tags
  const tags = thread.tags || [];
  if (tags.includes(TAG_OTHER_OVERRIDE)) return 'other';
  if (tags.includes(TAG_PRIORITY_OVERRIDE)) return 'priority';

  // (d) Explicit Important / VIP
  if (thread.hasImportantTag || tags.includes(TAG_IMPORTANT) || tags.includes(TAG_VIP)) {
    return 'priority';
  }

  // (c) Regular correspondent + user replied
  if (thread.hasReplied && (thread.contactExchangeCount ?? 0) >= REGULAR_CONTACT_THRESHOLD) {
    return 'priority';
  }

  return 'other';
}

/** Bulk classify — returns { priority: [], other: [] } */
export function bucketThreads(threads: ThreadSnapshot[]): { priority: ThreadSnapshot[]; other: ThreadSnapshot[] } {
  const priority: ThreadSnapshot[] = [];
  const other: ThreadSnapshot[] = [];
  for (const t of threads) {
    if (classifyThread(t) === 'priority') priority.push(t);
    else other.push(t);
  }
  return { priority, other };
}
