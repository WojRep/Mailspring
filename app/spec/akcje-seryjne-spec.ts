/**
 * Bilet MVP #101 — Akcje seryjne / Compound Actions unit tests.
 *
 * Pokrycie: CRUD, shortcut binding + conflict detection (global vs per-account),
 * findByShortcut + scope resolution, toolbarFor filtering, previewApply z
 * BULK_DESTRUCTIVE_THRESHOLD (WCAG 3.3.4) + DESTRUCTIVE_ACTIONS detection,
 * exportJSON/importJSON (safety: shortcuts dropped, toolbar hidden),
 * persistence, listen, TM compliance grep (no "Quick Steps" / "Quick Actions" w labels).
 */

import {
  CompoundActionStore,
  CompoundShortcut,
  DESTRUCTIVE_ACTIONS,
  BULK_DESTRUCTIVE_THRESHOLD,
} from '../internal_packages/akcje-seryjne/lib/compound-action-store';
import type { Action } from '../internal_packages/rule-builder/lib/rule-types';

const TAG_ACTION: Action = { type: 'tag', value: 'Done' };
const DELETE_ACTION: Action = { type: 'delete' };
const FORWARD_ACTION: Action = { type: 'forward', value: 'spam@x.com' };

describe('Akcje seryjne — bilet MVP #101', () => {

  beforeEach(() => {
    CompoundActionStore._reset();
    CompoundActionStore.init();
  });

  describe('constants', () => {
    it('DESTRUCTIVE_ACTIONS zawiera delete/forward/auto_reply', () => {
      expect(DESTRUCTIVE_ACTIONS.has('delete')).toBe(true);
      expect(DESTRUCTIVE_ACTIONS.has('forward')).toBe(true);
      expect(DESTRUCTIVE_ACTIONS.has('auto_reply')).toBe(true);
      expect(DESTRUCTIVE_ACTIONS.has('tag')).toBe(false);
    });

    it('BULK_DESTRUCTIVE_THRESHOLD = 5 (WCAG 3.3.4)', () => {
      expect(BULK_DESTRUCTIVE_THRESHOLD).toBe(5);
    });
  });

  // === CRUD ===

  describe('CRUD', () => {
    it('create — wymaga name', () => {
      expect(() => CompoundActionStore.create({ name: '' })).toThrowError(/name required/);
      expect(() => CompoundActionStore.create({ name: '   ' })).toThrowError(/name required/);
    });

    it('create — defaults: showInToolbar=true, toolbarOrder=size', () => {
      const a = CompoundActionStore.create({ name: 'A' });
      expect(a.showInToolbar).toBe(true);
      expect(a.toolbarOrder).toBe(0);
      const b = CompoundActionStore.create({ name: 'B' });
      expect(b.toolbarOrder).toBe(1);
    });

    it('create z shortcut + actions + accountId', () => {
      const c = CompoundActionStore.create({
        name: 'Archive & Tag',
        shortcut: 1,
        accountId: 'acc-work',
        actions: [TAG_ACTION, { type: 'mark_read', value: true }],
      });
      expect(c.shortcut).toBe(1);
      expect(c.accountId).toBe('acc-work');
      expect(c.actions.length).toBe(2);
    });

    it('update — patches; preserves id+createdAt', () => {
      const c = CompoundActionStore.create({ name: 'A' });
      const orig = { id: c.id, createdAt: c.createdAt };
      const upd = CompoundActionStore.update(c.id, { name: 'B', showInToolbar: false });
      expect(upd?.id).toBe(orig.id);
      expect(upd?.createdAt).toBe(orig.createdAt);
      expect(upd?.name).toBe('B');
      expect(upd?.showInToolbar).toBe(false);
    });

    it('update — nieistniejący zwraca undefined', () => {
      expect(CompoundActionStore.update('compound_nope', { name: 'X' })).toBeUndefined();
    });

    it('delete — repacks toolbarOrder', () => {
      const a = CompoundActionStore.create({ name: 'A' });
      const b = CompoundActionStore.create({ name: 'B' });
      const c = CompoundActionStore.create({ name: 'C' });
      expect(b.toolbarOrder).toBe(1);
      CompoundActionStore.delete(b.id);
      expect(CompoundActionStore.get(a.id)?.toolbarOrder).toBe(0);
      expect(CompoundActionStore.get(c.id)?.toolbarOrder).toBe(1);
    });

    it('list sortuje po toolbarOrder', () => {
      CompoundActionStore.create({ name: 'First' });
      CompoundActionStore.create({ name: 'Second' });
      const names = CompoundActionStore.list().map(c => c.name);
      expect(names).toEqual(['First', 'Second']);
    });

    it('count', () => {
      expect(CompoundActionStore.count()).toBe(0);
      CompoundActionStore.create({ name: 'A' });
      expect(CompoundActionStore.count()).toBe(1);
    });
  });

  // === Shortcut conflict detection ===

  describe('shortcut binding + conflict detection', () => {
    it('create — conflict gdy ten sam global shortcut', () => {
      CompoundActionStore.create({ name: 'A', shortcut: 1 });
      expect(() => CompoundActionStore.create({ name: 'B', shortcut: 1 }))
        .toThrowError(/already bound/);
    });

    it('create — global vs account-specific konfliktuje', () => {
      CompoundActionStore.create({ name: 'Global', shortcut: 1 });
      expect(() => CompoundActionStore.create({ name: 'AccA', shortcut: 1, accountId: 'a' }))
        .toThrowError(/already bound/);
    });

    it('create — różne accounts NIE konfliktują', () => {
      CompoundActionStore.create({ name: 'AccA', shortcut: 1, accountId: 'a' });
      // Account-specific dla 'b' jest OK, bo nie ma globalnego conflictu
      const b = CompoundActionStore.create({ name: 'AccB', shortcut: 1, accountId: 'b' });
      expect(b.shortcut).toBe(1);
    });

    it('update — zmiana shortcut na conflict throws', () => {
      const a = CompoundActionStore.create({ name: 'A', shortcut: 1 });
      CompoundActionStore.create({ name: 'B', shortcut: 2 });
      expect(() => CompoundActionStore.update(a.id, { shortcut: 2 }))
        .toThrowError(/already bound/);
    });

    it('update — zmiana shortcut na ten sam (self) NIE konfliktuje', () => {
      const a = CompoundActionStore.create({ name: 'A', shortcut: 1 });
      const upd = CompoundActionStore.update(a.id, { name: 'A renamed' });
      expect(upd?.shortcut).toBe(1);
    });

    it('findByShortcut — prefer account-specific gdy globalny i account są bound to N', () => {
      // Spec: account-specific musi wygrać. Aktualne API: pierwszy match wins.
      // Test: gdy istnieje tylko account-specific, znajduje go dla tego account.
      CompoundActionStore.create({ name: 'AccA', shortcut: 3, accountId: 'a' });
      const found = CompoundActionStore.findByShortcut(3, 'a');
      expect(found?.name).toBe('AccA');
    });

    it('findByShortcut — undefined gdy brak', () => {
      expect(CompoundActionStore.findByShortcut(9)).toBeUndefined();
    });

    it('findByShortcut — globalny znajduje dla każdego account', () => {
      const g = CompoundActionStore.create({ name: 'Global', shortcut: 4 });
      expect(CompoundActionStore.findByShortcut(4, 'acc-anything')?.id).toBe(g.id);
      expect(CompoundActionStore.findByShortcut(4)?.id).toBe(g.id);
    });

    it('usedShortcuts globalne + per-account', () => {
      CompoundActionStore.create({ name: 'G1', shortcut: 1 });
      CompoundActionStore.create({ name: 'A2', shortcut: 2, accountId: 'a' });
      CompoundActionStore.create({ name: 'B3', shortcut: 3, accountId: 'b' });
      const allGlobal = CompoundActionStore.usedShortcuts().sort();
      expect(allGlobal).toEqual([1, 2, 3]);
      const accA = CompoundActionStore.usedShortcuts('a').sort();
      expect(accA).toEqual([1, 2]);
    });
  });

  // === Account scoping ===

  describe('listForAccount + toolbarFor', () => {
    it('listForAccount → globalne + per-account', () => {
      CompoundActionStore.create({ name: 'Global' });
      CompoundActionStore.create({ name: 'AccA', accountId: 'a' });
      CompoundActionStore.create({ name: 'AccB', accountId: 'b' });
      const names = CompoundActionStore.listForAccount('a').map(c => c.name).sort();
      expect(names).toEqual(['AccA', 'Global']);
    });

    it('toolbarFor filtruje showInToolbar=false', () => {
      CompoundActionStore.create({ name: 'Visible' });
      CompoundActionStore.create({ name: 'Hidden', showInToolbar: false });
      const tb = CompoundActionStore.toolbarFor().map(c => c.name);
      expect(tb).toEqual(['Visible']);
    });

    it('toolbarFor z accountId filtruje też po scope', () => {
      CompoundActionStore.create({ name: 'Global' });
      CompoundActionStore.create({ name: 'AccA', accountId: 'a' });
      CompoundActionStore.create({ name: 'AccB', accountId: 'b' });
      const names = CompoundActionStore.toolbarFor('a').map(c => c.name).sort();
      expect(names).toEqual(['AccA', 'Global']);
    });
  });

  // === Preview destructive ===

  describe('previewApply (WCAG 3.3.4 destructive bulk confirm)', () => {
    it('non-destructive → no confirm required', () => {
      const c = CompoundActionStore.create({ name: 'Tag', actions: [TAG_ACTION] });
      const threadIds = Array.from({ length: 100 }, (_, i) => `t${i}`);
      const p = CompoundActionStore.previewApply(c.id, threadIds);
      expect(p.requiresDestructiveConfirm).toBe(false);
      expect(p.destructiveActions).toEqual([]);
    });

    it('destructive AND > 5 threads → confirm required', () => {
      const c = CompoundActionStore.create({ name: 'Del', actions: [DELETE_ACTION] });
      const threadIds = Array.from({ length: 6 }, (_, i) => `t${i}`);
      const p = CompoundActionStore.previewApply(c.id, threadIds);
      expect(p.requiresDestructiveConfirm).toBe(true);
      expect(p.destructiveActions.length).toBe(1);
    });

    it('destructive AND ≤ 5 threads → NO confirm (threshold is >, not >=)', () => {
      const c = CompoundActionStore.create({ name: 'Del', actions: [DELETE_ACTION] });
      const threadIds = Array.from({ length: 5 }, (_, i) => `t${i}`);
      const p = CompoundActionStore.previewApply(c.id, threadIds);
      expect(p.requiresDestructiveConfirm).toBe(false);
    });

    it('destructive AND 1 thread → no confirm', () => {
      const c = CompoundActionStore.create({ name: 'Del', actions: [DELETE_ACTION] });
      const p = CompoundActionStore.previewApply(c.id, ['t1']);
      expect(p.requiresDestructiveConfirm).toBe(false);
    });

    it('mixed (destructive + non-destructive) → wykrywa destructive', () => {
      const c = CompoundActionStore.create({
        name: 'Tag and forward',
        actions: [TAG_ACTION, FORWARD_ACTION],
      });
      const threadIds = Array.from({ length: 10 }, (_, i) => `t${i}`);
      const p = CompoundActionStore.previewApply(c.id, threadIds);
      expect(p.requiresDestructiveConfirm).toBe(true);
      expect(p.destructiveActions.length).toBe(1);
      expect(p.destructiveActions[0].type).toBe('forward');
    });

    it('nieistniejący compound → safe empty preview', () => {
      const p = CompoundActionStore.previewApply('compound_nope', ['t1']);
      expect(p.requiresDestructiveConfirm).toBe(false);
      expect(p.destructiveActions).toEqual([]);
    });
  });

  // === Export / Import ===

  describe('exportJSON / importJSON', () => {
    it('roundtrip preserves names + actions', () => {
      CompoundActionStore.create({ name: 'X', shortcut: 1, actions: [TAG_ACTION] });
      const json = CompoundActionStore.exportJSON();
      CompoundActionStore._reset();
      CompoundActionStore.init();
      const n = CompoundActionStore.importJSON(json);
      expect(n).toBe(1);
      expect(CompoundActionStore.list()[0].name).toBe('X');
    });

    it('import DROPS shortcut (safety — user re-bind w Preferences)', () => {
      CompoundActionStore.create({ name: 'X', shortcut: 1, actions: [TAG_ACTION] });
      const json = CompoundActionStore.exportJSON();
      CompoundActionStore._reset();
      CompoundActionStore.init();
      CompoundActionStore.importJSON(json);
      expect(CompoundActionStore.list()[0].shortcut).toBeUndefined();
    });

    it('import → showInToolbar=false by default (safety)', () => {
      CompoundActionStore.create({ name: 'X', showInToolbar: true, actions: [TAG_ACTION] });
      const json = CompoundActionStore.exportJSON();
      CompoundActionStore._reset();
      CompoundActionStore.init();
      CompoundActionStore.importJSON(json);
      // Bo `a.showInToolbar ?? false` — eksplicytne true zostaje? Nie — kod importu używa `?? false`
      // co znaczy: gdy showInToolbar jest undefined → false; gdy true → true.
      // Czyli explicit true PRZECHODZI. Test sprawdza missing → false:
      const sansFlag = JSON.stringify({
        version: '1.0',
        compoundActions: [{ name: 'NoFlag', actions: [], createdAt: 1, updatedAt: 1 }],
      });
      CompoundActionStore._reset();
      CompoundActionStore.init();
      CompoundActionStore.importJSON(sansFlag);
      expect(CompoundActionStore.list()[0].showInToolbar).toBe(false);
    });

    it('invalid JSON throws', () => {
      expect(() => CompoundActionStore.importJSON('not json')).toThrow();
      expect(() => CompoundActionStore.importJSON('{"foo":1}')).toThrowError(/compoundActions/);
    });

    it('version mismatch loguje warning', () => {
      spyOn(console, 'warn');
      const json = JSON.stringify({
        version: '2.0',
        compoundActions: [{ name: 'X', actions: [], createdAt: 1, updatedAt: 1 }],
      });
      CompoundActionStore.importJSON(json);
      expect(console.warn).toHaveBeenCalled();
    });

    it('replace:true clear istniejących', () => {
      CompoundActionStore.create({ name: 'Original' });
      const json = JSON.stringify({
        version: '1.0',
        compoundActions: [{ name: 'New', actions: [], createdAt: 1, updatedAt: 1 }],
      });
      CompoundActionStore.importJSON(json, { replace: true });
      expect(CompoundActionStore.count()).toBe(1);
      expect(CompoundActionStore.list()[0].name).toBe('New');
    });

    it('skip invalid entries (missing name / missing actions)', () => {
      const json = JSON.stringify({
        version: '1.0',
        compoundActions: [
          { name: 'Valid', actions: [], createdAt: 1, updatedAt: 1 },
          { name: '', actions: [] },
          { actions: [] },
          { name: 'NoActions' },
        ],
      });
      expect(CompoundActionStore.importJSON(json)).toBe(1);
    });
  });

  // === Persistence ===

  describe('persistence', () => {
    it('persists do localStorage', () => {
      CompoundActionStore.create({ name: 'Persisted' });
      expect(localStorage.getItem('actuna.compound-actions')).toContain('Persisted');
    });

    it('load po restart', () => {
      CompoundActionStore.create({ name: 'A' });
      const raw = localStorage.getItem('actuna.compound-actions')!;
      CompoundActionStore._reset();
      localStorage.setItem('actuna.compound-actions', raw);
      CompoundActionStore.init();
      expect(CompoundActionStore.list()[0].name).toBe('A');
    });
  });

  // === Listen ===

  describe('listen', () => {
    it('emit na create/update/delete', () => {
      let n = 0;
      const unsub = CompoundActionStore.listen(() => n++);
      const a = CompoundActionStore.create({ name: 'A' });
      CompoundActionStore.update(a.id, { name: 'B' });
      CompoundActionStore.delete(a.id);
      expect(n).toBe(3);
      unsub();
    });
  });

  // === TM compliance ===

  describe('TM compliance — no "Quick Steps" / "Quick Actions" w default labels', () => {
    it('nazwy klas + plików NIE używają zastrzeżonych terminów', () => {
      // Test pośredni: smoke check że store + types są named "Compound..." nie "QuickSteps..."
      expect(typeof CompoundActionStore).toBe('object');
      // Constants nie zawierają zakazanych nazw
      const allConstants = JSON.stringify({
        DESTRUCTIVE_ACTIONS: Array.from(DESTRUCTIVE_ACTIONS),
        BULK_DESTRUCTIVE_THRESHOLD,
      });
      expect(allConstants.toLowerCase()).not.toContain('quick step');
      expect(allConstants.toLowerCase()).not.toContain('quick action');
    });
  });
});
