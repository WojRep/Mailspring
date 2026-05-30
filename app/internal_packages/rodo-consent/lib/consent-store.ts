/**
 * RODO Consent Store — bilet MVP #113.
 *
 * Extends #102 ContactCard z RODO compliance:
 *  - consentGrantedAt / consentRevokedAt (Art. 7 — recordkeeping).
 *  - bulk send guard (>BULK_THRESHOLD recipients → check consent per recipient).
 *  - right to be forgotten (Art. 17) — cascade delete contact + related data.
 *  - data portability (Art. 20) — export contact JSON przed delete.
 *  - tier B encryption MANDATORY warning gdy contact ma PESEL/IBAN.
 *
 * Storage: localStorage (per-email consent record, separate od ContactCardStore).
 */

import { ContactCardStore } from '../../contact-card/lib/contact-card-store';
import { TIER_B_ENCRYPTED_FIELDS } from '../../contact-card/lib/pl-validators';

export interface ConsentRecord {
  email: string;
  consentGrantedAt?: number;
  consentRevokedAt?: number;
  /** Source: gdzie consent został pozyskany (manual / form / contract / inny). */
  source?: 'manual' | 'form' | 'contract' | 'inferred';
  /** Notatka uzasadnienia (optional). */
  note?: string;
  updatedAt: number;
}

export interface BulkSendCheckResult {
  /** Recipients bez ważnej zgody. */
  withoutConsent: string[];
  /** Recipients z aktywnym revoke. */
  revoked: string[];
  /** Wszystko OK? */
  allConsented: boolean;
}

export interface ContactExport {
  schemaVersion: '1.0';
  exportedAt: number;
  email: string;
  /** Contact card data snapshot (jeśli ContactCard istnieje). */
  card?: any;
  consent: ConsentRecord;
}

const STORAGE_KEY = 'actuna.rodo-consent';

/** Composer bulk send guard threshold — >threshold recipients triggers check. */
export const BULK_SEND_THRESHOLD = 5;

class ConsentStoreImpl {
  /** email (lowercased) → ConsentRecord. */
  private _records: Map<string, ConsentRecord> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Consent CRUD ===

  grantConsent(email: string, opts: { source?: ConsentRecord['source']; note?: string } = {}): ConsentRecord {
    if (!email) throw new Error('[Consent] email required');
    const key = this._key(email);
    const now = Date.now();
    const existing = this._records.get(key);
    const record: ConsentRecord = {
      email: key,
      consentGrantedAt: now,
      consentRevokedAt: undefined, // grant clears revoke
      source: opts.source || existing?.source || 'manual',
      note: opts.note ?? existing?.note,
      updatedAt: now,
    };
    this._records.set(key, record);
    this._save();
    this._emit();
    return record;
  }

  revokeConsent(email: string, note?: string): ConsentRecord {
    if (!email) throw new Error('[Consent] email required');
    const key = this._key(email);
    const now = Date.now();
    const existing = this._records.get(key);
    const record: ConsentRecord = {
      email: key,
      consentGrantedAt: existing?.consentGrantedAt,
      consentRevokedAt: now,
      source: existing?.source,
      note: note ?? existing?.note,
      updatedAt: now,
    };
    this._records.set(key, record);
    this._save();
    this._emit();
    return record;
  }

  /** Czy email ma aktywną zgodę? (granted i NIE revoked po grant).
   *  Uwaga: gdy revokedAt >= grantedAt → revoke wins (równość timestampów
   *  np. w spec mode TimeOverride.frozen → revoke jest po grant w call order). */
  hasActiveConsent(email: string): boolean {
    const r = this._records.get(this._key(email));
    if (!r || r.consentGrantedAt === undefined) return false;
    if (r.consentRevokedAt !== undefined && r.consentRevokedAt >= r.consentGrantedAt) return false;
    return true;
  }

  isRevoked(email: string): boolean {
    const r = this._records.get(this._key(email));
    if (!r || r.consentRevokedAt === undefined) return false;
    if (r.consentGrantedAt !== undefined && r.consentGrantedAt > r.consentRevokedAt) return false;
    return true;
  }

