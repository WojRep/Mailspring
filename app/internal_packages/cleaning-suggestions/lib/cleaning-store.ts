/**
 * Cleaning Suggestions + Read Later Store — bilet MVP #116.
 *
 * Stan: settings (enabled + scope categories + first-run done), saved suggestions (dismissed/acted),
 * Read Later digest schedule.
 *
 * Background scan + bulk delete dispatch + digest email send — UI/integration ticket.
 */

import { MessageCategory, CleaningSuggestion } from './suggestions-engine';

export interface CleaningSettings {
  enabled: boolean;
  /** Subset kategorii do background scan. Default wszystkie 3 non-other. */
  scopeCategories: MessageCategory[];
  firstRunDone: boolean;
}

export type DigestSchedule = 'off' | 'daily_9am' | 'weekly_mon_9am';

export interface ReadLaterSettings {
  enabled: boolean;
  /** Tag używany jako trigger (default 'newsletter'). */
  triggerTag: string;
  /** Folder docelowy (default 'Read Later'). */
  targetFolder: string;
  /** Digest schedule. */
  digestSchedule: DigestSchedule;
}

export type SuggestionAction = 'dismissed' | 'acted' | 'snoozed';

export interface SuggestionRecord {
  /** Suggestion id (z engine). */
  id: string;
  scopeType: 'sender' | 'domain';
  scopeValue: string;
  category: MessageCategory;
  action: SuggestionAction;
  /** Timestamp of action. */
  actionAt: number;
  /** Affected thread count (do undo + audit). */
  affectedCount?: number;
}

const SETTINGS_KEY = 'actuna.cleaning-settings';
const READLATER_KEY = 'actuna.read-later-settings';
const HISTORY_KEY = 'actuna.cleaning-history';

class CleaningStoreImpl {
  private _settings: CleaningSettings = {
    enabled: true,
    scopeCategories: ['promo', 'notifications', 'newsletters'],
    firstRunDone: false,
  };
  private _readLater: ReadLaterSettings = {
    enabled: false,
    triggerTag: 'newsletter',
    targetFolder: 'Read Later',
    digestSchedule: 'off',
  };
  private _history: SuggestionRecord[] = [];
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Cleaning settings ===

  getSettings(): CleaningSettings {
    return {
      enabled: this._settings.enabled,
      scopeCategories: [...this._settings.scopeCategories],
      firstRunDone: this._settings.firstRunDone,
    };
  }

  setEnabled(enabled: boolean): void {
    this._settings.enabled = enabled;
    this._save();
    this._emit();
  }

  setScopeCategories(cats: MessageCategory[]): void {
    this._settings.scopeCategories = cats.filter(c => c !== 'other');
    this._save();
    this._emit();
  }

  markFirstRunDone(): void {
    this._settings.firstRunDone = true;
    this._save();
    this._emit();
  }

  shouldOfferFirstRun(): boolean {
    return !this._settings.firstRunDone;
  }

  // === Read Later settings ===

  getReadLaterSettings(): ReadLaterSettings {
    return { ...this._readLater };
  }

  setReadLaterEnabled(enabled: boolean): void {
    this._readLater.enabled = enabled;
    this._saveReadLater();
    this._emit();
  }

  setReadLaterTriggerTag(tag: string): void {
    if (!tag.trim()) throw new Error('[Cleaning] trigger tag required');
    this._readLater.triggerTag = tag.trim();
    this._saveReadLater();
    this._emit();
  }

  setReadLaterTargetFolder(folder: string): void {
    if (!folder.trim()) throw new Error('[Cleaning] target folder required');
    this._readLater.targetFolder = folder.trim();
    this._saveReadLater();
    this._emit();
  }

  setDigestSchedule(schedule: DigestSchedule): void {
    this._readLater.digestSchedule = schedule;
    this._saveReadLater();
    this._emit();
  }

