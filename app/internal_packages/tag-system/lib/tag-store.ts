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
 * IMAP X-Keywords sync: czeka na bilet #114 audit log + mailsync-bridge
 * extension; w MVP local-only z warning UI gdy account bez X-Keywords support.
 *
 * Mockup: design/mockups/04-tag-picker.html.
 */

export type TagSource = 'user' | 'system' | 'imap';

export interface Tag {
  id: string;             // unique tag id (slug)
  name: string;           // display label
  color: string;          // CSS color (hex / var(--*))
  source: TagSource;
  /** True dla system tags — NIE editable przez user (manager UI gray out). */
  systemManaged?: boolean;
  /** Optional description. */
  description?: string;
  createdAt: number;
}

const STORAGE_REGISTRY = 'actuna.tags.registry';
const STORAGE_ASSIGNMENTS = 'actuna.tags.assignments';

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

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
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
      .map(id => this._registry.get(id))
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

  /** Apply tag to thread (idempotent). */
  apply(threadId: string, tagId: string): boolean {
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

  /** Remove tag from thread. */
  remove(threadId: string, tagId: string): boolean {
    const set = this._assignments.get(threadId);
    if (!set || !set.has(tagId)) return false;
    set.delete(tagId);
    if (set.size === 0) this._assignments.delete(threadId);
    this._save();
    this._emit();
    return true;
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
    } catch (e) { /* node env */ }
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
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_REGISTRY, JSON.stringify(Array.from(this._registry.values())));
      const arr = Array.from(this._assignments.entries()).map(([tid, set]) => [tid, Array.from(set)] as [string, string[]]);
      localStorage.setItem(STORAGE_ASSIGNMENTS, JSON.stringify(arr));
    } catch (e) {
      console.error('[TagStore] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[TagStore] listener error', e); }
    }
  }
}

export const TagStore = new TagStoreImpl();