  get(email: string): ConsentRecord | undefined {
    return this._records.get(this._key(email));
  }

  list(): ConsentRecord[] {
    return Array.from(this._records.values()).sort((a, b) => a.email.localeCompare(b.email));
  }

  count(): number {
    return this._records.size;
  }

  // === Bulk send guard ===

  /** Composer: check recipients gdy count > threshold. */
  checkBulkSend(recipients: string[]): BulkSendCheckResult {
    const withoutConsent: string[] = [];
    const revoked: string[] = [];
    for (const r of recipients) {
      const key = this._key(r);
      if (this.isRevoked(key)) {
        revoked.push(r);
      } else if (!this.hasActiveConsent(key)) {
        withoutConsent.push(r);
      }
    }
    return {
      withoutConsent,
      revoked,
      allConsented: withoutConsent.length === 0 && revoked.length === 0,
    };
  }

  /** Czy trigger check? (count > threshold). */
  static shouldCheckBulk(recipientCount: number): boolean {
    return recipientCount > BULK_SEND_THRESHOLD;
  }

  // === Right to be forgotten (Art. 17) ===

  /**
   * Export + delete contact (kombo Art. 20 portability + Art. 17 erasure).
   * Zwraca JSON export PRZED delete.
   *
   * Cascade: usuwa ContactCard (jeśli istnieje), ConsentRecord. NIE usuwa emails
   * (historia maili pozostaje w mailbox per RODO Recital 156 retention).
   */
  exportAndForget(email: string): ContactExport | null {
    const key = this._key(email);
    const card = ContactCardStore.get(key);
    const consent = this._records.get(key);
    if (!card && !consent) return null;

    const exportData: ContactExport = {
      schemaVersion: '1.0',
      exportedAt: Date.now(),
      email: key,
      card: card ? JSON.parse(JSON.stringify(card)) : undefined,
      consent: consent || { email: key, updatedAt: Date.now() },
    };

    // Cascade delete
    if (card) ContactCardStore.delete(key);
    this._records.delete(key);
    this._save();
    this._emit();

    return exportData;
  }

  /** Tylko delete (bez export) — opcjonalne dla użytkownika żądającego shred. */
  forget(email: string): boolean {
    const key = this._key(email);
    const hadCard = ContactCardStore.get(key) !== undefined;
    const hadConsent = this._records.delete(key);
    if (hadCard) ContactCardStore.delete(key);
    if (hadCard || hadConsent) {
      this._save();
      this._emit();
      return true;
    }
    return false;
  }

  /** Bulk forget. Returns count usuniętych. */
  bulkForget(emails: string[]): number {
    let count = 0;
    for (const e of emails) {
      if (this.forget(e)) count++;
    }
    return count;
  }

  // === Tier B encryption warning ===

  /**
   * Sprawdź czy contact ma sensitive fields wymagające Tier B encryption.
   * UI musi pokazać warning gdy user save'uje PESEL/IBAN bez encryption layer.
   */
  contactRequiresEncryption(email: string): { required: boolean; fields: string[] } {
    const card = ContactCardStore.get(email);
    if (!card) return { required: false, fields: [] };
    const sensitive = Object.keys(card.customFields).filter(k => TIER_B_ENCRYPTED_FIELDS.has(k));
    return { required: sensitive.length > 0, fields: sensitive };
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._records.clear();
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  // === internals ===

  private _key(email: string): string {
    return (email || '').toLowerCase().trim();
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as ConsentRecord[];
      for (const r of arr) {
        if (r && r.email) this._records.set(r.email, r);
      }
    } catch (e) {
      console.error('[Consent] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._records.values())));
    } catch (e) {
      console.error('[Consent] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[Consent] listener error', e); }
    }
  }
}

export const ConsentStore = new ConsentStoreImpl();
export const shouldCheckBulkSend = ConsentStoreImpl.shouldCheckBulk;
