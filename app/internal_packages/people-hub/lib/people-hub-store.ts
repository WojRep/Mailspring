/**
 * People Hub Store — bilet MVP #103.
 *
 * Centralna lista kontaktów ponad #102 ContactCard:
 *  - Sender Groups (manual create + auto-rule "All from @domain → group").
 *  - Autocomplete entries z frequency + recency tracking.
 *  - vCard / CardDAV sync adapters (CardDAV real network odłożony).
 *
 * Reuses #102 ContactCardStore — group membership po email.
 */

import { ContactCardStore } from '../../contact-card/lib/contact-card-store';
import { VCard, parseVCards, serializeVCards } from './vcard';

export interface SenderGroup {
  id: string;
  name: string;
  /** Auto-include emails matching this domain (e.g. "example.com" — bez @). */
  autoDomain?: string;
  /** Manual member emails (always included on top of autoDomain). */
  manualEmails: string[];
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AutocompleteEntry {
  email: string;
  /** Display name (z ContactCard.name lub vCard FN lub email user part). */
  name?: string;
  /** Times this email used as recipient. */
  frequency: number;
  /** Last use Unix ms. */
  lastUsedAt: number;
  /** True gdy email present w ContactCardStore lub PeopleHub group. */
  inContacts: boolean;
}

/** Decay constant — 1 week half-life for recency boost. */
const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

const STORAGE_GROUPS_KEY = 'actuna.people-groups';
const STORAGE_AUTOCOMPLETE_KEY = 'actuna.people-autocomplete';

class PeopleHubStoreImpl {
  private _groups: Map<string, SenderGroup> = new Map();
  /** email (lowercased) → AutocompleteEntry. */
  private _autocomplete: Map<string, AutocompleteEntry> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Groups CRUD ===

  createGroup(input: { name: string; autoDomain?: string; manualEmails?: string[]; color?: string }): SenderGroup {
    if (!input.name || !input.name.trim()) {
      throw new Error('[PeopleHub] createGroup: name required');
    }
    const id = this._generateId('group');
    const now = Date.now();
    const group: SenderGroup = {
      id,
      name: input.name.trim(),
      autoDomain: input.autoDomain ? input.autoDomain.toLowerCase().replace(/^@/, '') : undefined,
      manualEmails: (input.manualEmails || []).map(e => e.toLowerCase().trim()).filter(Boolean),
      color: input.color,
      createdAt: now,
      updatedAt: now,
    };
    this._groups.set(id, group);
    this._save();
    this._emit();
    return group;
  }

  updateGroup(id: string, patch: Partial<Omit<SenderGroup, 'id' | 'createdAt'>>): SenderGroup | undefined {
    const existing = this._groups.get(id);
    if (!existing) return undefined;
    const updated: SenderGroup = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      manualEmails: patch.manualEmails
        ? patch.manualEmails.map(e => e.toLowerCase().trim()).filter(Boolean)
        : existing.manualEmails,
      autoDomain: patch.autoDomain !== undefined
        ? (patch.autoDomain ? patch.autoDomain.toLowerCase().replace(/^@/, '') : undefined)
        : existing.autoDomain,
      updatedAt: Date.now(),
    };
    this._groups.set(id, updated);
    this._save();
    this._emit();
    return updated;
  }

  deleteGroup(id: string): boolean {
    const had = this._groups.delete(id);
    if (had) {
      this._save();
      this._emit();
    }
    return had;
  }

  getGroup(id: string): SenderGroup | undefined {
    return this._groups.get(id);
  }

