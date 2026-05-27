/**
 * Cleaning Suggestions engine — bilet MVP #116.
 *
 * Aggregate analysis per sender / category / age → CleaningSuggestion.
 * Heuristic detection: promo (subject keywords), notifications (sender domain),
 * newsletters (List-Unsubscribe present).
 *
 * NIE używamy "Clean Email" / "Screener" w UI/labels (TM Clean Email Inc / Apple Screener).
 */

export type MessageCategory = 'promo' | 'notifications' | 'newsletters' | 'other';

export interface MessageMeta {
  threadId: string;
  sender: string;
  /** Domain extracted from sender (do agregacji). */
  senderDomain?: string;
  subject?: string;
  date: number;
  /** Has List-Unsubscribe header → likely newsletter. */
  hasListUnsubscribe?: boolean;
}

export interface CleaningSuggestion {
  id: string;
  /** Aggregation scope: sender (email) lub domain. */
  scopeType: 'sender' | 'domain';
  scopeValue: string;
  category: MessageCategory;
  /** Threads matched. */
  threadIds: string[];
  count: number;
  /** Najstarszy message date. */
  oldestAt: number;
  /** Najnowszy. */
  newestAt: number;
  /** PL human-readable text dla notification. */
  textPl: string;
  /** EN human-readable text. */
  textEn: string;
}

/** Min count threshold do wygenerowania suggestion (avoid noise dla 1-2 maili). */
export const MIN_COUNT_THRESHOLD = 10;

/** Age threshold w dniach — suggestion tylko gdy oldest > N dni. */
export const MIN_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const PROMO_KEYWORDS = [
  'sale', 'promo', 'promocja', 'rabat', 'zniżka', 'wyprzedaż',
  '%', 'discount', 'deal', 'offer', 'oferta', 'free', 'darmo',
  'last chance', 'ostatnia szansa', 'limited', 'limit',
];

const NOTIFICATION_DOMAINS = [
  'noreply', 'no-reply', 'notification', 'notifications',
  'updates', 'alerts', 'do-not-reply', 'system',
];

export function categorize(msg: MessageMeta): MessageCategory {
  if (msg.hasListUnsubscribe) {
    const subj = (msg.subject || '').toLowerCase();
    if (PROMO_KEYWORDS.some(k => subj.includes(k))) return 'promo';
    return 'newsletters';
  }
  const sender = (msg.sender || '').toLowerCase();
  const local = sender.split('@')[0] || '';
  if (NOTIFICATION_DOMAINS.some(d => local.includes(d))) return 'notifications';
  return 'other';
}

export function extractDomain(email: string): string {
  const idx = email.lastIndexOf('@');
  return idx > 0 ? email.slice(idx + 1).toLowerCase() : '';
}

export interface SuggestOptions {
  /** Scope kategorii w generowaniu (subset). Default wszystkie poza 'other'. */
  categories?: MessageCategory[];
  /** Aggregacja: per sender lub per domain. Default 'domain'. */
  scope?: 'sender' | 'domain';
  /** Min count override. */
  minCount?: number;
  /** Min age days override. */
  minAgeDays?: number;
  /** Now timestamp dla age calc (testowalne). */
  now?: number;
}

/**
 * Analyze message list → generate suggestions per scope+category.
 */
export function analyzeForSuggestions(messages: MessageMeta[], opts: SuggestOptions = {}): CleaningSuggestion[] {
  const minCount = opts.minCount ?? MIN_COUNT_THRESHOLD;
  const minAgeDays = opts.minAgeDays ?? MIN_AGE_DAYS;
  const scope = opts.scope ?? 'domain';
  const categories = opts.categories ?? ['promo', 'notifications', 'newsletters'];
  const now = opts.now ?? Date.now();
  const ageCutoff = now - minAgeDays * DAY_MS;

  // Group by (scope, category)
  const groups = new Map<string, MessageMeta[]>();
  for (const msg of messages) {
    const category = categorize(msg);
    if (!categories.includes(category)) continue;
    const scopeValue = scope === 'sender'
      ? msg.sender.toLowerCase()
      : (msg.senderDomain || extractDomain(msg.sender));
    if (!scopeValue) continue;
    const key = `${scope}|${scopeValue}|${category}`;
    const arr = groups.get(key) || [];
    arr.push(msg);
    groups.set(key, arr);
  }

  const suggestions: CleaningSuggestion[] = [];
  for (const [key, group] of groups) {
    const [scopeType, scopeValue, category] = key.split('|') as [
      'sender' | 'domain',
      string,
      MessageCategory,
    ];
    if (group.length < minCount) continue;
    const oldestAt = Math.min(...group.map(m => m.date));
    const newestAt = Math.max(...group.map(m => m.date));
    if (oldestAt > ageCutoff) continue; // not old enough

    const labelPl = labelCategoryPl(category);
    const labelEn = labelCategoryEn(category);
    const ageDesc = describeAge(now - oldestAt);

    suggestions.push({
      id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${suggestions.length}`,
      scopeType,
      scopeValue,
      category,
      threadIds: group.map(m => m.threadId),
      count: group.length,
      oldestAt,
      newestAt,
      textPl: `Masz ${group.length} ${labelPl} ${ageDesc.pl} od ${scopeValue}. Wyczyść?`,
      textEn: `You have ${group.length} ${labelEn} ${ageDesc.en} from ${scopeValue}. Clean up?`,
    });
  }
  // Sort by count desc (most impactful first)
  suggestions.sort((a, b) => b.count - a.count);
  return suggestions;
}

function labelCategoryPl(c: MessageCategory): string {
  switch (c) {
    case 'promo': return 'promocji';
    case 'notifications': return 'powiadomień';
    case 'newsletters': return 'newsletterów';
    default: return 'maili';
  }
}

function labelCategoryEn(c: MessageCategory): string {
  switch (c) {
    case 'promo': return 'promos';
    case 'notifications': return 'notifications';
    case 'newsletters': return 'newsletters';
    default: return 'mails';
  }
}

function describeAge(ageMs: number): { pl: string; en: string } {
  const years = Math.floor(ageMs / (365 * DAY_MS));
  if (years >= 1) return { pl: `> ${years} ${years === 1 ? 'rok' : 'lat'}`, en: `> ${years} ${years === 1 ? 'year' : 'years'}` };
  const months = Math.floor(ageMs / (30 * DAY_MS));
  if (months >= 1) return { pl: `> ${months} mies.`, en: `> ${months} months` };
  const days = Math.floor(ageMs / DAY_MS);
  return { pl: `> ${days} dni`, en: `> ${days} days` };
}
