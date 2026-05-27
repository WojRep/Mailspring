/**
 * PGP Key Store — bilet MVP #112.
 *
 * State management dla PGP key pairs per account. Faktyczna kryptografia
 * (RSA 4096 / Curve25519 generation, sign/encrypt/decrypt operations) wymaga
 * openpgpjs library — odłożone do osobnego integration ticketu.
 *
 * **Tier B encryption MANDATORY** dla privateKey persistence (KNF + GDPR Art. 32
 * adequate security). Tutaj plain storage z TODO marker.
 */

export type PgpKeyType = 'rsa_4096' | 'curve25519' | 'unknown';

export type PgpKeySource = 'generated' | 'imported_armored' | 'imported_smime_p12' | 'fetched_keyserver';

export interface PgpKeyPair {
  /** Unique key id (różne od fingerprint — fingerprint może collide). */
  id: string;
  /** Account this pair belongs to. */
  accountId: string;
  /** Owner email. */
  email: string;
  /** Key type. */
  type: PgpKeyType;
  /** ASCII-armored public key. */
  publicKeyArmored: string;
  /** ASCII-armored private key (encrypted z passphrase). **Tier B encrypt przy save.** */
  privateKeyArmored?: string;
  /** Fingerprint SHA-1 lub SHA-256 hex. */
  fingerprint: string;
  /** Creation timestamp. */
  createdAt: number;
  /** Expiry timestamp (optional). */
  expiresAt?: number;
  source: PgpKeySource;
  /** Has user-set passphrase (private key encrypted at rest)? */
  hasPassphrase: boolean;
  /** Sign outgoing mails by default? Opt-in. */
  signOutgoing: boolean;
}

export interface PublicKeyEntry {
  /** Foreign email. */
  email: string;
  publicKeyArmored: string;
  fingerprint: string;
  /** Trust level (trust on first use / verified). */
  trustLevel: 'unknown' | 'tofu' | 'verified';
  importedAt: number;
}

export type SignatureStatus = 'valid' | 'invalid' | 'unknown_key' | 'expired' | 'unsigned';

export interface VerificationResult {
  status: SignatureStatus;
  /** Fingerprint signera (z signature payload). */
  signerFingerprint?: string;
  /** Email signera (z UserID). */
  signerEmail?: string;
  /** Human-readable PL message. */
  reason?: string;
}

const PAIRS_KEY = 'actuna.pgp-keypairs';
const PUBKEYS_KEY = 'actuna.pgp-pubkeys';

/** Tier B encryption marker — privateKey wymaga encryption layer (depends #46). */
export const TIER_B_FIELDS = new Set<keyof PgpKeyPair>(['privateKeyArmored']);

class PgpKeyStoreImpl {
  /** accountId → key pair (max 1 active per account). */
  private _pairs: Map<string, PgpKeyPair> = new Map();
  /** email (lowercased) → foreign public key. */
  private _pubkeys: Map<string, PublicKeyEntry> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Own key pairs ===

  upsertOwnPair(pair: Omit<PgpKeyPair, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): PgpKeyPair {
    if (!pair.accountId || !pair.email) {
      throw new Error('[PGP] accountId + email required');
    }
    if (!pair.publicKeyArmored || !pair.fingerprint) {
      throw new Error('[PGP] publicKeyArmored + fingerprint required');
    }
    const now = Date.now();
    const existing = this._pairs.get(pair.accountId);
    const final: PgpKeyPair = {
      id: pair.id || existing?.id || this._generateId('pgp'),
      accountId: pair.accountId,
      email: pair.email.toLowerCase().trim(),
      type: pair.type,
      publicKeyArmored: pair.publicKeyArmored,
      privateKeyArmored: pair.privateKeyArmored ?? existing?.privateKeyArmored,
      fingerprint: pair.fingerprint.toLowerCase(),
      createdAt: pair.createdAt || existing?.createdAt || now,
      expiresAt: pair.expiresAt,
      source: pair.source,
      hasPassphrase: pair.hasPassphrase,
      signOutgoing: pair.signOutgoing,
    };
    this._pairs.set(pair.accountId, final);
    this._save();
    this._emit();
    return final;
  }

  getOwnPair(accountId: string): PgpKeyPair | undefined {
    return this._pairs.get(accountId);
  }

  listOwnPairs(): PgpKeyPair[] {
    return Array.from(this._pairs.values()).sort((a, b) => a.email.localeCompare(b.email));
  }

  deleteOwnPair(accountId: string): boolean {
    const had = this._pairs.delete(accountId);
    if (had) {
      this._save();
      this._emit();
    }
    return had;
  }

