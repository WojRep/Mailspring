/**
 * Bilet MVP #99 — Smart Folder unit tests.
 *
 * Pokrycie:
 *  - parseSearchSyntax (tag:/from:/to:/subject:/has:/is:/folder:/account: + negation -tag: + free text + quoted).
 *  - evalRule per field/operator.
 *  - evalRules all/any modes.
 *  - filterThreads.
 *  - SmartFolderStore CRUD (create/update/delete/list sort).
 *  - exportJSON/importJSON roundtrip + version mismatch + invalid payload.
 *  - localStorage persistence.
 *  - listen notifications.
 */

import {
  evalRule,
  evalRules,
  filterThreads,
  parseSearchSyntax,
  Rule,
  ThreadMeta,
} from '../internal_packages/smart-folder/lib/rule-engine';
import { SmartFolderStore } from '../internal_packages/smart-folder/lib/smart-folder-store';

function thread(id: string, patch: Partial<ThreadMeta> = {}): ThreadMeta {
  return { id, ...patch };
}

describe('Smart Folder — bilet MVP #99', () => {

  beforeEach(() => {
    SmartFolderStore._reset();
    SmartFolderStore.init();
  });

  // === parseSearchSyntax ===

  describe('parseSearchSyntax', () => {
    it('zwraca puste rules dla pustego query', () => {
      expect(parseSearchSyntax('')).toEqual([]);
      expect(parseSearchSyntax('   ')).toEqual([]);
    });

    it('tag: → contains tag', () => {
      const rules = parseSearchSyntax('tag:Q3');
      expect(rules.length).toBe(1);
      expect(rules[0]).toEqual({ field: 'tag', op: 'contains', value: 'Q3' });
    });

    it('-tag: → does_not_contain (negation)', () => {
      const rules = parseSearchSyntax('-tag:Newsletter');
      expect(rules[0]).toEqual({ field: 'tag', op: 'does_not_contain', value: 'Newsletter' });
    });

    it('from: → contains', () => {
      const rules = parseSearchSyntax('from:bob@example.com');
      expect(rules[0]).toEqual({ field: 'from', op: 'contains', value: 'bob@example.com' });
    });

    it('subject: → contains', () => {
      const rules = parseSearchSyntax('subject:Faktura');
      expect(rules[0]).toEqual({ field: 'subject', op: 'contains', value: 'Faktura' });
    });

    it('has:attachment + PL załącznik', () => {
      expect(parseSearchSyntax('has:attachment')[0])
        .toEqual({ field: 'has_attachment', op: 'is', value: true });
      expect(parseSearchSyntax('has:załącznik')[0])
        .toEqual({ field: 'has_attachment', op: 'is', value: true });
    });

    it('is:unread / is:starred / is:pinned + PL aliasy', () => {
      expect(parseSearchSyntax('is:unread')[0]).toEqual({ field: 'read', op: 'is', value: false });
      expect(parseSearchSyntax('is:nieprzeczytane')[0]).toEqual({ field: 'read', op: 'is', value: false });
      expect(parseSearchSyntax('is:starred')[0]).toEqual({ field: 'starred', op: 'is', value: true });
      expect(parseSearchSyntax('is:pinned')[0]).toEqual({ field: 'pinned', op: 'is', value: true });
    });

    it('folder: + account:', () => {
      expect(parseSearchSyntax('folder:Inbox')[0]).toEqual({ field: 'folder', op: 'is', value: 'Inbox' });
      expect(parseSearchSyntax('account:work')[0]).toEqual({ field: 'account', op: 'is', value: 'work' });
    });

    it('free text → subject contains', () => {
      const rules = parseSearchSyntax('faktura');
      expect(rules[0]).toEqual({ field: 'subject', op: 'contains', value: 'faktura' });
    });

    it('kombinacja prefixes + free text', () => {
      const rules = parseSearchSyntax('tag:Q3 from:bob has:attachment faktura');
      expect(rules.length).toBe(4);
      expect(rules[0].field).toBe('tag');
      expect(rules[1].field).toBe('from');
      expect(rules[2].field).toBe('has_attachment');
      expect(rules[3]).toEqual({ field: 'subject', op: 'contains', value: 'faktura' });
    });

    it('quoted string traktowany jako single token', () => {
      const rules = parseSearchSyntax('subject:"Re: Faktura 2026"');
      expect(rules.length).toBe(1);
      expect(rules[0].value).toContain('Re: Faktura 2026');
    });
  });

  // === evalRule ===

  describe('evalRule — tag (array semantics)', () => {
    it('contains gdy tag w array', () => {
      const t = thread('t1', { tags: ['Q3', 'Important'] });
      expect(evalRule({ field: 'tag', op: 'contains', value: 'Q3' }, t)).toBe(true);
      expect(evalRule({ field: 'tag', op: 'contains', value: 'Q4' }, t)).toBe(false);
    });

    it('does_not_contain inverts', () => {
      const t = thread('t1', { tags: ['Q3'] });
      expect(evalRule({ field: 'tag', op: 'does_not_contain', value: 'Newsletter' }, t)).toBe(true);
      expect(evalRule({ field: 'tag', op: 'does_not_contain', value: 'Q3' }, t)).toBe(false);
    });
  });

  describe('evalRule — string fields', () => {
    it('subject contains (case-insensitive)', () => {
      const t = thread('t1', { subject: 'Faktura 2026' });
      expect(evalRule({ field: 'subject', op: 'contains', value: 'faktura' }, t)).toBe(true);
      expect(evalRule({ field: 'subject', op: 'contains', value: 'umowa' }, t)).toBe(false);
    });

    it('from starts_with / ends_with', () => {
      const t = thread('t1', { from: 'bob@actuna.pl' });
      expect(evalRule({ field: 'from', op: 'starts_with', value: 'bob' }, t)).toBe(true);
      expect(evalRule({ field: 'from', op: 'ends_with', value: '@actuna.pl' }, t)).toBe(true);
      expect(evalRule({ field: 'from', op: 'starts_with', value: 'alice' }, t)).toBe(false);
    });

    it('matches_regex', () => {
      const t = thread('t1', { subject: 'Faktura 2026-05-27' });
      expect(evalRule({ field: 'subject', op: 'matches_regex', value: '\\d{4}-\\d{2}-\\d{2}' }, t)).toBe(true);
    });
  });

  describe('evalRule — boolean fields', () => {
    it('has_attachment', () => {
      const withA = thread('t1', { hasAttachment: true });
      const withoutA = thread('t2', { hasAttachment: false });
      const rule: Rule = { field: 'has_attachment', op: 'is', value: true };
      expect(evalRule(rule, withA)).toBe(true);
      expect(evalRule(rule, withoutA)).toBe(false);
    });

    it('starred / pinned', () => {
      const t = thread('t1', { starred: true, pinned: false });
      expect(evalRule({ field: 'starred', op: 'is', value: true }, t)).toBe(true);
      expect(evalRule({ field: 'pinned', op: 'is', value: false }, t)).toBe(true);
    });
  });

  describe('evalRule — date', () => {
    it('within_last_days', () => {
      const recent = thread('t1', { date: Date.now() - 1 * 24 * 60 * 60 * 1000 });
      const old = thread('t2', { date: Date.now() - 30 * 24 * 60 * 60 * 1000 });
      const rule: Rule = { field: 'date', op: 'within_last_days', value: 7 };
      expect(evalRule(rule, recent)).toBe(true);
      expect(evalRule(rule, old)).toBe(false);
    });

    it('before / after', () => {
      const cutoff = 1_700_000_000_000;
      expect(evalRule({ field: 'date', op: 'after', value: cutoff }, thread('t', { date: cutoff + 1000 }))).toBe(true);
      expect(evalRule({ field: 'date', op: 'before', value: cutoff }, thread('t', { date: cutoff - 1000 }))).toBe(true);
    });
  });

  describe('evalRule — sender_domain (derived)', () => {
    it('wyciąga domain z from', () => {
      const t = thread('t1', { from: 'alice@actuna.pl' });
      expect(evalRule({ field: 'sender_domain', op: 'is', value: 'actuna.pl' }, t)).toBe(true);
    });

    it('zwraca pusty gdy brak @', () => {
      const t = thread('t1', { from: 'noreply' });
      expect(evalRule({ field: 'sender_domain', op: 'is', value: '' }, t)).toBe(true);
    });
  });

  // === evalRules (all/any) ===

  describe('evalRules', () => {
    const r1: Rule = { field: 'tag', op: 'contains', value: 'Q3' };
    const r2: Rule = { field: 'has_attachment', op: 'is', value: true };
    const t = thread('t1', { tags: ['Q3'], hasAttachment: true });

    it('puste rules → true (no filter)', () => {
      expect(evalRules([], 'all', t)).toBe(true);
      expect(evalRules([], 'any', t)).toBe(true);
    });

    it('all → AND', () => {
      expect(evalRules([r1, r2], 'all', t)).toBe(true);
      const t2 = thread('t2', { tags: ['Q3'], hasAttachment: false });
      expect(evalRules([r1, r2], 'all', t2)).toBe(false);
    });

    it('any → OR', () => {
      const t2 = thread('t2', { tags: ['Other'], hasAttachment: true });
      expect(evalRules([r1, r2], 'any', t2)).toBe(true);
      const t3 = thread('t3', { tags: ['Other'], hasAttachment: false });
      expect(evalRules([r1, r2], 'any', t3)).toBe(false);
    });
  });

  describe('filterThreads', () => {
    it('zwraca threads pasujące do rules', () => {
      const threads = [
        thread('a', { tags: ['Q3'] }),
        thread('b', { tags: ['Q4'] }),
        thread('c', { tags: ['Q3', 'Important'] }),
      ];
      const rules: Rule[] = [{ field: 'tag', op: 'contains', value: 'Q3' }];
      const result = filterThreads(rules, 'all', threads);
      expect(result.length).toBe(2);
      expect(result.map(t => t.id).sort()).toEqual(['a', 'c']);
    });
  });

  // === SmartFolderStore CRUD ===

  describe('SmartFolderStore — CRUD', () => {
    it('create → assigns id + timestamps + defaults', () => {
      const f = SmartFolderStore.create({
        name: 'Q3 important',
        match: 'all',
        rules: [{ field: 'tag', op: 'contains', value: 'Q3' }],
      });
      expect(f.id).toMatch(/^sf_/);
      expect(f.createdAt).toBeGreaterThan(0);
      expect(f.updatedAt).toBeGreaterThan(0);
      expect(f.sort).toBe('date_desc');
      expect(f.realtime).toBe(true);
      expect(f.notifyOnMatch).toBe(false);
      expect(f.color).toBe('var(--accent-500)');
    });

    it('create — rzuca dla pustego name', () => {
      expect(() => SmartFolderStore.create({ name: '', match: 'all', rules: [] }))
        .toThrowError(/name required/);
      expect(() => SmartFolderStore.create({ name: '   ', match: 'all', rules: [] }))
        .toThrowError(/name required/);
    });

    it('update patches fields + bumps updatedAt; preserves id+createdAt', () => {
      const f = SmartFolderStore.create({ name: 'Foo', match: 'all', rules: [] });
      const orig = { id: f.id, createdAt: f.createdAt };
      const updated = SmartFolderStore.update(f.id, { name: 'Bar', match: 'any' });
      expect(updated?.id).toBe(orig.id);
      expect(updated?.createdAt).toBe(orig.createdAt);
      expect(updated?.name).toBe('Bar');
      expect(updated?.match).toBe('any');
    });

    it('update — zwraca undefined dla nieistniejącego id', () => {
      expect(SmartFolderStore.update('sf_nope', { name: 'X' })).toBeUndefined();
    });

    it('delete usuwa + zwraca true/false', () => {
      const f = SmartFolderStore.create({ name: 'Foo', match: 'all', rules: [] });
      expect(SmartFolderStore.delete(f.id)).toBe(true);
      expect(SmartFolderStore.get(f.id)).toBeUndefined();
      expect(SmartFolderStore.delete('sf_nope')).toBe(false);
    });

    it('list sortuje alfabetycznie po name', () => {
      SmartFolderStore.create({ name: 'Zeta', match: 'all', rules: [] });
      SmartFolderStore.create({ name: 'Alpha', match: 'all', rules: [] });
      SmartFolderStore.create({ name: 'Mike', match: 'all', rules: [] });
      const names = SmartFolderStore.list().map(f => f.name);
      expect(names).toEqual(['Alpha', 'Mike', 'Zeta']);
    });

    it('count zwraca liczbę folderów', () => {
      expect(SmartFolderStore.count()).toBe(0);
      SmartFolderStore.create({ name: 'A', match: 'all', rules: [] });
      SmartFolderStore.create({ name: 'B', match: 'all', rules: [] });
      expect(SmartFolderStore.count()).toBe(2);
    });
  });

  describe('SmartFolderStore — match', () => {
    it('match aplikuje rules folderu do threads', () => {
      const f = SmartFolderStore.create({
        name: 'Pinned',
        match: 'all',
        rules: [{ field: 'pinned', op: 'is', value: true }],
      });
      const threads = [
        thread('a', { pinned: true }),
        thread('b', { pinned: false }),
        thread('c', { pinned: true }),
      ];
      const result = SmartFolderStore.match(f.id, threads);
      expect(result.map(t => t.id).sort()).toEqual(['a', 'c']);
    });

    it('match nieznanego id → puste', () => {
      expect(SmartFolderStore.match('sf_nope', [thread('x')])).toEqual([]);
    });
  });

  // === Export / Import ===

  describe('SmartFolderStore — exportJSON/importJSON', () => {
    it('roundtrip preserves folders', () => {
      SmartFolderStore.create({
        name: 'Q3',
        match: 'all',
        rules: [{ field: 'tag', op: 'contains', value: 'Q3' }],
      });
      const json = SmartFolderStore.exportJSON();
      SmartFolderStore._reset();
      SmartFolderStore.init();
      const count = SmartFolderStore.importJSON(json);
      expect(count).toBe(1);
      expect(SmartFolderStore.list()[0].name).toBe('Q3');
    });

    it('exportJSON zawiera version + folders', () => {
      SmartFolderStore.create({ name: 'X', match: 'all', rules: [] });
      const parsed = JSON.parse(SmartFolderStore.exportJSON());
      expect(parsed.version).toBe('1.0');
      expect(Array.isArray(parsed.folders)).toBe(true);
      expect(parsed.folders.length).toBe(1);
    });

    it('importJSON — replace:true clear istniejących', () => {
      SmartFolderStore.create({ name: 'Original', match: 'all', rules: [] });
      const otherStore = JSON.stringify({
        version: '1.0',
        folders: [{ name: 'Imported', match: 'all', rules: [], createdAt: 1, updatedAt: 1 }],
      });
      const n = SmartFolderStore.importJSON(otherStore, { replace: true });
      expect(n).toBe(1);
      expect(SmartFolderStore.count()).toBe(1);
      expect(SmartFolderStore.list()[0].name).toBe('Imported');
    });

    it('importJSON bez replace appends', () => {
      SmartFolderStore.create({ name: 'Original', match: 'all', rules: [] });
      const more = JSON.stringify({
        version: '1.0',
        folders: [{ name: 'Added', match: 'all', rules: [], createdAt: 1, updatedAt: 1 }],
      });
      SmartFolderStore.importJSON(more);
      expect(SmartFolderStore.count()).toBe(2);
    });

    it('importJSON — invalid payload throws', () => {
      expect(() => SmartFolderStore.importJSON('not json')).toThrow();
      expect(() => SmartFolderStore.importJSON('{"foo":1}')).toThrowError(/folders/);
    });

    it('importJSON — version mismatch loguje warning, ale importuje', () => {
      spyOn(console, 'warn');
      const json = JSON.stringify({
        version: '2.0',
        folders: [{ name: 'Future', match: 'all', rules: [], createdAt: 1, updatedAt: 1 }],
      });
      const n = SmartFolderStore.importJSON(json);
      expect(n).toBe(1);
      expect(console.warn).toHaveBeenCalled();
    });

    it('importJSON — skip invalid folder entries', () => {
      const json = JSON.stringify({
        version: '1.0',
        folders: [
          { name: 'Valid', match: 'all', rules: [], createdAt: 1, updatedAt: 1 },
          { name: '', match: 'all', rules: [] }, // invalid: no name
          { match: 'all', rules: [] },           // invalid: no name
          { name: 'NoRules', match: 'all' },     // invalid: rules not array
        ],
      });
      expect(SmartFolderStore.importJSON(json)).toBe(1);
    });
  });

  // === Persistence ===

  describe('SmartFolderStore — persistence', () => {
    it('persists do localStorage', () => {
      SmartFolderStore.create({ name: 'Persisted', match: 'all', rules: [] });
      const raw = localStorage.getItem('actuna.smart-folders');
      expect(raw).toBeTruthy();
      expect(raw).toContain('Persisted');
    });

    it('load po _reset+init odczytuje localStorage', () => {
      SmartFolderStore.create({ name: 'A', match: 'all', rules: [] });
      // Force second store init bez wymazania localStorage
      // Simuluje restart sesji
      // _reset wymazuje localStorage więc tu nie używamy — manual approach:
      const raw = localStorage.getItem('actuna.smart-folders')!;
      SmartFolderStore._reset();
      localStorage.setItem('actuna.smart-folders', raw);
      SmartFolderStore.init();
      expect(SmartFolderStore.count()).toBe(1);
      expect(SmartFolderStore.list()[0].name).toBe('A');
    });
  });

  // === Listen ===

  describe('SmartFolderStore — listen', () => {
    it('emit na create / update / delete', () => {
      let count = 0;
      const unsub = SmartFolderStore.listen(() => count++);
      const f = SmartFolderStore.create({ name: 'A', match: 'all', rules: [] });
      SmartFolderStore.update(f.id, { name: 'B' });
      SmartFolderStore.delete(f.id);
      expect(count).toBe(3);
      unsub();
    });

    it('unsubscribe usuwa listener', () => {
      let count = 0;
      const unsub = SmartFolderStore.listen(() => count++);
      unsub();
      SmartFolderStore.create({ name: 'X', match: 'all', rules: [] });
      expect(count).toBe(0);
    });

    it('emit na importJSON gdy count > 0', () => {
      let count = 0;
      const unsub = SmartFolderStore.listen(() => count++);
      SmartFolderStore.importJSON(JSON.stringify({
        version: '1.0',
        folders: [{ name: 'A', match: 'all', rules: [], createdAt: 1, updatedAt: 1 }],
      }));
      expect(count).toBe(1);
      unsub();
    });
  });
});
