/**
 * CardDAV adapter (RFC 6352) — bilet MVP #103.
 *
 * Foundation interface — real PROPFIND/REPORT XML requests + auth + sync state
 * tracking ODŁOŻONE do oddzielnego ticketu wymagającego mailsync-bridge HTTP support.
 *
 * Tu definicje typów + stub adapter + sync interval scheduler hook.
 */

export type CardDAVProvider = 'icloud' | 'fastmail' | 'nextcloud' | 'baikal' | 'radicale' | 'custom';

export interface CardDAVAccount {
  id: string;
  provider: CardDAVProvider;
  /** Server URL (np. https://contacts.icloud.com/). */
  url: string;
  /** Username (email or per-provider). */
  username: string;
  /** Sync interval seconds. Default 900 (15 min). */
  syncIntervalSec: number;
  /** Last sync Unix ms. */
  lastSyncAt?: number;
  /** Address book href (collection URL). */
  addressBookHref?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SyncResult {
  accountId: string;
  fetched: number;
  pushed: number;
  errors: string[];
  timestamp: number;
}

const STORAGE_KEY = 'actuna.carddav-accounts';

class CardDAVAdapterImpl {
  private _accounts: Map<string, CardDAVAccount> = new Map();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  addAccount(input: {
    provider: CardDAVProvider;
    url: string;
    username: string;
    syncIntervalSec?: number;
  }): CardDAVAccount {
    if (!input.url || !input.username) {
      throw new Error('[CardDAV] addAccount: url + username required');
    }
    const id = `dav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const account: CardDAVAccount = {
      id,
      provider: input.provider,
      url: input.url,
      username: input.username,
      syncIntervalSec: input.syncIntervalSec ?? 900,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    this._accounts.set(id, account);
    this._save();
    return account;
  }

  removeAccount(id: string): boolean {
    const had = this._accounts.delete(id);
    if (had) this._save();
    return had;
  }

  listAccounts(): CardDAVAccount[] {
    return Array.from(this._accounts.values());
  }

  getAccount(id: string): CardDAVAccount | undefined {
    return this._accounts.get(id);
  }

  /**
   * Stub sync — wymaga mailsync-bridge HTTP support (XML PROPFIND/REPORT z Basic/Digest auth).
   * Tutaj tylko zapisuje lastSyncAt + zwraca dummy SyncResult, żeby UI mogło testować flow.
   */
  async syncAccount(id: string): Promise<SyncResult> {
    const account = this._accounts.get(id);
    if (!account || !account.enabled) {
      return { accountId: id, fetched: 0, pushed: 0, errors: ['account not found or disabled'], timestamp: Date.now() };
    }
    // TODO real sync: PROPFIND /addressbooks/.../ → REPORT addressbook-query → parse vCards → upsert ContactCards
    account.lastSyncAt = Date.now();
    account.updatedAt = Date.now();
    this._save();
    return {
      accountId: id,
      fetched: 0,
      pushed: 0,
      errors: ['stub adapter — real CardDAV sync wymaga mailsync-bridge HTTP support (osobny ticket)'],
      timestamp: Date.now(),
    };
  }

  _reset(): void {
    this._accounts.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as CardDAVAccount[];
      for (const a of arr) {
        if (a && a.id) this._accounts.set(a.id, a);
      }
    } catch (e) {
      console.error('[CardDAV] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._accounts.values())));
    } catch (e) {
      console.error('[CardDAV] save failed:', e);
    }
  }
}

export const CardDAVAdapter = new CardDAVAdapterImpl();
