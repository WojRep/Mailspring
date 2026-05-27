/**
 * Centrum dnia Store — bilet MVP #95.
 *
 * Lekki Flux store dla agregatu Today (kalendarz + tasks + nieprzeczytane).
 *
 * Aktualnie agreguje:
 *   - Calendar events: czeka na #31 (calendar plugin) — placeholder gdy NULL.
 *   - Tasks: czeka na #32 (task system) — placeholder gdy NULL.
 *   - Mails: integracja z PinStore (#93) + standard unread query.
 *
 * Section toggle state per użytkownik (collapsed/expanded), persisted.
 */

export type DniSection = 'calendar' | 'tasks' | 'mails';

const STORAGE_KEY = 'actuna.centrum-dnia.collapsed';
const STORAGE_PANE = 'actuna.centrum-dnia.pane-open';

class CentrumDniaStoreImpl {
  private _paneOpen = false;
  private _collapsed: Set<DniSection> = new Set();
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;
  private _lastRefresh = 0;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  isPaneOpen(): boolean {
    return this._paneOpen;
  }

  openPane(): void {
    if (this._paneOpen) return;
    this._paneOpen = true;
    this._lastRefresh = Date.now();
    this._save();
    this._emit();
  }

  closePane(): void {
    if (!this._paneOpen) return;
    this._paneOpen = false;
    this._save();
    this._emit();
  }

  togglePane(): void {
    if (this._paneOpen) this.closePane();
    else this.openPane();
  }

  isSectionCollapsed(section: DniSection): boolean {
    return this._collapsed.has(section);
  }

  toggleSection(section: DniSection): void {
    if (this._collapsed.has(section)) {
      this._collapsed.delete(section);
    } else {
      this._collapsed.add(section);
    }
    this._save();
    this._emit();
  }

  expandSection(section: DniSection): void {
    if (this._collapsed.delete(section)) {
      this._save();
      this._emit();
    }
  }

  collapseSection(section: DniSection): void {
    if (!this._collapsed.has(section)) {
      this._collapsed.add(section);
      this._save();
      this._emit();
    }
  }

  /** Trigger refresh (re-read data sources). Listeners fire. */
  refresh(): void {
    this._lastRefresh = Date.now();
    this._emit();
  }

  getLastRefresh(): number {
    return this._lastRefresh;
  }

  /** Today date in user's locale (kalendarz section header). */
  todayLabel(): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date());
    } catch (e) {
      return new Date().toDateString();
    }
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._paneOpen = false;
    this._collapsed.clear();
    this._listeners.clear();
    this._loaded = false;
    this._lastRefresh = 0;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_PANE);
    } catch (e) { /* node env */ }
  }

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const collapsed = localStorage.getItem(STORAGE_KEY);
      if (collapsed) {
        for (const s of JSON.parse(collapsed)) this._collapsed.add(s);
      }
      const pane = localStorage.getItem(STORAGE_PANE);
      if (pane === 'true') this._paneOpen = true;
    } catch (e) {
      console.error('[CentrumDnia] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._collapsed)));
      localStorage.setItem(STORAGE_PANE, String(this._paneOpen));
    } catch (e) {
      console.error('[CentrumDnia] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[CentrumDnia] listener error', e); }
    }
  }
}

export const CentrumDniaStore = new CentrumDniaStoreImpl();
