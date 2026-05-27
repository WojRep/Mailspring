/**
 * Sender Approval Store — bilet MVP #94.
 *
 * Trzy listy z localStorage persistence:
 *   - knownSenders: Set<email> — auto-accept future mails from these.
 *   - blocklist: Set<email> — auto-delete future mails (lub move to spam).
 *   - quarantine: Map<email, QuarantineEntry> — pending user decision.
 *
 * Mockup: design/mockups/12-sender-approval.html.
 *
 * TM compliance: "Sender Approval" / "Akceptacja nadawcy" — NIE "Gatekeeper"
 * (Apple TM, per bilet #94 frontmatter).
 *
 * Workflow:
 *   1. Incoming mail from unknown sender → addToQuarantine().
 *   2. User klika "Akceptuj" → acceptSender() → move to knownSenders.
 *   3. User klika "Blokuj" → blockSender() → add to blocklist + delete future.
 *
 * "Unknown sender" heurystyka (per backlog ticket):
 *   from-address NOT in contacts AND NOT in past 10 outbound threads.
 *   Implementation: caller (handler in mail-sync pipeline) decyduje, store
 *   tylko utrzymuje listy.
 */

const STORAGE_KNOWN = 'actuna.sender-approval.known';
const STORAGE_BLOCK = 'actuna.sender-approval.block';
const STORAGE_QUARANTINE = 'actuna.sender-approval.quarantine';

export interface QuarantineEntry {
  email: string;
  /** Display name jeśli był w header From. */
  displayName?: string;
  firstSeenAt: number;
  mailCount: number;
  /** Last mail subject (preview). */
  lastSubject?: string;
  /** Last mail received timestamp. */
  lastReceivedAt: number;
  /** SPF/DKIM/DMARC signals jeśli dostępne. */
  signals?: {
    spf?: 'pass' | 'fail' | 'unknown';
    dkim?: 'pass' | 'fail' | 'unknown';
    dmarc?: 'pass' | 'fail' | 'unknown';
  };
}

class SenderApprovalStoreImpl {
  private _known: Set<string> = new Set();
  private _block: Set<string> = new Set();
  private _quarantine: Map<string, QuarantineEntry> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  /** Returns true gdy unknown (NIE w known, NIE w block, NIE w quarantine). */
  isUnknown(email: string): boolean {
    const e = this._normalize(email);
    return !this._known.has(e) && !this._block.has(e) && !this._quarantine.has(e);
  }

  isKnown(email: string): boolean {
    return this._known.has(this._normalize(email));
  }

  isBlocked(email: string): boolean {
    return this._block.has(this._normalize(email));
  }

  isInQuarantine(email: string): boolean {
    return this._quarantine.has(this._normalize(email));
  }

  /** Add to quarantine — caller wywołuje z incoming mail metadata. */
  addToQuarantine(entry: Omit<QuarantineEntry, 'firstSeenAt' | 'mailCount' | 'lastReceivedAt'> & {
    firstSeenAt?: number;
    mailCount?: number;
    lastReceivedAt?: number;
  }): void {
    const email = this._normalize(entry.email);
    if (!email) return;
    if (this._known.has(email) || this._block.has(email)) return; // skip
    const existing = this._quarantine.get(email);
    const now = Date.now();
    this._quarantine.set(email, {
      email,
      displayName: entry.displayName || existing?.displayName,
      firstSeenAt: existing?.firstSeenAt || entry.firstSeenAt || now,
      mailCount: (existing?.mailCount || 0) + (entry.mailCount || 1),
      lastSubject: entry.lastSubject || existing?.lastSubject,
      lastReceivedAt: entry.lastReceivedAt || now,
      signals: entry.signals || existing?.signals,
    });
    this._save();
    this._emit();
  }

  /** Accept sender — move quarantine → known + future mails auto-accepted. */
  acceptSender(email: string): boolean {
    const e = this._normalize(email);
    if (!e) return false;
    this._known.add(e);
    this._block.delete(e);
    this._quarantine.delete(e);
    this._save();
    this._emit();
    return true;
  }

  /** Block sender — add to blocklist, remove from quarantine + known. */
  blockSender(email: string): boolean {
    const e = this._normalize(email);
    if (!e) return false;
    this._block.add(e);
    this._known.delete(e);
    this._quarantine.delete(e);
    this._save();
    this._emit();
    return true;
  }

  /** Bulk accept/block by domain (np. wszyscy @example.com). */
  acceptDomain(domain: string): number {
    const d = this._normalizeDomain(domain);
    if (!d) return 0;
    let count = 0;
    for (const email of Array.from(this._quarantine.keys())) {
      if (this._extractDomain(email) === d) {
        this.acceptSender(email);
        count++;
      }
    }
    return count;
  }

  blockDomain(domain: string): number {
    const d = this._normalizeDomain(domain);
    if (!d) return 0;
    let count = 0;
    for (const email of Array.from(this._quarantine.keys())) {
      if (this._extractDomain(email) === d) {
        this.blockSender(email);
        count++;
      }
    }
    return count;
  }

  /** Remove from quarantine WITHOUT accept/block (defer decision). */
  removeFromQuarantine(email: string): boolean {
    const e = this._normalize(email);
    return this._quarantine.delete(e);
  }

  listQuarantine(): QuarantineEntry[] {
    return Array.from(this._quarantine.values())
      .sort((a, b) => b.lastReceivedAt - a.lastReceivedAt); // najnowsze pierwsze
  }

  listKnown(): string[] {
    return Array.from(this._known).sort();
  }

  listBlocked(): string[] {
    return Array.from(this._block).sort();
  }

  stats(): { known: number; blocked: number; quarantine: number } {
    return {
      known: this._known.size,
      blocked: this._block.size,
      quarantine: this._quarantine.size,
    };
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._known.clear();
    this._block.clear();
    this._quarantine.clear();
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(STORAGE_KNOWN);
      localStorage.removeItem(STORAGE_BLOCK);
      localStorage.removeItem(STORAGE_QUARANTINE);
    } catch (e) { /* node env */ }
  }

  // === helpers ===

  private _normalize(email: string): string {
    return (email || '').trim().toLowerCase();
  }

  private _normalizeDomain(domain: string): string {
    let d = (domain || '').trim().toLowerCase();
    if (d.startsWith('@')) d = d.slice(1);
    return d;
  }

  private _extractDomain(email: string): string {
    const idx = email.lastIndexOf('@');
    return idx === -1 ? '' : email.slice(idx + 1);
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const known = localStorage.getItem(STORAGE_KNOWN);
      if (known) for (const e of JSON.parse(known)) this._known.add(e);
      const block = localStorage.getItem(STORAGE_BLOCK);
      if (block) for (const e of JSON.parse(block)) this._block.add(e);
      const quarantine = localStorage.getItem(STORAGE_QUARANTINE);
      if (quarantine) {
        for (const e of JSON.parse(quarantine) as QuarantineEntry[]) {
          if (e && e.email) this._quarantine.set(e.email, e);
        }
      }
    } catch (e) {
      console.error('[SenderApproval] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KNOWN, JSON.stringify(Array.from(this._known)));
      localStorage.setItem(STORAGE_BLOCK, JSON.stringify(Array.from(this._block)));
      localStorage.setItem(STORAGE_QUARANTINE, JSON.stringify(Array.from(this._quarantine.values())));
    } catch (e) {
      console.error('[SenderApproval] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[SenderApproval] listener error', e); }
    }
  }
}

export const SenderApprovalStore = new SenderApprovalStoreImpl();
