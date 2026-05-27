/**
 * Contact Card Store — bilet MVP #102.
 *
 * CRM-lite: per-email contact card z relationship tags + custom PL fields + notes (markdown) + tasks + stats.
 *
 * Storage: localStorage z Tier B encryption flag dla PESEL/IBAN (RODO compliance).
 * **#113 RODO ticket dostarczy real encryption — tutaj plain storage z marker do migracji.**
 */

import { ValidationResult, PL_VALIDATORS, TIER_B_ENCRYPTED_FIELDS, validateNIP, validateREGON, validateKRS, validatePESEL, validateIBAN } from './pl-validators';

export type RelationshipTag = 'client' | 'vendor' | 'prospect' | 'team' | 'VIP' | string;

export type DealStatus = 'cold' | 'warm' | 'active' | 'won' | 'lost' | 'none';

export type CustomFieldKey = 'nip' | 'regon' | 'krs' | 'pesel' | 'iban' | string;

export interface ContactNote {
  id: string;
  /** Markdown content. */
  markdown: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContactTask {
  id: string;
  title: string;
  done: boolean;
  dueAt?: number;
  createdAt: number;
}

export interface ContactStats {
  /** Derived; updated via updateStats(threads). */
  lastContactAt?: number;
  lastInboundAt?: number;
  lastOutboundAt?: number;
  totalThreads: number;
  /** Average ms between inbound and our reply. */
  avgResponseTimeMs?: number;
}

export interface ContactCard {
  /** Email = primary key (lowercased). */
  email: string;
  name?: string;
  photoUrl?: string;
  organization?: string;
  relationshipTags: RelationshipTag[];
  dealStatus: DealStatus;
  notes: ContactNote[];
  tasks: ContactTask[];
  /** Custom fields map (key → value). PL: nip/regon/krs/pesel/iban. */
  customFields: Record<CustomFieldKey, string>;
  stats: ContactStats;
  createdAt: number;
  updatedAt: number;
}

/** Thread input for stats computation. */
export interface ThreadForStats {
  /** Was this thread inbound (from contact) or outbound (from user)? */
  direction: 'inbound' | 'outbound';
  /** Unix ms. */
  date: number;
  /** Optional reply-pair metadata: time-to-reply ms gdy outbound była replyem do inbound. */
  replyToInboundDelta?: number;
}

const STORAGE_KEY = 'actuna.contact-cards';

class ContactCardStoreImpl {
  private _cards: Map<string, ContactCard> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === CRUD ===

