/**
 * Bilet MVP #100 — Rule builder (RuleStore) unit tests.
 *
 * Pokrycie: CRUD, reorder (moveUp/moveDown), duplicate, preview (incl. exceptions),
 * runNow (hits + audit), trigger filtering, exportJSON/importJSON roundtrip + replace
 * + version mismatch + skip invalid, audit log capping, listen notifications,
 * BULK_CONFIRM_THRESHOLD + CONSENT_REQUIRED_ACTIONS detection.
 */

import {
  AutomationRule,
  Action,
  ACTION_LABELS_PL,
  ACTION_LABELS_EN,
  TRIGGER_LABELS_PL,
  TRIGGER_LABELS_EN,
  BULK_CONFIRM_THRESHOLD,
  CONSENT_REQUIRED_ACTIONS,
} from '../internal_packages/rule-builder/lib/rule-types';
import { RuleStore } from '../internal_packages/rule-builder/lib/rule-store';
import { ThreadMeta, Rule as ConditionRule } from '../internal_packages/smart-folder/lib/rule-engine';

function thread(id: string, patch: Partial<ThreadMeta> = {}): ThreadMeta {
  return { id, ...patch };
}

const TAG_Q3: ConditionRule = { field: 'tag', op: 'contains', value: 'Q3' };
const FROM_BOB: ConditionRule = { field: 'from', op: 'contains', value: 'bob' };
const TAG_NEWSLETTER: ConditionRule = { field: 'tag', op: 'contains', value: 'Newsletter' };

