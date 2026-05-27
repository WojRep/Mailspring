/**
 * Smart Folder rule engine — bilet MVP #99.
 *
 * Deterministic match engine dla Smart Folder rules. Pozwala na test
 * thread metadata przeciwko regułom z evaluacją all/any.
 *
 * Wzór: identyczna semantyka do bilet #100 rule builder, ale Smart Folder
 * używa rules tylko do MATCH (filtering), nie ACTION. Inne — same fields
 * + operators jak w #100, więc rule-engine można share'ować.
 */

export type RuleField =
  | 'from' | 'to' | 'cc' | 'bcc'
  | 'subject' | 'body'
  | 'tag' | 'attachment'
  | 'date' | 'date_received'
  | 'read_state' | 'unread'
  | 'folder' | 'account'
  | 'has_attachment'
  | 'importance' | 'starred' | 'pinned'
  | 'sender_domain';

export type RuleOperator =
  | 'is' | 'is_not'
  | 'contains' | 'does_not_contain'
  | 'starts_with' | 'ends_with'
  | 'matches_regex'
  | 'before' | 'after' | 'within_last_days'
  | 'in_group';

export interface Rule {
  field: RuleField;
  op: RuleOperator;
  value: any;
}

export type MatchMode = 'all' | 'any';

export interface SmartFolderDefinition {
  id: string;
  name: string;
  color?: string;
  match: MatchMode;
  rules: Rule[];
  /** Sortowanie (newest/oldest/sender/subject). */
  sort?: 'date_desc' | 'date_asc' | 'sender_asc' | 'subject_asc';
  /** Realtime update on new mail? Default true. */
  realtime?: boolean;
  /** Notification on new match? Default false. */
  notifyOnMatch?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Thread metadata accepted by rule engine. */
export interface ThreadMeta {
  id: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  tags?: string[];
  hasAttachment?: boolean;
  attachmentCount?: number;
  date?: number;             // Unix ms
  read?: boolean;
  folder?: string;
  account?: string;
  importance?: 'high' | 'normal' | 'low';
  starred?: boolean;
  pinned?: boolean;
}

/** Evaluate single rule against thread. */
export function evalRule(rule: Rule, thread: ThreadMeta): boolean {
  const fieldValue = getFieldValue(rule.field, thread);
  return applyOperator(rule.op, fieldValue, rule.value, rule.field);
}

/** Evaluate full rule set with all/any mode. */
export function evalRules(rules: Rule[], mode: MatchMode, thread: ThreadMeta): boolean {
  if (rules.length === 0) return true; // no rules → all match
  if (mode === 'all') {
    return rules.every(r => evalRule(r, thread));
  }
  return rules.some(r => evalRule(r, thread));
}

/** Filter list of threads. */
export function filterThreads(rules: Rule[], mode: MatchMode, threads: ThreadMeta[]): ThreadMeta[] {
  return threads.filter(t => evalRules(rules, mode, t));
}

// === Search prefix syntax ===

/** Parse search string z "tag:Foo from:bob has:attachment" prefixes. */
export function parseSearchSyntax(query: string): Rule[] {
  const rules: Rule[] = [];
  if (!query || !query.trim()) return rules;

  // Split by spaces, ale zachowaj "kwoted strings"
  const tokens = (query.match(/(?:[^\s"]+|"[^"]*")+/g) || []).map(t => t.replace(/^"|"$/g, ''));

  for (const tok of tokens) {
    const colonIdx = tok.indexOf(':');
    if (colonIdx > 0) {
      const prefix = tok.slice(0, colonIdx).toLowerCase();
      const rawValue = tok.slice(colonIdx + 1);
      const negate = prefix.startsWith('-');
      const realPrefix = negate ? prefix.slice(1) : prefix;

      switch (realPrefix) {
        case 'tag':
          rules.push({ field: 'tag', op: negate ? 'does_not_contain' : 'contains', value: rawValue });
          break;
        case 'from':
          rules.push({ field: 'from', op: negate ? 'does_not_contain' : 'contains', value: rawValue });
          break;
        case 'to':
          rules.push({ field: 'to', op: negate ? 'does_not_contain' : 'contains', value: rawValue });
          break;
        case 'subject':
          rules.push({ field: 'subject', op: negate ? 'does_not_contain' : 'contains', value: rawValue });
          break;
        case 'has':
          if (rawValue === 'attachment' || rawValue === 'załącznik') {
            rules.push({ field: 'has_attachment', op: 'is', value: !negate });
          }
          break;
        case 'is':
          if (rawValue === 'unread' || rawValue === 'nieprzeczytane') {
            rules.push({ field: 'read', op: 'is', value: negate ? true : false });
          } else if (rawValue === 'starred' || rawValue === 'oznaczone') {
            rules.push({ field: 'starred', op: 'is', value: !negate });
          } else if (rawValue === 'pinned' || rawValue === 'przypięte') {
            rules.push({ field: 'pinned', op: 'is', value: !negate });
          }
          break;
        case 'folder':
          rules.push({ field: 'folder', op: negate ? 'is_not' : 'is', value: rawValue });
          break;
        case 'account':
          rules.push({ field: 'account', op: negate ? 'is_not' : 'is', value: rawValue });
          break;
        default:
          // unknown prefix — treat as subject contains
          rules.push({ field: 'subject', op: 'contains', value: tok });
      }
    } else {
      // Free text → subject + body contains
      rules.push({ field: 'subject', op: 'contains', value: tok });
    }
  }
  return rules;
}

// === internals ===

function getFieldValue(field: RuleField, thread: ThreadMeta): any {
  switch (field) {
    case 'from': return thread.from || '';
    case 'to': return (thread.to || []).join(' ');
    case 'cc': return (thread.cc || []).join(' ');
    case 'bcc': return (thread.bcc || []).join(' ');
    case 'subject': return thread.subject || '';
    case 'body': return thread.body || '';
    case 'tag': return thread.tags || [];
    case 'attachment':
    case 'has_attachment': return thread.hasAttachment ?? false;
    case 'date':
    case 'date_received': return thread.date || 0;
    case 'read_state':
    case 'unread':
    case 'read': return thread.read ?? false;
    case 'folder': return thread.folder || '';
    case 'account': return thread.account || '';
    case 'importance': return thread.importance || 'normal';
    case 'starred': return thread.starred ?? false;
    case 'pinned': return thread.pinned ?? false;
    case 'sender_domain': {
      const from = thread.from || '';
      const idx = from.lastIndexOf('@');
      return idx === -1 ? '' : from.slice(idx + 1);
    }
    default: return undefined;
  }
}

function applyOperator(op: RuleOperator, actual: any, expected: any, field?: RuleField): boolean {
  // Special case: tag is array — most ops act per-array-element
  if (field === 'tag' && Array.isArray(actual)) {
    const arr = actual as string[];
    switch (op) {
      case 'is':
      case 'contains':
        return arr.includes(String(expected));
      case 'is_not':
      case 'does_not_contain':
        return !arr.includes(String(expected));
      default:
        return false;
    }
  }

  switch (op) {
    case 'is':
      return actual === expected;
    case 'is_not':
      return actual !== expected;
    case 'contains':
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case 'does_not_contain':
      return !String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case 'starts_with':
      return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());
    case 'ends_with':
      return String(actual).toLowerCase().endsWith(String(expected).toLowerCase());
    case 'matches_regex':
      try { return new RegExp(String(expected), 'i').test(String(actual)); }
      catch (e) { return false; }
    case 'before':
      return typeof actual === 'number' && actual < Number(expected);
    case 'after':
      return typeof actual === 'number' && actual > Number(expected);
    case 'within_last_days':
      if (typeof actual !== 'number') return false;
      const days = Number(expected);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return actual >= cutoff;
    case 'in_group':
      // requires #103 groups integration — placeholder
      return false;
    default:
      return false;
  }
}