  setSignOutgoing(accountId: string, enabled: boolean): PgpKeyPair | undefined {
    const pair = this._pairs.get(accountId);
    if (!pair) return undefined;
    pair.signOutgoing = enabled;
    this._save();
    this._emit();
    return pair;
  }

  // === Foreign public keys ===

  importPublicKey(input: Omit<PublicKeyEntry, 'importedAt'>): PublicKeyEntry {
    if (!input.email || !input.publicKeyArmored || !input.fingerprint) {
      throw new Error('[PGP] email + publicKeyArmored + fingerprint required');
    }
    const entry: PublicKeyEntry = {
      email: input.email.toLowerCase().trim(),
      publicKeyArmored: input.publicKeyArmored,
      fingerprint: input.fingerprint.toLowerCase(),
      trustLevel: input.trustLevel || 'tofu',
      importedAt: Date.now(),
    };
    this._pubkeys.set(entry.email, entry);
    this._save();
    this._emit();
    return entry;
  }

  getPublicKey(email: string): PublicKeyEntry | undefined {
    return this._pubkeys.get(email.toLowerCase().trim());
  }

  setTrustLevel(email: string, trust: PublicKeyEntry['trustLevel']): PublicKeyEntry | undefined {
    const k = this._pubkeys.get(email.toLowerCase().trim());
    if (!k) return undefined;
    k.trustLevel = trust;
    this._save();
    this._emit();
    return k;
  }

  hasPublicKeyFor(email: string): boolean {
    return this._pubkeys.has(email.toLowerCase().trim());
  }

  /** Can encrypt to this email? True gdy mamy public key. */
  canEncryptTo(email: string): boolean {
    return this.hasPublicKeyFor(email);
  }

  /** Can encrypt to all? Każdy z list musi mieć key. */
  canEncryptToAll(emails: string[]): { ok: boolean; missing: string[] } {
    const missing = emails.filter(e => !this.canEncryptTo(e));
    return { ok: missing.length === 0, missing };
  }

  listPublicKeys(): PublicKeyEntry[] {
    return Array.from(this._pubkeys.values()).sort((a, b) => a.email.localeCompare(b.email));
  }

  // === QR sync (data encoding only — UI ticket robi QR canvas) ===

  /** Pack public key + fingerprint do JSON do QR encoding. */
  buildQrPayload(accountId: string): string | null {
    const pair = this._pairs.get(accountId);
    if (!pair) return null;
    return JSON.stringify({
      v: 1,
      email: pair.email,
      fingerprint: pair.fingerprint,
      publicKeyArmored: pair.publicKeyArmored,
    });
  }

  /** Parse incoming QR scan payload → PublicKeyEntry (do importu). */
  parseQrPayload(qrText: string): Omit<PublicKeyEntry, 'importedAt' | 'trustLevel'> | null {
    try {
      const data = JSON.parse(qrText);
      if (data.v !== 1) return null;
      if (!data.email || !data.fingerprint || !data.publicKeyArmored) return null;
      return {
        email: data.email,
        fingerprint: data.fingerprint,
        publicKeyArmored: data.publicKeyArmored,
      };
    } catch (e) {
      return null;
    }
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._pairs.clear();
    this._pubkeys.clear();
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(PAIRS_KEY);
      localStorage.removeItem(PUBKEYS_KEY);
    } catch (e) { /* node env */ }
  }

  // === internals ===

  private _generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const rawP = localStorage.getItem(PAIRS_KEY);
      if (rawP) {
        const arr = JSON.parse(rawP) as PgpKeyPair[];
        for (const p of arr) if (p && p.accountId) this._pairs.set(p.accountId, p);
      }
      const rawK = localStorage.getItem(PUBKEYS_KEY);
      if (rawK) {
        const arr = JSON.parse(rawK) as PublicKeyEntry[];
        for (const k of arr) if (k && k.email) this._pubkeys.set(k.email, k);
      }
    } catch (e) {
      console.error('[PGP] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      // TODO #46/Tier B: encrypt privateKeyArmored przed JSON.stringify
      localStorage.setItem(PAIRS_KEY, JSON.stringify(Array.from(this._pairs.values())));
      localStorage.setItem(PUBKEYS_KEY, JSON.stringify(Array.from(this._pubkeys.values())));
    } catch (e) {
      console.error('[PGP] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[PGP] listener error', e); }
    }
  }
}

export const PgpKeyStore = new PgpKeyStoreImpl();