  listGroups(): SenderGroup[] {
    return Array.from(this._groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Members of group: union of autoDomain matches (from ContactCards + autocomplete) + manualEmails. */
  groupMembers(groupId: string): string[] {
    const group = this._groups.get(groupId);
    if (!group) return [];
    const members = new Set<string>(group.manualEmails);
    if (group.autoDomain) {
      const domain = group.autoDomain;
      // From ContactCardStore
      for (const c of ContactCardStore.list()) {
        if (c.email.endsWith('@' + domain)) members.add(c.email);
      }
      // From autocomplete
      for (const a of this._autocomplete.values()) {
        if (a.email.endsWith('@' + domain)) members.add(a.email);
      }
    }
    return Array.from(members).sort();
  }

  /** Which groups contain this email? */
  groupsForEmail(email: string): SenderGroup[] {
    const key = email.toLowerCase().trim();
    const out: SenderGroup[] = [];
    for (const g of this._groups.values()) {
      if (g.manualEmails.includes(key)) { out.push(g); continue; }
      if (g.autoDomain && key.endsWith('@' + g.autoDomain)) { out.push(g); }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  // === Autocomplete entries ===

  /** Record outgoing recipient — boosts frequency + recency. */
  recordUsage(email: string, name?: string): void {
    const key = (email || '').toLowerCase().trim();
    if (!key) return;
    const existing = this._autocomplete.get(key);
    const now = Date.now();
    if (existing) {
      existing.frequency += 1;
      existing.lastUsedAt = now;
      if (name && !existing.name) existing.name = name;
      existing.inContacts = this._isInContacts(key);
    } else {
      this._autocomplete.set(key, {
        email: key,
        name: name || undefined,
        frequency: 1,
        lastUsedAt: now,
        inContacts: this._isInContacts(key),
      });
    }
    this._saveAutocomplete();
    this._emit();
  }

  /**
   * Search autocomplete entries. Score = frequency × recencyBoost(lastUsedAt).
   * Recency boost = 0.5 ^ (Δt / RECENCY_HALF_LIFE_MS).
   */
  searchAutocomplete(query: string, limit = 10): AutocompleteEntry[] {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];
    const now = Date.now();
    const matches: Array<AutocompleteEntry & { _score: number }> = [];
    for (const entry of this._autocomplete.values()) {
      if (!entry.email.includes(q) && !(entry.name || '').toLowerCase().includes(q)) continue;
      const ageMs = now - entry.lastUsedAt;
      const recencyBoost = Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
      const score = entry.frequency * recencyBoost;
      matches.push({ ...entry, _score: score });
    }
    matches.sort((a, b) => b._score - a._score);
    return matches.slice(0, limit).map(({ _score, ...rest }) => rest);
  }

  getAutocompleteEntry(email: string): AutocompleteEntry | undefined {
    return this._autocomplete.get(email.toLowerCase().trim());
  }

  countAutocomplete(): number {
    return this._autocomplete.size;
  }

  // === vCard import/export ===

  /** Import vCards as ContactCards (delegates to ContactCardStore.upsert). Returns count. */
  importVCards(text: string): number {
    const cards = parseVCards(text);
    let count = 0;
    for (const card of cards) {
      const primaryEmail = card.emails[0]?.value;
      if (!primaryEmail) continue; // skip cards bez email
      ContactCardStore.upsert(primaryEmail, {
        name: card.fn,
        organization: card.org,
      });
      count++;
    }
    return count;
  }

  /** Export all ContactCards as vCards 4.0. */
  exportVCards(): string {
    const cards: VCard[] = ContactCardStore.list().map(c => {
      const card: VCard = {
        version: '4.0',
        fn: c.name || c.email,
        emails: [{ value: c.email, type: 'INTERNET' }],
        tels: [],
        org: c.organization,
      };
      return card;
    });
    return serializeVCards(cards);
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._groups.clear();
    this._autocomplete.clear();
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(STORAGE_GROUPS_KEY);
      localStorage.removeItem(STORAGE_AUTOCOMPLETE_KEY);
    } catch (e) { /* node env */ }
  }

  // === internals ===

  private _isInContacts(email: string): boolean {
    if (ContactCardStore.get(email)) return true;
    // Check group membership
    for (const g of this._groups.values()) {
      if (g.manualEmails.includes(email)) return true;
      if (g.autoDomain && email.endsWith('@' + g.autoDomain)) return true;
    }
    return false;
  }

  private _generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const rawG = localStorage.getItem(STORAGE_GROUPS_KEY);
      if (rawG) {
        const arr = JSON.parse(rawG) as SenderGroup[];
        for (const g of arr) {
          if (g && g.id) this._groups.set(g.id, g);
        }
      }
      const rawA = localStorage.getItem(STORAGE_AUTOCOMPLETE_KEY);
      if (rawA) {
        const arr = JSON.parse(rawA) as AutocompleteEntry[];
        for (const a of arr) {
          if (a && a.email) this._autocomplete.set(a.email, a);
        }
      }
    } catch (e) {
      console.error('[PeopleHub] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_GROUPS_KEY, JSON.stringify(this.listGroups()));
    } catch (e) {
      console.error('[PeopleHub] save groups failed:', e);
    }
  }

  private _saveAutocomplete(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_AUTOCOMPLETE_KEY, JSON.stringify(Array.from(this._autocomplete.values())));
    } catch (e) {
      console.error('[PeopleHub] save autocomplete failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[PeopleHub] listener error', e); }
    }
  }
}

export const PeopleHubStore = new PeopleHubStoreImpl();