  /** Get or create card for email (auto-creates if missing). */
  upsert(email: string, patch: Partial<Omit<ContactCard, 'email' | 'createdAt'>> = {}): ContactCard {
    const key = this._normalize(email);
    if (!key) throw new Error('[ContactCard] upsert: email required');
    const existing = this._cards.get(key);
    const now = Date.now();
    if (existing) {
      const updated: ContactCard = {
        ...existing,
        ...patch,
        email: existing.email,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      this._cards.set(key, updated);
      this._save();
      this._emit();
      return updated;
    }
    const fresh: ContactCard = {
      email: key,
      name: patch.name,
      photoUrl: patch.photoUrl,
      organization: patch.organization,
      relationshipTags: patch.relationshipTags || [],
      dealStatus: patch.dealStatus || 'none',
      notes: patch.notes || [],
      tasks: patch.tasks || [],
      customFields: patch.customFields || {},
      stats: patch.stats || { totalThreads: 0 },
      createdAt: now,
      updatedAt: now,
    };
    this._cards.set(key, fresh);
    this._save();
    this._emit();
    return fresh;
  }

  get(email: string): ContactCard | undefined {
    return this._cards.get(this._normalize(email));
  }

  delete(email: string): boolean {
    const had = this._cards.delete(this._normalize(email));
    if (had) {
      this._save();
      this._emit();
    }
    return had;
  }

  list(): ContactCard[] {
    return Array.from(this._cards.values()).sort((a, b) => {
      const aName = a.name || a.email;
      const bName = b.name || b.email;
      return aName.localeCompare(bName);
    });
  }

  count(): number {
    return this._cards.size;
  }

  // === Relationship tags ===

  addRelationshipTag(email: string, tag: RelationshipTag): ContactCard | undefined {
    const card = this._cards.get(this._normalize(email));
    if (!card) return undefined;
    if (!card.relationshipTags.includes(tag)) {
      card.relationshipTags.push(tag);
      card.updatedAt = Date.now();
      this._save();
      this._emit();
    }
    return card;
  }

  removeRelationshipTag(email: string, tag: RelationshipTag): ContactCard | undefined {
    const card = this._cards.get(this._normalize(email));
    if (!card) return undefined;
    const idx = card.relationshipTags.indexOf(tag);
    if (idx >= 0) {
      card.relationshipTags.splice(idx, 1);
      card.updatedAt = Date.now();
      this._save();
      this._emit();
    }
    return card;
  }

  // === Custom fields z walidacją ===

  setCustomField(email: string, key: CustomFieldKey, value: string): ValidationResult {
    const card = this._cards.get(this._normalize(email));
    if (!card) return { valid: false, reason: 'Contact card nie istnieje' };

    // Pusty value → clear field (no validation)
    if (!value || !value.trim()) {
      delete card.customFields[key];
      card.updatedAt = Date.now();
      this._save();
      this._emit();
      return { valid: true };
    }

    // Validate known PL fields
    const validator = PL_VALIDATORS[key as keyof typeof PL_VALIDATORS];
    if (validator) {
      const result = validator(value);
      if (!result.valid) return result;
    }

    card.customFields[key] = value.trim();
    card.updatedAt = Date.now();
    this._save();
    this._emit();
    return { valid: true };
  }

  /** Pole wymaga Tier B encryption przy persistence (PESEL/IBAN)? */
  fieldRequiresEncryption(key: CustomFieldKey): boolean {
    return TIER_B_ENCRYPTED_FIELDS.has(key);
  }

  // === Notes (markdown) ===

  addNote(email: string, markdown: string): ContactNote | undefined {
    const card = this._cards.get(this._normalize(email));
    if (!card) return undefined;
    const note: ContactNote = {
      id: this._generateId('note'),
      markdown,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    card.notes.push(note);
    card.updatedAt = Date.now();
    this._save();
    this._emit();
    return note;
  }

  updateNote(email: string, noteId: string, markdown: string): ContactNote | undefined {
    const card = this._cards.get(this._normalize(email));
    if (!card) return undefined;
    const note = card.notes.find(n => n.id === noteId);
    if (!note) return undefined;
    note.markdown = markdown;
    note.updatedAt = Date.now();
    card.updatedAt = Date.now();
    this._save();
    this._emit();
    return note;
  }

  deleteNote(email: string, noteId: string): boolean {
    const card = this._cards.get(this._normalize(email));
    if (!card) return false;
    const idx = card.notes.findIndex(n => n.id === noteId);
    if (idx < 0) return false;
    card.notes.splice(idx, 1);
    card.updatedAt = Date.now();
    this._save();
    this._emit();
    return true;
  }

  // === Tasks ===

  addTask(email: string, title: string, dueAt?: number): ContactTask | undefined {
    const card = this._cards.get(this._normalize(email));
    if (!card) return undefined;
    if (!title.trim()) return undefined;
    const task: ContactTask = {
      id: this._generateId('task'),
      title: title.trim(),
      done: false,
      dueAt,
      createdAt: Date.now(),
    };
    card.tasks.push(task);
    card.updatedAt = Date.now();
    this._save();
    this._emit();
    return task;
  }

  toggleTask(email: string, taskId: string): ContactTask | undefined {
    const card = this._cards.get(this._normalize(email));
    if (!card) return undefined;
    const task = card.tasks.find(t => t.id === taskId);
    if (!task) return undefined;
    task.done = !task.done;
    card.updatedAt = Date.now();
    this._save();
    this._emit();
    return task;
  }

  // === Stats computation ===

  /**
   * Recompute stats z thread history.
   * Caller dostarcza chronologicznie posortowane wątki direction inbound/outbound.
   */
  updateStats(email: string, threads: ThreadForStats[]): ContactCard | undefined {
    const card = this._cards.get(this._normalize(email));
    if (!card) return undefined;
    const sorted = [...threads].sort((a, b) => a.date - b.date);

    let lastInbound: number | undefined;
    let lastOutbound: number | undefined;
    let lastContact: number | undefined;
    const responseTimes: number[] = [];

    for (const t of sorted) {
      lastContact = t.date;
      if (t.direction === 'inbound') {
        lastInbound = t.date;
      } else {
        lastOutbound = t.date;
        if (t.replyToInboundDelta !== undefined && t.replyToInboundDelta > 0) {
          responseTimes.push(t.replyToInboundDelta);
        }
      }
    }

    const avgResponseTimeMs = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : undefined;

    card.stats = {
      lastContactAt: lastContact,
      lastInboundAt: lastInbound,
      lastOutboundAt: lastOutbound,
      totalThreads: threads.length,
      avgResponseTimeMs,
    };
    card.updatedAt = Date.now();
    this._save();
    this._emit();
    return card;
  }

  // === Listen / persist ===

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._cards.clear();
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  // === internals ===

  private _normalize(email: string): string {
    return (email || '').trim().toLowerCase();
  }

  private _generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as ContactCard[];
      for (const c of arr) {
        if (c && c.email) this._cards.set(c.email, c);
      }
    } catch (e) {
      console.error('[ContactCard] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      // TODO #113: encrypt customFields[pesel|iban] przed persist.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._cards.values())));
    } catch (e) {
      console.error('[ContactCard] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[ContactCard] listener error', e); }
    }
  }
}

export const ContactCardStore = new ContactCardStoreImpl();

// Re-export validators for callers
export { validateNIP, validateREGON, validateKRS, validatePESEL, validateIBAN, PL_VALIDATORS, TIER_B_ENCRYPTED_FIELDS };