  /** Compute next digest fire time z schedule + now. */
  nextDigestAt(now = Date.now()): number | null {
    if (this._readLater.digestSchedule === 'off') return null;
    const d = new Date(now);
    if (this._readLater.digestSchedule === 'daily_9am') {
      d.setHours(9, 0, 0, 0);
      if (d.getTime() <= now) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    if (this._readLater.digestSchedule === 'weekly_mon_9am') {
      d.setHours(9, 0, 0, 0);
      // Monday = 1
      const cur = d.getDay();
      let diff = 1 - cur;
      if (diff < 0 || (diff === 0 && d.getTime() <= now)) diff += 7;
      d.setDate(d.getDate() + diff);
      return d.getTime();
    }
    return null;
  }

  // === Suggestion history (dismissed / acted) ===

  /** Sprawdź czy suggestion w tym scope był dismissed wcześniej (avoid re-show). */
  isScopeRecentlyHandled(scopeType: 'sender' | 'domain', scopeValue: string, category: MessageCategory, withinDays = 7): boolean {
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    return this._history.some(r =>
      r.scopeType === scopeType &&
      r.scopeValue === scopeValue.toLowerCase() &&
      r.category === category &&
      r.actionAt >= cutoff,
    );
  }

  recordAction(suggestion: CleaningSuggestion, action: SuggestionAction, affectedCount?: number): SuggestionRecord {
    const record: SuggestionRecord = {
      id: suggestion.id,
      scopeType: suggestion.scopeType,
      scopeValue: suggestion.scopeValue.toLowerCase(),
      category: suggestion.category,
      action,
      actionAt: Date.now(),
      affectedCount,
    };
    this._history.push(record);
    this._save();
    this._emit();
    return record;
  }

  /** Filter suggestions usuwając te niedawno acted/dismissed/snoozed. */
  filterFresh(suggestions: CleaningSuggestion[], withinDays = 7): CleaningSuggestion[] {
    return suggestions.filter(s => !this.isScopeRecentlyHandled(s.scopeType, s.scopeValue, s.category, withinDays));
  }

  getHistory(): SuggestionRecord[] {
    return [...this._history];
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._settings = { enabled: true, scopeCategories: ['promo', 'notifications', 'newsletters'], firstRunDone: false };
    this._readLater = { enabled: false, triggerTag: 'newsletter', targetFolder: 'Read Later', digestSchedule: 'off' };
    this._history = [];
    this._listeners.clear();
    this._loaded = false;
    try {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(READLATER_KEY);
      localStorage.removeItem(HISTORY_KEY);
    } catch (e) { /* node env */ }
  }

  // === internals ===

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const rawS = localStorage.getItem(SETTINGS_KEY);
      if (rawS) {
        const s = JSON.parse(rawS) as CleaningSettings;
        if (s && typeof s.enabled === 'boolean') this._settings.enabled = s.enabled;
        if (Array.isArray(s.scopeCategories)) {
          this._settings.scopeCategories = s.scopeCategories.filter(c => c !== 'other');
        }
        if (typeof s.firstRunDone === 'boolean') this._settings.firstRunDone = s.firstRunDone;
      }
      const rawR = localStorage.getItem(READLATER_KEY);
      if (rawR) {
        const r = JSON.parse(rawR) as ReadLaterSettings;
        if (r && typeof r.enabled === 'boolean') this._readLater.enabled = r.enabled;
        if (typeof r.triggerTag === 'string') this._readLater.triggerTag = r.triggerTag;
        if (typeof r.targetFolder === 'string') this._readLater.targetFolder = r.targetFolder;
        if (['off', 'daily_9am', 'weekly_mon_9am'].includes(r.digestSchedule)) {
          this._readLater.digestSchedule = r.digestSchedule;
        }
      }
      const rawH = localStorage.getItem(HISTORY_KEY);
      if (rawH) {
        const arr = JSON.parse(rawH) as SuggestionRecord[];
        for (const r of arr) if (r && r.id) this._history.push(r);
      }
    } catch (e) {
      console.error('[Cleaning] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this._history));
    } catch (e) {
      console.error('[Cleaning] save failed:', e);
    }
  }

  private _saveReadLater(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(READLATER_KEY, JSON.stringify(this._readLater));
    } catch (e) {
      console.error('[Cleaning] save read-later failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[Cleaning] listener error', e); }
    }
  }
}

export const CleaningStore = new CleaningStoreImpl();
