/**
 * Smart Folder Store — bilet MVP #99.
 *
 * CRUD dla user-defined Smart Folders. JSON export/import.
 *
 * Mockup: design/mockups/14-smart-folder-wizard.html.
 */

import { SmartFolderDefinition, Rule, MatchMode, filterThreads, ThreadMeta } from './rule-engine';

const STORAGE_KEY = 'actuna.smart-folders';
const JSON_VERSION = '1.0';

class SmartFolderStoreImpl {
  private _folders: Map<string, SmartFolderDefinition> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === CRUD ===

  create(params: {
    name: string;
    color?: string;
    match: MatchMode;
    rules: Rule[];
    sort?: SmartFolderDefinition['sort'];
    realtime?: boolean;
    notifyOnMatch?: boolean;
  }): SmartFolderDefinition {
    if (!params.name.trim()) {
      throw new Error('[SmartFolder] create: name required');
    }
    const id = this._generateId();
    const now = Date.now();
    const folder: SmartFolderDefinition = {
      id,
      name: params.name.trim(),
      color: params.color || 'var(--accent-500)',
      match: params.match,
      rules: params.rules || [],
      sort: params.sort || 'date_desc',
      realtime: params.realtime ?? true,
      notifyOnMatch: params.notifyOnMatch ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this._folders.set(id, folder);
    this._save();
    this._emit();
    return folder;
  }

  update(id: string, patch: Partial<Omit<SmartFolderDefinition, 'id' | 'createdAt'>>): SmartFolderDefinition | undefined {
    const existing = this._folders.get(id);
    if (!existing) return undefined;
    const updated: SmartFolderDefinition = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this._folders.set(id, updated);
    this._save();
    this._emit();
    return updated;
  }

  delete(id: string): boolean {
    const had = this._folders.delete(id);
    if (had) {
      this._save();
      this._emit();
    }
    return had;
  }

  get(id: string): SmartFolderDefinition | undefined {
    return this._folders.get(id);
  }

  list(): SmartFolderDefinition[] {
    return Array.from(this._folders.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  count(): number {
    return this._folders.size;
  }

  /** Apply folder's rules to thread set → matching threads. */
  match(folderId: string, threads: ThreadMeta[]): ThreadMeta[] {
    const f = this._folders.get(folderId);
    if (!f) return [];
    return filterThreads(f.rules, f.match, threads);
  }

  // === Export / Import ===

  exportJSON(): string {
    const payload = {
      version: JSON_VERSION,
      exportedAt: Date.now(),
      folders: Array.from(this._folders.values()),
    };
    return JSON.stringify(payload, null, 2);
  }

  /** Import — returns count of imported folders. Throws on invalid JSON. */
  importJSON(json: string, options: { replace?: boolean } = {}): number {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.folders)) {
      throw new Error('[SmartFolder] importJSON: invalid format — missing "folders" array');
    }
    if (data.version && data.version !== JSON_VERSION) {
      console.warn(`[SmartFolder] importJSON: version mismatch — got ${data.version}, expected ${JSON_VERSION}`);
    }
    if (options.replace) this._folders.clear();
    let count = 0;
    const now = Date.now();
    for (const f of data.folders as SmartFolderDefinition[]) {
      if (!f.name || !f.match || !Array.isArray(f.rules)) continue;
      // Generate new id (avoid collisions)
      const newId = this._generateId();
      const folder: SmartFolderDefinition = {
        id: newId,
        name: f.name,
        color: f.color || 'var(--accent-500)',
        match: f.match,
        rules: f.rules,
        sort: f.sort || 'date_desc',
        realtime: f.realtime ?? true,
        notifyOnMatch: f.notifyOnMatch ?? false,
        createdAt: f.createdAt || now,
        updatedAt: now,
      };
      this._folders.set(newId, folder);
      count++;
    }
    if (count > 0) {
      this._save();
      this._emit();
    }
    return count;
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._folders.clear();
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  // === internals ===

  private _generateId(): string {
    return `sf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as SmartFolderDefinition[];
      for (const f of arr) {
        if (f && f.id) this._folders.set(f.id, f);
      }
    } catch (e) {
      console.error('[SmartFolder] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._folders.values())));
    } catch (e) {
      console.error('[SmartFolder] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[SmartFolder] listener error', e); }
    }
  }
}

export const SmartFolderStore = new SmartFolderStoreImpl();
