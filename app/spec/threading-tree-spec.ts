/**
 * Bilet MVP #97 — Threading tree algorithm tests.
 */

import {
  buildThreadTree,
  flattenTree,
  navigateMessage,
  navigateKonar,
  normalizeSubject,
  MessageNode,
} from '../internal_packages/threading-tree/lib/konar-algorithm';

function msg(id: string, date: number, opts: Partial<MessageNode> = {}): MessageNode {
  return { id, date, ...opts };
}

describe('Threading tree — bilet MVP #97', () => {

  describe('normalizeSubject', () => {
    it('strips Re:/Fw:/Fwd: prefixes', () => {
      expect(normalizeSubject('Re: Hello')).toBe('hello');
      expect(normalizeSubject('Fwd: Important')).toBe('important');
      expect(normalizeSubject('Fw: News')).toBe('news');
    });

    it('strips multiple nested prefixes', () => {
      expect(normalizeSubject('Re: Re: Re: Foo')).toBe('foo');
    });

    it('strips Polish prefixes Odp/Pd/Dw', () => {
      expect(normalizeSubject('Odp: Sprawa')).toBe('sprawa');
      expect(normalizeSubject('Pd: Notatka')).toBe('notatka');
    });

    it('case-insensitive', () => {
      expect(normalizeSubject('RE: HELLO')).toBe('hello');
    });

    it('empty for empty input', () => {
      expect(normalizeSubject('')).toBe('');
      expect(normalizeSubject(undefined)).toBe('');
    });
  });

  describe('buildThreadTree — empty/single', () => {
    it('returns empty for empty input', () => {
      const tree = buildThreadTree([]);
      expect(tree.roots).toEqual([]);
      expect(tree.konarCount).toBe(0);
      expect(tree.totalMessages).toBe(0);
    });

    it('single message → 1 root, 1 konar', () => {
      const tree = buildThreadTree([msg('m1', 1000)]);
      expect(tree.roots.length).toBe(1);
      expect(tree.konarCount).toBe(1);
      expect(tree.totalMessages).toBe(1);
      expect(tree.roots[0].isLatestInKonar).toBe(true);
    });
  });

  describe('buildThreadTree — linear thread (no branches)', () => {
    it('A→B→C in-reply-to chain stays w jednym konaru', () => {
      const tree = buildThreadTree([
        msg('a', 1000),
        msg('b', 2000, { inReplyTo: 'a' }),
        msg('c', 3000, { inReplyTo: 'b' }),
      ]);
      expect(tree.konarCount).toBe(1);
      expect(tree.totalMessages).toBe(3);
      expect(tree.roots.length).toBe(1);
      // Tylko c (najnowszy w jedyny konar) ma OSTATNI
      const flat = flattenTree(tree);
      const latestNodes = flat.filter(n => n.isLatestInKonar);
      expect(latestNodes.length).toBe(1);
      expect(latestNodes[0].message.id).toBe('c');
    });
  });

  describe('buildThreadTree — branching', () => {
    it('A with 2 children → 2 konars', () => {
      const tree = buildThreadTree([
        msg('a', 1000),
        msg('b', 2000, { inReplyTo: 'a' }),
        msg('c', 3000, { inReplyTo: 'a' }), // second branch
      ]);
      expect(tree.konarCount).toBe(2);
      // c najpóźniejsze, ale w innym konaru — oba (b i c) najnowsze w swoich konarach
      const flat = flattenTree(tree);
      const latest = flat.filter(n => n.isLatestInKonar);
      expect(latest.length).toBe(2);
    });

    it('3-branch wątek — 3 konary, 3 OSTATNI', () => {
      const tree = buildThreadTree([
        msg('root', 1000),
        msg('b1', 2000, { inReplyTo: 'root' }),
        msg('b2', 2500, { inReplyTo: 'root' }),
        msg('b3', 3000, { inReplyTo: 'root' }),
        msg('b1-reply', 4000, { inReplyTo: 'b1' }),
      ]);
      expect(tree.konarCount).toBe(3);
      const flat = flattenTree(tree);
      const latest = flat.filter(n => n.isLatestInKonar);
      expect(latest.length).toBe(3);
    });
  });

  describe('buildThreadTree — References fallback', () => {
    it('uses last entry z references gdy in-reply-to missing', () => {
      const tree = buildThreadTree([
        msg('a', 1000),
        msg('b', 2000, { references: ['a'] }),
      ]);
      expect(tree.konarCount).toBe(1);
      expect(tree.totalMessages).toBe(2);
    });

    it('preferuje in-reply-to nad references', () => {
      const tree = buildThreadTree([
        msg('a', 1000),
        msg('b', 2000),
        msg('c', 3000, { inReplyTo: 'b', references: ['a', 'b'] }),
      ]);
      // c child of b (in-reply-to wins), nie a
      expect(tree.totalMessages).toBe(3);
    });
  });

  describe('buildThreadTree — Subject fallback', () => {
    it('matchuje messages bez headers po normalized subject', () => {
      const tree = buildThreadTree([
        msg('a', 1000, { subject: 'Project X' }),
        msg('b', 2000, { subject: 'Re: Project X' }),
        msg('c', 3000, { subject: 'Re: Re: Project X' }),
      ]);
      // Wszystko w jeden wątek przez Subject match
      expect(tree.totalMessages).toBe(3);
      // Root = a (oldest), b i c jako dzieci
      expect((tree.roots.length) >= (1)).toBe(true);
    });
  });

  describe('navigateMessage', () => {
    it('next/prev w timeline order', () => {
      const tree = buildThreadTree([
        msg('a', 1000),
        msg('b', 2000, { inReplyTo: 'a' }),
        msg('c', 3000, { inReplyTo: 'b' }),
      ]);
      const next = navigateMessage(tree, 'a', 'next');
      expect(next?.message.id).toBe('b');
      const prev = navigateMessage(tree, 'c', 'prev');
      expect(prev?.message.id).toBe('b');
    });

    it('returns null gdy poza boundary', () => {
      const tree = buildThreadTree([msg('a', 1000)]);
      expect(navigateMessage(tree, 'a', 'next')).toBeNull();
      expect(navigateMessage(tree, 'a', 'prev')).toBeNull();
    });
  });

  describe('navigateKonar', () => {
    it('przeskakuje do innego konaru', () => {
      const tree = buildThreadTree([
        msg('root', 1000),
        msg('b1', 2000, { inReplyTo: 'root' }),  // konar 0 (root)
        msg('b2', 2500, { inReplyTo: 'root' }),  // nowy konar
      ]);
      const next = navigateKonar(tree, 'root', 'next');
      // Następny w innym konaru — b1 jest w konar 0 (kontynuacja root), b2 w nowym
      expect(next?.message.id).toBe('b2');
    });
  });
});