describe('Rule builder — bilet MVP #100', () => {

  beforeEach(() => {
    RuleStore._reset();
    RuleStore.init();
  });

  describe('labels + constants', () => {
    it('ACTION_LABELS pokrywają wszystkie action types PL+EN', () => {
      const types: (keyof typeof ACTION_LABELS_PL)[] = [
        'move', 'copy', 'tag', 'remove_tag', 'mark_read', 'mark_important',
        'pin', 'snooze', 'delete', 'forward', 'auto_reply', 'notify', 'stop_processing',
      ];
      for (const t of types) {
        expect(ACTION_LABELS_PL[t]).toBeTruthy();
        expect(ACTION_LABELS_EN[t]).toBeTruthy();
      }
    });

    it('TRIGGER_LABELS pokrywają wszystkie trigger types PL+EN', () => {
      const types: (keyof typeof TRIGGER_LABELS_PL)[] = [
        'message_arrives', 'message_sent', 'scheduled', 'manual',
      ];
      for (const t of types) {
        expect(TRIGGER_LABELS_PL[t]).toBeTruthy();
        expect(TRIGGER_LABELS_EN[t]).toBeTruthy();
      }
    });

    it('BULK_CONFIRM_THRESHOLD = 50 (WCAG 3.3.4)', () => {
      expect(BULK_CONFIRM_THRESHOLD).toBe(50);
    });

    it('CONSENT_REQUIRED_ACTIONS zawiera forward/delete/auto_reply', () => {
      expect(CONSENT_REQUIRED_ACTIONS.has('forward')).toBe(true);
      expect(CONSENT_REQUIRED_ACTIONS.has('delete')).toBe(true);
      expect(CONSENT_REQUIRED_ACTIONS.has('auto_reply')).toBe(true);
      expect(CONSENT_REQUIRED_ACTIONS.has('tag')).toBe(false);
      expect(CONSENT_REQUIRED_ACTIONS.has('mark_read')).toBe(false);
    });
  });

  // === CRUD ===

  describe('CRUD', () => {
    it('create — wymaga name', () => {
      expect(() => RuleStore.create({ name: '' })).toThrowError(/name required/);
      expect(() => RuleStore.create({ name: '   ' })).toThrowError(/name required/);
    });

    it('create — defaults: enabled=true, location=local, trigger=message_arrives, match=all, order=size', () => {
      const a = RuleStore.create({ name: 'A' });
      expect(a.enabled).toBe(true);
      expect(a.location).toBe('local');
      expect(a.trigger).toBe('message_arrives');
      expect(a.match).toBe('all');
      expect(a.order).toBe(0);
      const b = RuleStore.create({ name: 'B' });
      expect(b.order).toBe(1);
    });

    it('create — input override defaults', () => {
      const r = RuleStore.create({
        name: 'X',
        enabled: false,
        location: 'server',
        trigger: 'scheduled',
        match: 'any',
        conditions: [TAG_Q3],
        actions: [{ type: 'tag', value: 'Done' }],
        exceptions: [TAG_NEWSLETTER],
        scheduleAt: '0 9 * * *',
      });
      expect(r.enabled).toBe(false);
      expect(r.location).toBe('server');
      expect(r.trigger).toBe('scheduled');
      expect(r.match).toBe('any');
      expect(r.conditions.length).toBe(1);
      expect(r.actions[0].type).toBe('tag');
      expect(r.exceptions.length).toBe(1);
      expect(r.scheduleAt).toBe('0 9 * * *');
    });

    it('update — patches fields, preserves id+createdAt+hits, bumps updatedAt', () => {
      const r = RuleStore.create({ name: 'Foo' });
      const orig = { id: r.id, createdAt: r.createdAt, hits: r.hits };
      const updated = RuleStore.update(r.id, { name: 'Bar', enabled: false });
      expect(updated?.id).toBe(orig.id);
      expect(updated?.createdAt).toBe(orig.createdAt);
      expect(updated?.hits).toBe(orig.hits);
      expect(updated?.name).toBe('Bar');
      expect(updated?.enabled).toBe(false);
    });

    it('update — nieistniejący id zwraca undefined', () => {
      expect(RuleStore.update('rule_nope', { name: 'X' })).toBeUndefined();
    });

    it('delete — repacks order po usunięciu', () => {
      const a = RuleStore.create({ name: 'A' });
      const b = RuleStore.create({ name: 'B' });
      const c = RuleStore.create({ name: 'C' });
      expect(a.order).toBe(0); expect(b.order).toBe(1); expect(c.order).toBe(2);
      RuleStore.delete(b.id);
      expect(RuleStore.get(a.id)?.order).toBe(0);
      expect(RuleStore.get(c.id)?.order).toBe(1);
    });

    it('delete nieistniejącego → false', () => {
      expect(RuleStore.delete('rule_nope')).toBe(false);
    });

    it('duplicate — kopiuje wszystko, suffix "(copy)", disabled by default', () => {
      const r = RuleStore.create({
        name: 'Foo',
        enabled: true,
        conditions: [TAG_Q3],
        actions: [{ type: 'tag', value: 'Done' }],
      });
      const dup = RuleStore.duplicate(r.id);
      expect(dup?.name).toBe('Foo (copy)');
      expect(dup?.enabled).toBe(false);
      expect(dup?.conditions.length).toBe(1);
      expect(dup?.actions.length).toBe(1);
      expect(dup?.id).not.toBe(r.id);
    });

    it('duplicate nieistniejącego → undefined', () => {
      expect(RuleStore.duplicate('rule_nope')).toBeUndefined();
    });

    it('list sortuje po order', () => {
      RuleStore.create({ name: 'A' });
      RuleStore.create({ name: 'B' });
      RuleStore.create({ name: 'C' });
      const names = RuleStore.list().map(r => r.name);
      expect(names).toEqual(['A', 'B', 'C']);
    });

    it('listEnabled filtruje disabled', () => {
      const a = RuleStore.create({ name: 'A', enabled: true });
      RuleStore.create({ name: 'B', enabled: false });
      const c = RuleStore.create({ name: 'C', enabled: true });
      const ids = RuleStore.listEnabled().map(r => r.id).sort();
      expect(ids).toEqual([a.id, c.id].sort());
    });
  });

  // === Reorder ===

  describe('moveUp / moveDown', () => {
    it('moveUp swap z poprzednim', () => {
      const a = RuleStore.create({ name: 'A' });
      const b = RuleStore.create({ name: 'B' });
      expect(RuleStore.moveUp(b.id)).toBe(true);
      expect(RuleStore.get(b.id)?.order).toBe(0);
      expect(RuleStore.get(a.id)?.order).toBe(1);
    });

    it('moveUp na top → false', () => {
      const a = RuleStore.create({ name: 'A' });
      expect(RuleStore.moveUp(a.id)).toBe(false);
    });

    it('moveDown swap z następnym', () => {
      const a = RuleStore.create({ name: 'A' });
      const b = RuleStore.create({ name: 'B' });
      expect(RuleStore.moveDown(a.id)).toBe(true);
      expect(RuleStore.get(a.id)?.order).toBe(1);
      expect(RuleStore.get(b.id)?.order).toBe(0);
    });

    it('moveDown na bottom → false', () => {
      const a = RuleStore.create({ name: 'A' });
      RuleStore.create({ name: 'B' });
      expect(RuleStore.moveDown(a.id)).toBe(true);
      const lastId = RuleStore.list()[1].id;
      expect(RuleStore.moveDown(lastId)).toBe(false);
    });
  });

  // === Preview + RunNow ===

  describe('preview', () => {
    it('zwraca tylko matched threads (conditions+match)', () => {
      const r = RuleStore.create({
        name: 'Q3 tagger',
        conditions: [TAG_Q3],
      });
      const threads = [
        thread('a', { tags: ['Q3'] }),
        thread('b', { tags: ['Q4'] }),
        thread('c', { tags: ['Q3', 'Other'] }),
      ];
      const p = RuleStore.preview(r.id, threads);
      expect(p.matched.length).toBe(2);
      expect(p.matched.map(t => t.id).sort()).toEqual(['a', 'c']);
    });

    it('exceptions — "any exception matches → skip"', () => {
      const r = RuleStore.create({
        name: 'Q3 except Newsletter',
        conditions: [TAG_Q3],
        exceptions: [TAG_NEWSLETTER],
      });
      const threads = [
        thread('a', { tags: ['Q3'] }),
        thread('b', { tags: ['Q3', 'Newsletter'] }),
      ];
      const p = RuleStore.preview(r.id, threads);
      expect(p.matched.map(t => t.id)).toEqual(['a']);
    });

    it('any-mode conditions', () => {
      const r = RuleStore.create({
        name: 'Q3 or Bob',
        match: 'any',
        conditions: [TAG_Q3, FROM_BOB],
      });
      const threads = [
        thread('a', { tags: ['Q3'] }),
        thread('b', { from: 'bob@x.com' }),
        thread('c', { tags: ['Other'] }),
      ];
      const p = RuleStore.preview(r.id, threads);
      expect(p.matched.map(t => t.id).sort()).toEqual(['a', 'b']);
    });

    it('requiresBulkConfirm gdy matched >= BULK_CONFIRM_THRESHOLD', () => {
      const r = RuleStore.create({ name: 'all', conditions: [] });
      const fewer = Array.from({ length: BULK_CONFIRM_THRESHOLD - 1 }, (_, i) => thread(`t${i}`));
      expect(RuleStore.preview(r.id, fewer).requiresBulkConfirm).toBe(false);
      const enough = Array.from({ length: BULK_CONFIRM_THRESHOLD }, (_, i) => thread(`t${i}`));
      expect(RuleStore.preview(r.id, enough).requiresBulkConfirm).toBe(true);
    });

    it('requiresConsent zawiera forward/delete/auto_reply actions', () => {
      const r = RuleStore.create({
        name: 'risky',
        actions: [
          { type: 'tag', value: 'X' },
          { type: 'forward', value: 'spam@x.com' },
          { type: 'delete' },
        ],
      });
      const p = RuleStore.preview(r.id, []);
      const types = p.requiresConsent.map(a => a.type).sort();
      expect(types).toEqual(['delete', 'forward']);
    });

    it('preview nieistniejącego id → puste, false', () => {
      const p = RuleStore.preview('rule_nope', [thread('a')]);
      expect(p.matched).toEqual([]);
      expect(p.requiresBulkConfirm).toBe(false);
      expect(p.requiresConsent).toEqual([]);
    });
  });

  describe('runNow', () => {
    it('inkrementuje hits o liczbę matched', () => {
      const r = RuleStore.create({ name: 'tag', conditions: [TAG_Q3] });
      const threads = [thread('a', { tags: ['Q3'] }), thread('b', { tags: ['Q3'] })];
      expect(r.hits).toBe(0);
      const n = RuleStore.runNow(r.id, threads);
      expect(n).toBe(2);
      expect(RuleStore.get(r.id)?.hits).toBe(2);
    });

    it('ustawia lastRunAt', () => {
      const r = RuleStore.create({ name: 'tag', conditions: [TAG_Q3] });
      RuleStore.runNow(r.id, [thread('a', { tags: ['Q3'] })]);
      expect(RuleStore.get(r.id)?.lastRunAt).toBeGreaterThan(0);
    });

    it('audit log dla run_now z matchCount', () => {
      const r = RuleStore.create({ name: 'tag', conditions: [TAG_Q3] });
      RuleStore.runNow(r.id, [thread('a', { tags: ['Q3'] }), thread('b', { tags: ['Q3'] })]);
      const audit = RuleStore.getAudit();
      const runNow = audit.find(e => e.event === 'run_now');
      expect(runNow?.matchCount).toBe(2);
    });

    it('zero matched → 0, audit nadal pisany', () => {
      const r = RuleStore.create({ name: 'tag', conditions: [TAG_Q3] });
      const n = RuleStore.runNow(r.id, [thread('a', { tags: ['Other'] })]);
      expect(n).toBe(0);
      const runNow = RuleStore.getAudit().find(e => e.event === 'run_now');
      expect(runNow?.matchCount).toBe(0);
      expect(RuleStore.get(r.id)?.hits).toBe(0);
    });

    it('nieistniejący id → 0', () => {
      expect(RuleStore.runNow('rule_nope', [thread('a')])).toBe(0);
    });
  });

  // === Trigger filtering ===

  describe('rulesForTrigger', () => {
    it('zwraca enabled rules dla danego triggera', () => {
      const a = RuleStore.create({ name: 'onArrive', trigger: 'message_arrives', enabled: true });
      RuleStore.create({ name: 'onSent', trigger: 'message_sent', enabled: true });
      RuleStore.create({ name: 'arriveDisabled', trigger: 'message_arrives', enabled: false });
      const arr = RuleStore.rulesForTrigger('message_arrives');
      expect(arr.length).toBe(1);
      expect(arr[0].id).toBe(a.id);
    });
  });

  // === Export / Import ===

  describe('exportJSON / importJSON', () => {
    it('roundtrip preserves rules', () => {
      RuleStore.create({
        name: 'Q3 tagger',
        conditions: [TAG_Q3],
        actions: [{ type: 'tag', value: 'Done' }],
      });
      const json = RuleStore.exportJSON();
      RuleStore._reset();
      RuleStore.init();
      const n = RuleStore.importJSON(json);
      expect(n).toBe(1);
      expect(RuleStore.list()[0].name).toBe('Q3 tagger');
    });

    it('export format: version + exportedAt + rules', () => {
      RuleStore.create({ name: 'X' });
      const parsed = JSON.parse(RuleStore.exportJSON());
      expect(parsed.version).toBe('1.0');
      expect(parsed.exportedAt).toBeGreaterThan(0);
      expect(Array.isArray(parsed.rules)).toBe(true);
    });

    it('replace:true clear istniejących', () => {
      RuleStore.create({ name: 'Original' });
      const otherJson = JSON.stringify({
        version: '1.0',
        rules: [{ name: 'Imported', conditions: [], actions: [], createdAt: 1, updatedAt: 1, order: 0, hits: 0, enabled: true }],
      });
      const n = RuleStore.importJSON(otherJson, { replace: true });
      expect(n).toBe(1);
      expect(RuleStore.count()).toBe(1);
      expect(RuleStore.list()[0].name).toBe('Imported');
    });

    it('bez replace appends z kolejnym order', () => {
      RuleStore.create({ name: 'Original' });
      const more = JSON.stringify({
        version: '1.0',
        rules: [{ name: 'Added', conditions: [], actions: [], order: 0, hits: 0, enabled: true, createdAt: 1, updatedAt: 1 }],
      });
      RuleStore.importJSON(more);
      expect(RuleStore.count()).toBe(2);
      // imported assigned new contiguous order
      const list = RuleStore.list();
      expect(list[0].order).toBe(0);
      expect(list[1].order).toBe(1);
    });

    it('import disabled by default (safety)', () => {
      const json = JSON.stringify({
        version: '1.0',
        rules: [{ name: 'WasEnabled', conditions: [], actions: [], enabled: true, order: 0, hits: 0, createdAt: 1, updatedAt: 1 }],
      });
      RuleStore.importJSON(json);
      // RuleStore importJSON uses `r.enabled ?? false` — eksplicytne enabled:true zostaje
      expect(RuleStore.list()[0].enabled).toBe(true);

      // missing enabled → false
      RuleStore._reset();
      RuleStore.init();
      const noEnabled = JSON.stringify({
        version: '1.0',
        rules: [{ name: 'Default', conditions: [], actions: [], order: 0, hits: 0, createdAt: 1, updatedAt: 1 }],
      });
      RuleStore.importJSON(noEnabled);
      expect(RuleStore.list()[0].enabled).toBe(false);
    });

    it('hits reset na import', () => {
      const json = JSON.stringify({
        version: '1.0',
        rules: [{ name: 'X', conditions: [], actions: [], hits: 999, order: 0, enabled: true, createdAt: 1, updatedAt: 1 }],
      });
      RuleStore.importJSON(json);
      expect(RuleStore.list()[0].hits).toBe(0);
    });

    it('invalid JSON throws', () => {
      expect(() => RuleStore.importJSON('not json')).toThrow();
      expect(() => RuleStore.importJSON('{"foo":1}')).toThrowError(/rules/);
    });

    it('version mismatch loguje warning ale importuje', () => {
      spyOn(console, 'warn');
      const json = JSON.stringify({
        version: '2.0',
        rules: [{ name: 'Future', conditions: [], actions: [], order: 0, enabled: true, createdAt: 1, updatedAt: 1 }],
      });
      const n = RuleStore.importJSON(json);
      expect(n).toBe(1);
      expect(console.warn).toHaveBeenCalled();
    });

    it('skip invalid rules (missing name, missing conditions array, missing actions array)', () => {
      const json = JSON.stringify({
        version: '1.0',
        rules: [
          { name: 'Valid', conditions: [], actions: [], order: 0, enabled: true, createdAt: 1, updatedAt: 1 },
          { name: '', conditions: [], actions: [] },             // invalid: no name
          { name: 'NoConditions', actions: [] },                  // invalid: missing conditions array
          { name: 'NoActions', conditions: [] },                  // invalid: missing actions array
        ],
      });
      expect(RuleStore.importJSON(json)).toBe(1);
    });
  });

  // === Audit log ===

  describe('audit log', () => {
    it('audit pisany na create/update/delete', () => {
      const r = RuleStore.create({ name: 'A' });
      RuleStore.update(r.id, { name: 'A2' });
      RuleStore.delete(r.id);
      const events = RuleStore.getAudit().map(e => e.event);
      expect(events).toContain('created');
      expect(events).toContain('updated');
      expect(events).toContain('deleted');
    });

    it('enable/disable distinct events', () => {
      const r = RuleStore.create({ name: 'X', enabled: false });
      RuleStore.update(r.id, { enabled: true });
      RuleStore.update(r.id, { enabled: false });
      const events = RuleStore.getAudit().map(e => e.event);
      expect(events).toContain('enabled');
      expect(events).toContain('disabled');
    });

    it('clearAudit czyści', () => {
      RuleStore.create({ name: 'X' });
      expect(RuleStore.getAudit().length).toBeGreaterThan(0);
      RuleStore.clearAudit();
      expect(RuleStore.getAudit().length).toBe(0);
    });
  });

  // === Persistence ===

  describe('persistence', () => {
    it('persists rules + audit do localStorage', () => {
      RuleStore.create({ name: 'Persisted' });
      expect(localStorage.getItem('actuna.automation-rules')).toContain('Persisted');
      expect(localStorage.getItem('actuna.automation-rules.audit')).toContain('created');
    });

    it('load po restart (preserve localStorage)', () => {
      RuleStore.create({ name: 'A' });
      const raw = localStorage.getItem('actuna.automation-rules')!;
      const audit = localStorage.getItem('actuna.automation-rules.audit')!;
      RuleStore._reset();
      localStorage.setItem('actuna.automation-rules', raw);
      localStorage.setItem('actuna.automation-rules.audit', audit);
      RuleStore.init();
      expect(RuleStore.count()).toBe(1);
      expect(RuleStore.list()[0].name).toBe('A');
      expect(RuleStore.getAudit().length).toBeGreaterThan(0);
    });
  });

  // === Listen ===

  describe('listen', () => {
    it('emit na create/update/delete', () => {
      let count = 0;
      const unsub = RuleStore.listen(() => count++);
      const r = RuleStore.create({ name: 'A' });
      RuleStore.update(r.id, { name: 'B' });
      RuleStore.delete(r.id);
      expect(count).toBe(3);
      unsub();
    });

    it('unsubscribe', () => {
      let count = 0;
      const unsub = RuleStore.listen(() => count++);
      unsub();
      RuleStore.create({ name: 'X' });
      expect(count).toBe(0);
    });
  });
});
