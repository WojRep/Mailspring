/**
 * PriorityPresetStore — bilet #120: priorytety wielopoziomowe na tagach.
 *
 * Preset = ekskluzywna grupa tagów systemowych z rangą (1 = najwyższy):
 *   eisenhower → Q1 Pilne+Ważne / Q2 Ważne / Q3 Pilne / Q4 Reszta
 *   abc        → A / B / C
 *
 * Ekskluzywność per wątek egzekwowana TUTAJ (wzorzec TimeIntentStore #96) —
 * TagStore zostaje generycznym multi-assign. Jeden aktywny preset naraz;
 * zmiana presetu czyści przypisania poprzedniego (z syncem usunięć).
 *
 * Id elementów NIE zaczynają się od `__system_` — tagi priorytetowe syncują
 * się między instancjami przez adaptery #117 jak każdy tag (keyword np.
 * `Q1_Pilne_Wazne` jest czytelny też w Thunderbirdzie / jako kategoria
 * Outlooka na Exchange).
 *
 * Grupowanie zamiast sortowania SQL: ćwiartki/poziomy są klikalnymi widokami
 * w sidebarze (prioritySection #119-mechanizm); na liście chip priorytetu
 * renderuje się pierwszy (rankForTagId).
 */

import { TagStore } from './tag-store';

const ACTIVE_KEY = 'actuna.tags.priority-preset';

export interface PriorityPresetMember {
  id: string;
  name: string;
  color: string;
  rank: number;
}

export interface PriorityPreset {
  id: string;
  /** Nazwa wyświetlana presetu (PL / EN). */
  label: string;
  members: PriorityPresetMember[];
}

export const PRESETS: Record<string, PriorityPreset> = {
  eisenhower: {
    id: 'eisenhower',
    label: 'Matryca Eisenhowera (Q1–Q4) / Eisenhower matrix (Q1–Q4)',
    members: [
      { id: 'prio_q1', name: 'Q1 Pilne+Ważne', color: 'var(--danger-500)', rank: 1 },
      { id: 'prio_q2', name: 'Q2 Ważne', color: 'var(--accent-500)', rank: 2 },
      { id: 'prio_q3', name: 'Q3 Pilne', color: 'var(--warning-500)', rank: 3 },
      { id: 'prio_q4', name: 'Q4 Reszta', color: 'var(--info-500)', rank: 4 },
    ],
  },
  abc: {
    id: 'abc',
    label: 'Priorytety A/B/C / A/B/C priorities',
    members: [
      { id: 'prio_a', name: 'A', color: 'var(--danger-500)', rank: 1 },
      { id: 'prio_b', name: 'B', color: 'var(--warning-500)', rank: 2 },
      { id: 'prio_c', name: 'C', color: 'var(--success-500)', rank: 3 },
    ],
  },
};

class PriorityPresetStoreImpl {
  private _active: string | null = null;
  private _loaded = false;
  private _listeners: Set<() => void> = new Set();

  init(): void {
    this._ensureLoaded();
  }

  activePreset(): string | null {
    this._ensureLoaded();
    return this._active;
  }

  /**
   * Aktywuje preset (null = wyłącz priorytety). Zmiana presetu czyści
   * przypisania poprzedniego (TagStore.remove → sync usunięć na serwer)
   * i usuwa jego tagi z registry.
   */
  activatePreset(id: string | null): void {
    this._ensureLoaded();
    if (id === this._active) return;
    if (id && !PRESETS[id]) return;

    const prev = this._active ? PRESETS[this._active] : null;
    if (prev) {
      for (const m of prev.members) {
        // Najpierw remove per przypisanie (dispatchuje sync usunięcia keywordu),
        // dopiero potem zdjęcie ochrony systemManaged + delete z registry.
        for (const threadId of TagStore.threadIdsWithTag(m.id)) {
          TagStore.remove(threadId, m.id);
        }
        const tag = TagStore.get(m.id);
        if (tag) {
          TagStore.register({ ...tag, systemManaged: false });
          TagStore.delete(m.id);
        }
      }
    }

    this._active = id;
    try {
      if (typeof localStorage !== 'undefined') {
        if (id) localStorage.setItem(ACTIVE_KEY, id);
        else localStorage.removeItem(ACTIVE_KEY);
      }
    } catch (e) {
      /* node env */
    }

    if (id) {
      this._registerPresetTags(PRESETS[id]);
    }
    this._emit();
  }

  /** Ekskluzywne przypisanie priorytetu (usuwa pozostałe elementy grupy). */
  setPriority(threadId: string, tagId: string): void {
    this._ensureLoaded();
    const preset = this._active ? PRESETS[this._active] : null;
    if (!preset || !threadId) return;
    if (!preset.members.some(m => m.id === tagId)) return;
    for (const m of preset.members) {
      if (m.id !== tagId && TagStore.hasTag(threadId, m.id)) {
        TagStore.remove(threadId, m.id);
      }
    }
    TagStore.apply(threadId, tagId);
  }

  clearPriority(threadId: string): void {
    this._ensureLoaded();
    const preset = this._active ? PRESETS[this._active] : null;
    if (!preset) return;
    for (const m of preset.members) {
      if (TagStore.hasTag(threadId, m.id)) {
        TagStore.remove(threadId, m.id);
      }
    }
  }

  /** Ranga priorytetu wątku (1 = najwyższy) lub null. */
  rankFor(threadId: string): number | null {
    this._ensureLoaded();
    const preset = this._active ? PRESETS[this._active] : null;
    if (!preset) return null;
    for (const m of preset.members) {
      if (TagStore.hasTag(threadId, m.id)) return m.rank;
    }
    return null;
  }

  /** Ranga elementu aktywnego presetu (sortowanie chipów) lub null. */
  rankForTagId(tagId: string): number | null {
    this._ensureLoaded();
    const preset = this._active ? PRESETS[this._active] : null;
    if (!preset) return null;
    const m = preset.members.find(x => x.id === tagId);
    return m ? m.rank : null;
  }

  listen(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _reset(): void {
    this._active = null;
    this._loaded = false;
    this._listeners.clear();
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {
      /* node env */
    }
  }

  private _ensureLoaded(): void {
    if (this._loaded) return;
    this._loaded = true;
    try {
      if (typeof localStorage === 'undefined') return;
      const saved = localStorage.getItem(ACTIVE_KEY);
      if (saved && PRESETS[saved]) {
        this._active = saved;
        this._registerPresetTags(PRESETS[saved]);
      }
    } catch (e) {
      /* node env */
    }
  }

  private _registerPresetTags(preset: PriorityPreset): void {
    TagStore.registerAll(
      preset.members.map(m => ({
        id: m.id,
        name: m.name,
        color: m.color,
        source: 'system' as const,
        systemManaged: true,
        description: `#120 priority preset ${preset.id} (rank ${m.rank})`,
      }))
    );
  }

  private _emit(): void {
    for (const cb of this._listeners) {
      try {
        cb();
      } catch (e) {
        console.error('[PriorityPresetStore] listener error', e);
      }
    }
  }
}

export const PriorityPresetStore = new PriorityPresetStoreImpl();
