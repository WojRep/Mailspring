/**
 * Tag system Store — bilet MVP #98.
 *
 * Lokalny tag registry + per-thread assignment + system tags integration.
 *
 * System tags importowane z innych pluginów:
 *   - #96 time-intent-tags: __system_today/__system_upcoming/__system_anytime (NIE editable)
 *   - #93 priority: __system_priority/__system_other manual overrides
 *
 * User-created tags: dowolna nazwa + kolor + multi-assign per thread.
 *
 * Storage:
 *   - localStorage `actuna.tags.registry` — { id, name, color, source }[]
 *   - localStorage `actuna.tags.assignments` — Map<threadId, Set<tagId>>
 *
 * Sync cross-device (bilet #117): localStorage to INSTANT LOCAL CACHE (szybkie
 * odczyty/UI). Źródłem prawdy między urządzeniami jest serwer konta — apply/
 * remove delegują transport do adaptera per konto (sync-adapters/): keywordy
 * IMAP (jak Thunderbird), etykiety Gmail `Tag/...`, kategorie Outlooka przez
 * Exchange. Inbound: TagStore.syncFromThread(delta Thread.customKeywords).
 *
 * Tagi `__system_*` (priority/other override #93, time-intent #96) NIE są
 * syncowane — to lokalne nakładki behawioralne (rollover o północy
 * churnowałby serwer).
 *
 * Mockup: design/mockups/04-tag-picker.html.
 */

import {
  flagColorValue,
  flagColorFor,
  flagTagId,
  flagColorToQuadrant,
} from '../../../src/flag-colors';

// 'flag' = syntetyczny tag koloru flagi Apple (kombinacja $MailFlagBit0/1/2).
export type TagSource = 'user' | 'system' | 'imap' | 'flag';

export interface Tag {
  id: string; // unique tag id (slug)
  name: string; // display label
  color: string; // CSS color (hex / var(--*))
  source: TagSource;
  /** True dla system tags — NIE editable przez user (manager UI gray out). */
  systemManaged?: boolean;
  /** Optional description. */
  description?: string;
  createdAt: number;
}

const STORAGE_REGISTRY = 'actuna.tags.registry';
const STORAGE_ASSIGNMENTS = 'actuna.tags.assignments';
// One-time guard (bilet #117, wzorzec MIGRATED_KEY z PinStore/decyzji #46):
// lokalne przypisania sprzed syncu wypchnięte na serwer przy pierwszym starcie.
const MIGRATED_KEY = 'actuna.tags.migrated-v117';

// Keywordy IMAP innych mechanizmów / klientów — nigdy nie stają się tagami.
const IGNORED_KEYWORDS = new Set([
  '$Pinned', // pin cross-device #93/#46 — osobny mechanizm
  '$Forwarded',
  '$MDNSent',
  '$Junk',
  '$NotJunk',
  'Junk',
  'NonJunk',
  'NotJunk',
  '$Phishing',
  '$HasAttachment',
  '$HasNoAttachment',
  // Kolory flag Apple Mail — obsługiwane jako jeden syntetyczny tag koloru
  // (flag_<value>), NIE jako 3 surowe tagi bitowe. Patrz syncFlagColorFromThread.
  '$MailFlagBit0',
  '$MailFlagBit1',
  '$MailFlagBit2',
]);

// Wbudowane tagi Thunderbirda (interop): keyword → nazwa + domyślny kolor TB.
// (Kolor TB jest lokalny po IMAP — odwzorowujemy domyślną paletę Thunderbirda.)
const THUNDERBIRD_LABELS: Record<string, { name: string; color: string }> = {
  $label1: { name: 'Important', color: 'var(--flag-red)' },
  $label2: { name: 'Work', color: 'var(--flag-orange)' },
  $label3: { name: 'Personal', color: 'var(--flag-green)' },
  $label4: { name: 'ToDo', color: 'var(--flag-blue)' },
  $label5: { name: 'Later', color: 'var(--flag-purple)' },
};

// Default color palette (WCAG-safe vs surfaces, design tokens recommended)
export const DEFAULT_COLORS = [
  'var(--accent-500)',
  'var(--intent-decision)',
  'var(--intent-meeting)',
  'var(--intent-invoice)',
  'var(--intent-alert)',
  'var(--success-500)',
  'var(--warning-500)',
  'var(--danger-500)',
  'var(--info-500)',
];

