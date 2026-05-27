/**
 * Keyboard Mapping Store — bilet MVP #109.
 *
 * Switch między 4 preset bindingami (default / apple_mail / gmail / outlook).
 * Per-account override: account A może mieć inne mapping niż account B.
 *
 * Real keymap swap (rebind AppEnv keymaps z preset bindings) — UI ticket.
 * Tutaj backend: state management + active bindings query + cheat sheet data + WCAG 2.1.4 toggle.
 */

import { KeymapPreset, KeymapBinding, PRESET_BINDINGS, PRESET_LABELS_PL, PRESET_LABELS_EN } from './keymap-presets';

export interface KeymapSettings {
  /** Global default preset. */
  globalPreset: KeymapPreset;
  /** Per-account override: accountId → preset. */
  accountOverrides: Record<string, KeymapPreset>;
  /** WCAG 2.1.4 — `?` cheat sheet shortcut toggle on/off (user może wyłączyć żeby typować `?` w textbox). */
  cheatSheetShortcutEnabled: boolean;
}

const STORAGE_KEY = 'actuna.keyboard-mapping';

class KeyboardMappingStoreImpl {
  private _settings: KeymapSettings = {
    globalPreset: 'default',
    accountOverrides: {},
    cheatSheetShortcutEnabled: true,
  };
  private _listeners: Set<() => void> = new Set();
  private _loaded = false;

  init(): void {
    if (this._loaded) return;
    this._load();
    this._loaded = true;
  }

  // === Settings ===

  getSettings(): KeymapSettings {
    return {
      globalPreset: this._settings.globalPreset,
      accountOverrides: { ...this._settings.accountOverrides },
      cheatSheetShortcutEnabled: this._settings.cheatSheetShortcutEnabled,
    };
  }

  setGlobalPreset(preset: KeymapPreset): void {
    if (!PRESET_BINDINGS[preset]) throw new Error(`[KeyboardMapping] unknown preset: ${preset}`);
    this._settings.globalPreset = preset;
    this._save();
    this._emit();
  }

  setAccountOverride(accountId: string, preset: KeymapPreset | null): void {
    if (!accountId) throw new Error('[KeyboardMapping] accountId required');
    if (preset === null) {
      delete this._settings.accountOverrides[accountId];
    } else {
      if (!PRESET_BINDINGS[preset]) throw new Error(`[KeyboardMapping] unknown preset: ${preset}`);
      this._settings.accountOverrides[accountId] = preset;
    }
    this._save();
    this._emit();
  }

  setCheatSheetShortcutEnabled(enabled: boolean): void {
    this._settings.cheatSheetShortcutEnabled = enabled;
    this._save();
    this._emit();
  }

  // === Active preset resolution ===

  /** Active preset dla danego account (override lub global). */
  activePresetFor(accountId?: string): KeymapPreset {
    if (accountId && this._settings.accountOverrides[accountId]) {
      return this._settings.accountOverrides[accountId];
    }
    return this._settings.globalPreset;
  }

  /** Active bindings dla danego account. */
  activeBindings(accountId?: string): KeymapBinding[] {
    const preset = this.activePresetFor(accountId);
    return [...PRESET_BINDINGS[preset]];
  }

  // === Cheat sheet ===

  /** Group bindings by category — dla cheat sheet UI. */
  groupedByCategory(accountId?: string): Record<string, KeymapBinding[]> {
    const bindings = this.activeBindings(accountId);
    const groups: Record<string, KeymapBinding[]> = {};
    for (const b of bindings) {
      if (!groups[b.category]) groups[b.category] = [];
      groups[b.category].push(b);
    }
    return groups;
  }

  /** Fuzzy search bindings (cheat sheet search input). */
  search(query: string, accountId?: string): KeymapBinding[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.activeBindings(accountId);
    return this.activeBindings(accountId).filter(b =>
      b.command.toLowerCase().includes(q) ||
      b.label.toLowerCase().includes(q) ||
      b.shortcut.toLowerCase().includes(q),
    );
  }

  // === Labels ===

  getPresetLabel(preset: KeymapPreset, locale: 'pl' | 'en' = 'pl'): string {
    return locale === 'pl' ? PRESET_LABELS_PL[preset] : PRESET_LABELS_EN[preset];
  }

  listPresets(): KeymapPreset[] {
    return Object.keys(PRESET_BINDINGS) as KeymapPreset[];
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._settings = { globalPreset: 'default', accountOverrides: {}, cheatSheetShortcutEnabled: true };
    this._listeners.clear();
    this._loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* node env */ }
  }

  // === internals ===

  private _load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as KeymapSettings;
      if (s && PRESET_BINDINGS[s.globalPreset]) {
        this._settings.globalPreset = s.globalPreset;
      }
      if (s && s.accountOverrides && typeof s.accountOverrides === 'object') {
        for (const [acc, preset] of Object.entries(s.accountOverrides)) {
          if (PRESET_BINDINGS[preset as KeymapPreset]) {
            this._settings.accountOverrides[acc] = preset as KeymapPreset;
          }
        }
      }
      if (s && typeof s.cheatSheetShortcutEnabled === 'boolean') {
        this._settings.cheatSheetShortcutEnabled = s.cheatSheetShortcutEnabled;
      }
    } catch (e) {
      console.error('[KeyboardMapping] load failed:', e);
    }
  }

  private _save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    } catch (e) {
      console.error('[KeyboardMapping] save failed:', e);
    }
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try { cb(); } catch (e) { console.error('[KeyboardMapping] listener error', e); }
    }
  }
}

export const KeyboardMappingStore = new KeyboardMappingStoreImpl();
