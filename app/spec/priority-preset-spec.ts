/**
 * Bilet #120 — presety priorytetów na tagach: matryca Eisenhowera (Q1–Q4)
 * i A/B/C. Preset = ekskluzywna grupa tagów systemowych z rangą (wzorzec
 * ekskluzywności z TimeIntentStore #96). Sync między instancjami przez
 * adaptery #117 jak każdy tag (id NIE zaczyna się od __system_).
 *
 * TDD RED: failuje dopóki nie powstanie priority-preset-store.
 */
import { TagStore } from '../internal_packages/tag-system/lib/tag-store';
import { _resetAdapters } from '../internal_packages/tag-system/lib/sync-adapters/tag-sync-adapters';
import {
  PriorityPresetStore,
  PRESETS,
} from '../internal_packages/tag-system/lib/priority-preset-store';
import { DatabaseStore, Thread, Actions, AccountStore } from 'actunamail-exports';

describe('PriorityPresetStore — Eisenhower / A-B-C (bilet #120)', () => {
  beforeEach(() => {
    TagStore._reset();
    _resetAdapters();
    TagStore.init();
    PriorityPresetStore._reset();
  });

  afterEach(() => {
    PriorityPresetStore._reset();
    TagStore._reset();
  });

  describe('definicje presetów', () => {
    it('eisenhower ma 4 elementy z rangami 1..4, abc ma 3', () => {
      expect(PRESETS.eisenhower.members.length).toBe(4);
      expect(PRESETS.eisenhower.members.map(m => m.rank)).toEqual([1, 2, 3, 4]);
      expect(PRESETS.abc.members.length).toBe(3);
      expect(PRESETS.abc.members.map(m => m.rank)).toEqual([1, 2, 3]);
    });

    it('id elementów NIE zaczynają się od __system_ (mają się syncować)', () => {
      for (const preset of [PRESETS.eisenhower, PRESETS.abc]) {
        for (const m of preset.members) {
          expect(m.id.startsWith('__system_')).toBe(false);
        }
      }
    });
  });

  describe('aktywacja presetu', () => {
    it('activatePreset rejestruje tagi presetu jako systemManaged', () => {
      PriorityPresetStore.activatePreset('eisenhower');
      expect(PriorityPresetStore.activePreset()).toBe('eisenhower');
      const q1 = TagStore.get(PRESETS.eisenhower.members[0].id);
      expect(q1).toBeDefined();
      expect(q1!.systemManaged).toBe(true);
      expect(q1!.source).toBe('system');
    });

    it('persystuje aktywny preset w localStorage', () => {
      PriorityPresetStore.activatePreset('abc');
      expect(localStorage.getItem('actuna.tags.priority-preset')).toBe('abc');
    });

    it('zmiana presetu czyści przypisania poprzedniego', () => {
      PriorityPresetStore.activatePreset('eisenhower');
      const q1 = PRESETS.eisenhower.members[0].id;
      PriorityPresetStore.setPriority('t1', q1);
      expect(TagStore.hasTag('t1', q1)).toBe(true);
      PriorityPresetStore.activatePreset('abc');
      expect(TagStore.hasTag('t1', q1)).toBe(false);
      expect(TagStore.get(PRESETS.abc.members[0].id)).toBeDefined();
    });

    it('deactivate (null) usuwa tagi presetu z registry', () => {
      PriorityPresetStore.activatePreset('eisenhower');
      PriorityPresetStore.activatePreset(null);
      expect(PriorityPresetStore.activePreset()).toBe(null);
      expect(TagStore.get(PRESETS.eisenhower.members[0].id)).toBeUndefined();
    });
  });

  describe('ekskluzywność + rank', () => {
    beforeEach(() => {
      PriorityPresetStore.activatePreset('eisenhower');
    });

    it('setPriority jest ekskluzywne w grupie (Q1 → Q2 zostawia tylko Q2)', () => {
      const [q1, q2] = PRESETS.eisenhower.members.map(m => m.id);
      PriorityPresetStore.setPriority('t1', q1);
      PriorityPresetStore.setPriority('t1', q2);
      expect(TagStore.hasTag('t1', q1)).toBe(false);
      expect(TagStore.hasTag('t1', q2)).toBe(true);
    });

    it('clearPriority usuwa priorytet wątku', () => {
      const q1 = PRESETS.eisenhower.members[0].id;
      PriorityPresetStore.setPriority('t1', q1);
      PriorityPresetStore.clearPriority('t1');
      expect(TagStore.hasTag('t1', q1)).toBe(false);
      expect(PriorityPresetStore.rankFor('t1')).toBe(null);
    });

    it('rankFor zwraca rangę przypisanego priorytetu', () => {
      const q2 = PRESETS.eisenhower.members[1].id;
      PriorityPresetStore.setPriority('t1', q2);
      expect(PriorityPresetStore.rankFor('t1')).toBe(2);
      expect(PriorityPresetStore.rankFor('inny')).toBe(null);
    });

    it('rankForTagId zwraca rangę elementu presetu (do sortowania chipów)', () => {
      const q3 = PRESETS.eisenhower.members[2].id;
      expect(PriorityPresetStore.rankForTagId(q3)).toBe(3);
      expect(PriorityPresetStore.rankForTagId('user-tag')).toBe(null);
    });
  });

  describe('sync przez adaptery #117', () => {
    it('setPriority dyspozycjonuje ChangeKeywordsTask (tagi presetu się syncują)', async () => {
      PriorityPresetStore.activatePreset('eisenhower');
      spyOn(AccountStore, 'accountForId').andReturn({ id: 'acct-1', provider: 'imap' } as any);
      spyOn(DatabaseStore, 'find').andReturn(
        Promise.resolve(new Thread({ id: 't1', accountId: 'acct-1' } as any)) as any
      );
      spyOn(Actions, 'queueTask');

      PriorityPresetStore.setPriority('t1', PRESETS.eisenhower.members[0].id);
      await Promise.resolve();
      await Promise.resolve();

      expect(Actions.queueTask).toHaveBeenCalled();
      const tasks = (Actions.queueTask as any).calls.map((c: any) => c.args[0]);
      const adds = tasks.filter((t: any) => t.keywordsToAdd && t.keywordsToAdd.length);
      expect(adds.length).toBe(1);
      expect(adds[0].constructor.name).toBe('ChangeKeywordsTask');
    });
  });
});
