/**
 * Bilet MVP #98 — Tag system unit tests.
 */

import { TagStore } from '../internal_packages/tag-system/lib/tag-store';

function mkTag(id: string, opts: any = {}) {
  return { id, name: opts.name || id, color: opts.color || 'var(--accent-500)', source: opts.source || 'user', ...opts };
}

describe('Tag system — bilet MVP #98', () => {

  beforeEach(() => {
    TagStore._reset();
  });

  describe('registry CRUD', () => {
    it('register adds tag', () => {
      TagStore.register(mkTag('client', { name: 'Klient' }));
      expect(TagStore.list().length).toBe(1);
      expect(TagStore.get('client')?.name).toBe('Klient');
    });

    it('register with same id replaces', () => {
      TagStore.register(mkTag('a', { name: 'First' }));
      TagStore.register(mkTag('a', { name: 'Second' }));
      expect(TagStore.get('a')?.name).toBe('Second');
      expect(TagStore.list().length).toBe(1);
    });

    it('register throws bez id/name', () => {
      expect(() => TagStore.register({ id: '', name: 'X', color: 'red', source: 'user' } as any)).toThrow();
      expect(() => TagStore.register({ id: 'x', name: '', color: 'red', source: 'user' } as any)).toThrow();
    });

    it('registerAll bulk', () => {
      TagStore.registerAll([
        mkTag('a'), mkTag('b'), mkTag('c'),
      ]);
      expect(TagStore.list().length).toBe(3);
    });

    it('list sorts user tags alphabetic, system tags at end', () => {
      TagStore.registerAll([
        mkTag('zzz', { name: 'zzz' }),
        mkTag('__sys_a', { name: 'System A', systemManaged: true, source: 'system' }),
        mkTag('aaa', { name: 'aaa' }),
      ]);
      const list = TagStore.list();
      expect(list[0].name).toBe('aaa');
      expect(list[1].name).toBe('zzz');
      expect(list[2].name).toBe('System A');
    });

    it('rename works for user tags', () => {
      TagStore.register(mkTag('a', { name: 'Old' }));
      expect(TagStore.rename('a', 'New')).toBe(true);
      expect(TagStore.get('a')?.name).toBe('New');
    });

    it('rename refuses system-managed tags', () => {
      TagStore.register(mkTag('sys', { systemManaged: true }));
      expect(TagStore.rename('sys', 'Hacked')).toBe(false);
      expect(TagStore.get('sys')?.name).toBe('sys');
    });

    it('setColor works for user tags', () => {
      TagStore.register(mkTag('a'));
      expect(TagStore.setColor('a', '#ff0000')).toBe(true);
      expect(TagStore.get('a')?.color).toBe('#ff0000');
    });

    it('delete removes from registry AND assignments', () => {
      TagStore.register(mkTag('a'));
      TagStore.apply('t1', 'a');
      expect(TagStore.delete('a')).toBe(true);
      expect(TagStore.get('a')).toBeUndefined();
      expect(TagStore.hasTag('t1', 'a')).toBe(false);
    });

    it('delete refuses system-managed', () => {
      TagStore.register(mkTag('sys', { systemManaged: true }));
      expect(TagStore.delete('sys')).toBe(false);
    });

    it('merge moves assignments from source to target', () => {
      TagStore.register(mkTag('source'));
      TagStore.register(mkTag('target'));
      TagStore.apply('t1', 'source');
      TagStore.apply('t2', 'source');
      expect(TagStore.merge('source', 'target')).toBe(true);
      expect(TagStore.get('source')).toBeUndefined();
      expect(TagStore.hasTag('t1', 'target')).toBe(true);
      expect(TagStore.hasTag('t2', 'target')).toBe(true);
    });

    it('merge same id returns false', () => {
      TagStore.register(mkTag('a'));
      expect(TagStore.merge('a', 'a')).toBe(false);
    });

    it('merge refuses system source', () => {
      TagStore.register(mkTag('sys', { systemManaged: true }));
      TagStore.register(mkTag('user'));
      expect(TagStore.merge('sys', 'user')).toBe(false);
    });
  });

  describe('per-thread assignments', () => {
    beforeEach(() => {
      TagStore.register(mkTag('a'));
      TagStore.register(mkTag('b'));
      TagStore.register(mkTag('c'));
    });

    it('apply adds tag to thread', () => {
      expect(TagStore.apply('t1', 'a')).toBe(true);
      expect(TagStore.hasTag('t1', 'a')).toBe(true);
      expect(TagStore.getTagIds('t1')).toEqual(['a']);
    });

    it('apply is idempotent', () => {
      TagStore.apply('t1', 'a');
      expect(TagStore.apply('t1', 'a')).toBe(false);
      expect(TagStore.getTagIds('t1').length).toBe(1);
    });

    it('apply refuses unknown tag', () => {
      expect(TagStore.apply('t1', 'nonexistent')).toBe(false);
    });

    it('multi-tag per thread', () => {
      TagStore.apply('t1', 'a');
      TagStore.apply('t1', 'b');
      TagStore.apply('t1', 'c');
      expect(TagStore.getTagIds('t1').sort()).toEqual(['a', 'b', 'c']);
    });

    it('remove deletes tag from thread', () => {
      TagStore.apply('t1', 'a');
      TagStore.apply('t1', 'b');
      TagStore.remove('t1', 'a');
      expect(TagStore.getTagIds('t1')).toEqual(['b']);
    });

    it('remove cleans up empty assignment set', () => {
      TagStore.apply('t1', 'a');
      TagStore.remove('t1', 'a');
      expect(TagStore.getTags('t1').length).toBe(0);
    });

    it('toggle flips assignment', () => {
      expect(TagStore.toggle('t1', 'a')).toBe(true);
      expect(TagStore.hasTag('t1', 'a')).toBe(true);
      expect(TagStore.toggle('t1', 'a')).toBe(false);
      expect(TagStore.hasTag('t1', 'a')).toBe(false);
    });

    it('applyBulk N tags × M threads', () => {
      const changes = TagStore.applyBulk(['t1', 't2', 't3'], ['a', 'b']);
      expect(changes).toBe(6);
      expect(TagStore.getTagIds('t1').sort()).toEqual(['a', 'b']);
      expect(TagStore.getTagIds('t2').sort()).toEqual(['a', 'b']);
      expect(TagStore.getTagIds('t3').sort()).toEqual(['a', 'b']);
    });

    it('getTags returns Tag objects', () => {
      TagStore.apply('t1', 'a');
      const tags = TagStore.getTags('t1');
      expect(tags.length).toBe(1);
      expect(tags[0].name).toBe('a');
    });
  });

  describe('stats', () => {
    it('counts user vs system tags', () => {
      TagStore.register(mkTag('u1'));
      TagStore.register(mkTag('u2'));
      TagStore.register(mkTag('sys1', { systemManaged: true }));
      const s = TagStore.stats();
      expect(s.totalTags).toBe(3);
      expect(s.userTags).toBe(2);
      expect(s.systemTags).toBe(1);
    });

    it('counts totalAssignments', () => {
      TagStore.register(mkTag('a'));
      TagStore.register(mkTag('b'));
      TagStore.apply('t1', 'a');
      TagStore.apply('t1', 'b');
      TagStore.apply('t2', 'a');
      expect(TagStore.stats().totalAssignments).toBe(3);
    });
  });

  describe('persistence', () => {
    it('persists registry to localStorage', () => {
      TagStore.register(mkTag('persisted', { name: 'Persisted Tag' }));
      const raw = localStorage.getItem('actuna.tags.registry');
      expect(raw).toContain('Persisted Tag');
    });

    it('persists assignments to localStorage', () => {
      TagStore.register(mkTag('a'));
      TagStore.apply('thread-123', 'a');
      const raw = localStorage.getItem('actuna.tags.assignments');
      expect(raw).toContain('thread-123');
    });
  });

  describe('listen', () => {
    it('notifies on register/apply/remove', () => {
      let count = 0;
      const unsub = TagStore.listen(() => count++);
      TagStore.register(mkTag('a'));
      TagStore.apply('t1', 'a');
      TagStore.remove('t1', 'a');
      expect(count).toBeGreaterThanOrEqual(3);
      unsub();
    });
  });
});