class TagStoreImpl {
  private _registry: Map<string, Tag> = new Map();
  private _assignments: Map<string, Set<string>> = new Map(); // threadId → Set<tagId>
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;
  // Tryb wsadowy: podczas sweepu/delty (setki–tysiące wątków) odkładamy _save()/
  // _emit() do jednego flushu na końcu (inaczej tysiące zapisów do localStorage
  // = zacięcie UI na starcie). Patrz main.ts initialReconcileSweep + delta loop.
  private _batch = false;
  private _batchDirty = false;

  beginBatch(): void {
    this._batch = true;
    this._batchDirty = false;
  }

  endBatch(): void {
    this._batch = false;
    if (this._batchDirty) {
      this._save();
      this._emit();
    }
    this._batchDirty = false;
  }

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
    this.purgeIgnoredKeywordTags(); // sprzątnij surowe $MailFlagBit*/NotJunk z poprzednich wersji
    this._migrateLocalAssignmentsToServer();
  }

  /**
   * Jednorazowa migracja (bilet #117): przypisania tagów utworzone na lokalnej
   * wersji (#98 MVP) nigdy nie trafiły na serwer. Przy pierwszym uruchomieniu
   * po update wypychamy je adapterem konta (keyword/etykieta), żeby stały się
   * cross-device. Idempotentne (flaga w localStorage) — wzorzec PinStore #46.
   */
  private _migrateLocalAssignmentsToServer(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      if (localStorage.getItem(MIGRATED_KEY)) return;
      for (const [threadId, tagIds] of this._assignments) {
        for (const tagId of tagIds) {
          const tag = this._registry.get(tagId);
          if (tag && !tagId.startsWith('__system_')) {
            this._queueSync(threadId, tag, true);
          }
        }
      }
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch (e) {
      /* storage error — retry next launch */
    }
  }

  // === Registry CRUD ===

  /** Register new tag (or replace if same id). */
  register(tag: Omit<Tag, 'createdAt'> & { createdAt?: number }): Tag {
    if (!tag.id || !tag.name) {
      throw new Error('[TagStore] register: id + name required');
    }
    const existing = this._registry.get(tag.id);
    const created: Tag = {
      createdAt: tag.createdAt || existing?.createdAt || Date.now(),
      ...tag,
    };
    this._registry.set(tag.id, created);
    this._save();
    this._emit();
    return created;
  }

  /** Bulk register (np. dla system tags z plugin activation). */
  registerAll(tags: Array<Omit<Tag, 'createdAt'>>): void {
    for (const t of tags) {
      if (!t.id || !t.name) continue;
      const existing = this._registry.get(t.id);
      this._registry.set(t.id, { ...t, createdAt: existing?.createdAt || Date.now() });
    }
    this._save();
    this._emit();
  }

  get(id: string): Tag | undefined {
    return this._registry.get(id);
  }

  list(): Tag[] {
    return Array.from(this._registry.values()).sort((a, b) => {
      // System tags na końcu, user tags pierwsze alphabetic
      if (a.systemManaged && !b.systemManaged) return 1;
      if (!a.systemManaged && b.systemManaged) return -1;
      return a.name.localeCompare(b.name);
    });
  }

  /** Rename tag (NIE dla system-managed). */
  rename(id: string, newName: string): boolean {
    const tag = this._registry.get(id);
    if (!tag || tag.systemManaged) return false;
    if (!newName.trim()) return false;
    this._registry.set(id, { ...tag, name: newName.trim() });
    this._save();
    this._emit();
    return true;
  }

  /** Change tag color (NIE dla system-managed). */
  setColor(id: string, color: string): boolean {
    const tag = this._registry.get(id);
    if (!tag || tag.systemManaged) return false;
    this._registry.set(id, { ...tag, color });
    this._save();
    this._emit();
    return true;
  }

  /** Delete tag — usuwa z registry + ze wszystkich assignments. NIE dla system. */
  delete(id: string): boolean {
    const tag = this._registry.get(id);
    if (!tag || tag.systemManaged) return false;
    this._registry.delete(id);
    for (const tagSet of this._assignments.values()) {
      tagSet.delete(id);
    }
    this._save();
    this._emit();
    return true;
  }

  /** Merge two tags — sourceId moved to targetId, source deleted. */
  merge(sourceId: string, targetId: string): boolean {
    if (sourceId === targetId) return false;
    const source = this._registry.get(sourceId);
    const target = this._registry.get(targetId);
    if (!source || !target || source.systemManaged) return false;
    // Move all assignments
    for (const tagSet of this._assignments.values()) {
      if (tagSet.delete(sourceId)) tagSet.add(targetId);
    }
    this._registry.delete(sourceId);
    this._save();
    this._emit();
    return true;
  }

  // === Per-thread assignments ===

  /** Get tags assigned to thread. */
  getTags(threadId: string): Tag[] {
    const ids = this._assignments.get(threadId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this._registry.get(id))
      .filter((t): t is Tag => !!t);
  }

  /** Get tag ids assigned to thread. */
  getTagIds(threadId: string): string[] {
    const ids = this._assignments.get(threadId);
    return ids ? Array.from(ids) : [];
  }

  hasTag(threadId: string, tagId: string): boolean {
    return this._assignments.get(threadId)?.has(tagId) ?? false;
  }

  /**
   * Reverse lookup (bilet #119): wątki z danym tagiem — zasila perspektywy
   * sidebara (ThreadIdListPerspective) i liczniki. O(wątki z tagami).
   */
  threadIdsWithTag(tagId: string): string[] {
    const out: string[] = [];
    if (!tagId) return out;
    for (const [threadId, tagIds] of this._assignments) {
      if (tagIds.has(tagId)) out.push(threadId);
    }
    return out;
  }

  /**
   * Apply tag to thread (idempotent). Lokalny cache natychmiast (instant UI),
   * dodatkowo fire-and-forget sync na serwer konta przez adapter (#117).
   */
  apply(threadId: string, tagId: string): boolean {
    const changed = this._applyLocal(threadId, tagId);
    if (changed) {
      const tag = this._registry.get(tagId);
      if (tag) this._queueSync(threadId, tag, true);
    }
    return changed;
  }

  /** Remove tag from thread. Lokalnie + sync przez adapter (#117). */
  remove(threadId: string, tagId: string): boolean {
    const tag = this._registry.get(tagId);
    const changed = this._removeLocal(threadId, tagId);
    if (changed && tag) {
      this._queueSync(threadId, tag, false);
    }
    return changed;
  }

  /** Lokalna mutacja bez dyspozycji syncu — używane przez inbound reconcile. */
  private _applyLocal(threadId: string, tagId: string): boolean {
    if (!threadId || !tagId) return false;
    if (!this._registry.has(tagId)) return false;
    let set = this._assignments.get(threadId);
    if (!set) {
      set = new Set();
      this._assignments.set(threadId, set);
    }
    if (set.has(tagId)) return false;
    set.add(tagId);
    this._save();
    this._emit();
    return true;
  }

  private _removeLocal(threadId: string, tagId: string): boolean {
    const set = this._assignments.get(threadId);
    if (!set || !set.has(tagId)) return false;
    set.delete(tagId);
    if (set.size === 0) this._assignments.delete(threadId);
    this._save();
    this._emit();
    return true;
  }

  /**
   * Inbound reconcile (bilet #117): delta Thread z silnika C++ niesie unię
   * keywordów IMAP wiadomości wątku. Serwer = źródło prawdy:
   *  - keyword znanego tagu → przypisanie dodane,
   *  - keyword nieznany → auto-rejestracja tagu (source 'imap'; mapowanie
   *    wbudowanych tagów Thunderbirda $label1..$label5),
   *  - keyword zniknął → przypisanie usunięte (tylko tagi sync-eligible).
   * Konta bez transportu keywordowego (gmail/local) NIE są reconcile'owane —
   * pusta lista keywordów nie może wycinać lokalnych przypisań.
   */
  syncFromThread(thread: { id: string; accountId?: string; customKeywords?: string[] }): void {
    if (!thread || !thread.id || !Array.isArray(thread.customKeywords)) return;
    const adapter = this._adapterForAccountId(thread.accountId);
    if (!adapter || (adapter.kind !== 'imap-keyword' && adapter.kind !== 'exchange-category')) {
      return;
    }
    let keywordForTagName: (n: string) => string;
    try {
      ({ keywordForTagName } = require('./sync-adapters/tag-sync-adapters'));
    } catch (e) {
      return;
    }

    const presentTagIds = new Set<string>();
    for (const kw of thread.customKeywords) {
      if (!kw || IGNORED_KEYWORDS.has(kw)) continue;
      const tbLabel = THUNDERBIRD_LABELS[kw];
      const displayName = tbLabel ? tbLabel.name : kw;
      const wanted = keywordForTagName(displayName);
      let tag = Array.from(this._registry.values()).find(
        (t) => keywordForTagName(t.name) === wanted
      );
      if (!tag) {
        tag = this.register({
          id: `imap_${wanted}`,
          name: displayName,
          color: tbLabel ? tbLabel.color : DEFAULT_COLORS[0],
          source: 'imap',
        });
      }
      presentTagIds.add(tag.id);
      this._applyLocal(thread.id, tag.id);
    }

    for (const tagId of this.getTagIds(thread.id)) {
      if (presentTagIds.has(tagId)) continue;
      if (tagId.startsWith('__system_')) continue; // lokalne nakładki — nie z serwera
      if (tagId.startsWith('flag_')) continue; // kolor flagi zarządza syncFlagColorFromThread
      this._removeLocal(thread.id, tagId);
    }
  }

  /**
   * Kolorowe flagi Apple Mail: kombinacja $MailFlagBit0/1/2 (+ \Flagged=starred)
   * = JEDEN syntetyczny tag koloru `flag_<value>` (NIE 3 surowe tagi bitowe).
   * Reconcile per wątek; niezależne od adaptera (keywordy są już w deltcie).
   * Wołane z tej samej ścieżki delt co syncFromThread (main.ts).
   */
  syncFlagColorFromThread(thread: {
    id: string;
    customKeywords?: string[];
    starred?: boolean;
  }): void {
    if (!thread || !thread.id) return;
    // reconcile: zdejmij dotychczasowy kolor flagi z tego wątku; zapamiętaj go,
    // by mapować priorytet TYLKO przy realnej zmianie koloru.
    let prevValue: number | null = null;
    for (const tagId of this.getTagIds(thread.id)) {
      if (tagId.startsWith('flag_')) {
        const n = parseInt(tagId.slice('flag_'.length), 10);
        if (!Number.isNaN(n)) prevValue = n;
        this._removeLocal(thread.id, tagId);
      }
    }
    const value = flagColorValue(thread.customKeywords, !!thread.starred);
    if (value === null) return;
    const fc = flagColorFor(value);
    if (!fc) return;
    const id = flagTagId(value);
    if (!this._registry.has(id)) {
      this.register({ id, name: this._flagColorName(fc.nameKey), color: fc.token, source: 'flag' });
    }
    this._applyLocal(thread.id, id);
    // Mapowanie na priorytet tylko gdy kolor się ZMIENIŁ — nie na każdym sync
    // tego samego koloru (inaczej nadpisywałoby ręczny priorytet co deltę).
    if (value !== prevValue) this._maybeMapFlagToPriority(thread.id, value);
  }

  /**
   * Mapowanie kolor flagi → kwadrant Eisenhowera (#120). Domyślnie ON
   * (core.flags.mapToPriority), tylko gdy aktywny preset 'eisenhower'.
   * Jednokierunkowo (flaga → priorytet); ręczna zmiana priorytetu nie rusza flagi.
   */
  private _maybeMapFlagToPriority(threadId: string, value: number): void {
    try {
      const env = (window as any).AppEnv;
      if (!env || !env.config || env.config.get('core.flags.mapToPriority') === false) return;
      const presetMod = require('./priority-preset-store');
      const PriorityPresetStore = presetMod.PriorityPresetStore;
      if (!PriorityPresetStore || PriorityPresetStore.activePreset() !== 'eisenhower') return;
      const quadrant = flagColorToQuadrant(value);
      if (quadrant) PriorityPresetStore.setPriority(threadId, quadrant);
    } catch (e) {
      /* preset/config niedostępne */
    }
  }

  private _flagColorName(nameKey: string): string {
    try {
      const { localized } = require('actunamail-exports');
      return typeof localized === 'function' ? localized(nameKey) : nameKey;
    } catch (e) {
      return nameKey;
    }
  }

  /**
   * Migracja jednorazowa: usuń surowe tagi $MailFlagBit* zaciągnięte zanim
   * dodaliśmy je do IGNORED. ZAWĘŻONE do rodziny $MailFlagBit\d+ (jednoznacznie
   * techniczne) — NIE czyścimy gołego „Junk"/„NotJunk", bo to mógłby być legalny
   * keyword użytkownika/serwera (ryzyko utraty danych — przegląd).
   */
  purgeIgnoredKeywordTags(): number {
    let n = 0;
    const isRawFlagBit = (name: string) => /^\$MailFlagBit\d+$/.test(name);
    for (const [id, tag] of Array.from(this._registry)) {
      if (tag.source === 'imap' && isRawFlagBit(tag.name)) {
        this._registry.delete(id);
        for (const set of this._assignments.values()) set.delete(id);
        n++;
      }
    }
    if (n > 0) {
      this._save();
      this._emit();
    }
    return n;
  }

  private _adapterForAccountId(accountId?: string) {
    try {
      const { AccountStore } = require('actunamail-exports');
      const { adapterForAccount } = require('./sync-adapters/tag-sync-adapters');
      const account =
        accountId && AccountStore && AccountStore.accountForId
          ? AccountStore.accountForId(accountId)
          : null;
      if (!account) return null;
      return adapterForAccount(account);
    } catch (e) {
      return null;
    }
  }

  /**
   * Cross-device dispatch (bilet #117, wzorzec PinStore._queueSyncTask #46):
   * rozwiąż Thread z DB, wybierz adapter konta, wyślij apply/remove.
   * Fire-and-forget; brak exports/threadu/konta = no-op (cache lokalny zostaje).
   * Tagi `__system_*` nigdy nie wychodzą na serwer.
   */
  private _queueSync(threadId: string, tag: Tag, add: boolean): void {
    if (!tag || tag.id.startsWith('__system_')) return;
    try {
      const exp = require('actunamail-exports');
      const { DatabaseStore, Thread, AccountStore } = exp;
      if (!DatabaseStore || !Thread) return;
      Promise.resolve(DatabaseStore.find(Thread, threadId))
        .then((thread: any) => {
          if (!thread) return;
          const account =
            AccountStore && AccountStore.accountForId
              ? AccountStore.accountForId(thread.accountId)
              : null;
          if (!account) return;
          const { adapterForAccount } = require('./sync-adapters/tag-sync-adapters');
          const adapter = adapterForAccount(account);
          if (add) adapter.applyTag(thread, tag);
          else adapter.removeTag(thread, tag);
        })
        .catch(() => {
          /* offline / not found — lokalny cache nadal odzwierciedla tag */
        });
    } catch (e) {
      /* actunamail-exports unavailable (node-only context) */
    }
  }

  /** Toggle assignment. */
  toggle(threadId: string, tagId: string): boolean {
    if (this.hasTag(threadId, tagId)) {
      this.remove(threadId, tagId);
      return false;
    }
    return this.apply(threadId, tagId);
  }

  /** Bulk apply N tagów do M threads. */
  applyBulk(threadIds: string[], tagIds: string[]): number {
    let changes = 0;
    for (const tid of threadIds) {
      for (const tagId of tagIds) {
        if (this.apply(tid, tagId)) changes++;
      }
    }
    return changes;
  }

  /** Stats. */
  stats(): { totalTags: number; systemTags: number; userTags: number; totalAssignments: number } {
    let systemTags = 0;
    for (const t of this._registry.values()) {
      if (t.systemManaged) systemTags++;
    }
    let totalAssignments = 0;
    for (const s of this._assignments.values()) totalAssignments += s.size;
    return {
      totalTags: this._registry.size,
      systemTags,
      userTags: this._registry.size - systemTags,
      totalAssignments,
    };
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._registry.clear();
    this._assignments.clear();
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(STORAGE_REGISTRY);
      localStorage.removeItem(STORAGE_ASSIGNMENTS);
      localStorage.removeItem(MIGRATED_KEY);
    } catch (e) {
      /* node env */
    }
  }

  // === internals ===

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const reg = localStorage.getItem(STORAGE_REGISTRY);
      if (reg) {
        for (const t of JSON.parse(reg) as Tag[]) {
          if (t && t.id) this._registry.set(t.id, t);
        }
      }
      const ass = localStorage.getItem(STORAGE_ASSIGNMENTS);
      if (ass) {
        const arr = JSON.parse(ass) as Array<[string, string[]]>;
        for (const [tid, tags] of arr) {
          if (tid && Array.isArray(tags)) this._assignments.set(tid, new Set(tags));
        }
      }
    } catch (e) {
      console.error('[TagStore] load failed:', e);
    }
  }

  private _save(): void {
    if (this._batch) {
      this._batchDirty = true;
      return;
    }
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_REGISTRY, JSON.stringify(Array.from(this._registry.values())));
      const arr = Array.from(this._assignments.entries()).map(
        ([tid, set]) => [tid, Array.from(set)] as [string, string[]]
      );
      localStorage.setItem(STORAGE_ASSIGNMENTS, JSON.stringify(arr));
    } catch (e) {
      console.error('[TagStore] save failed:', e);
    }
  }

  private _emit(): void {
    if (this._batch) {
      this._batchDirty = true;
      return;
    }
    for (const cb of this._listeners) {
      try {
        cb();
      } catch (e) {
        console.error('[TagStore] listener error', e);
      }
    }
  }
}

export const TagStore = new TagStoreImpl();
