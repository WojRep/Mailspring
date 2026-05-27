/**
 * Bilet MVP #108 — @mention picker unit tests.
 *
 * Pokrycie: detectMentionTrigger (4 cases), searchMentions delegates do PeopleHub,
 * searchMentionsWithFallback (autocomplete → ContactCard), buildMentionInsertion,
 * renderMentionFallback, extractEmailFromMention.
 */

import {
  detectMentionTrigger,
  searchMentions,
  searchMentionsWithFallback,
  buildMentionInsertion,
  renderMentionFallback,
  extractEmailFromMention,
  MENTION_TRIGGER_MIN_CHARS,
} from '../internal_packages/mention-picker/lib/mention-engine';
import { PeopleHubStore } from '../internal_packages/people-hub/lib/people-hub-store';
import { ContactCardStore } from '../internal_packages/contact-card/lib/contact-card-store';

describe('@mention picker — bilet MVP #108', () => {

  beforeEach(() => {
    PeopleHubStore._reset();
    ContactCardStore._reset();
    PeopleHubStore.init();
    ContactCardStore.init();
  });

  describe('detectMentionTrigger', () => {
    it('zwraca query po @ na początku linii', () => {
      expect(detectMentionTrigger('@bob')).toBe('bob');
    });

    it('zwraca query po @ po spacji', () => {
      expect(detectMentionTrigger('Hello @bob')).toBe('bob');
    });

    it('null gdy żaden @ blisko cursor', () => {
      expect(detectMentionTrigger('Hello world')).toBeNull();
    });

    it('null gdy email pattern (after =, brak space)', () => {
      // @ wewnątrz email address: "bob@example.com" — nie matches bo brak space/start before @
      expect(detectMentionTrigger('Send to bob@example.com')).toBeNull();
    });

    it('null gdy zbyt krótki query (< MIN chars)', () => {
      // MIN = 1, więc empty query po @ → null
      expect(detectMentionTrigger('Hi @')).toBeNull();
    });

    it('respektuje MENTION_TRIGGER_MIN_CHARS', () => {
      expect(MENTION_TRIGGER_MIN_CHARS).toBeGreaterThanOrEqual(1);
    });
  });

  describe('searchMentions (delegates do PeopleHub)', () => {
    it('zwraca matched entries z autocomplete', () => {
      PeopleHubStore.recordUsage('bob@x.com', 'Bob Smith');
      PeopleHubStore.recordUsage('alice@x.com', 'Alice');
      const results = searchMentions('bob');
      expect(results.length).toBe(1);
      expect(results[0].email).toBe('bob@x.com');
      expect(results[0].displayName).toBe('Bob Smith');
    });

    it('displayName fallback do email local part gdy brak name', () => {
      PeopleHubStore.recordUsage('noname@x.com');
      const results = searchMentions('noname');
      expect(results[0].displayName).toBe('noname');
    });

    it('respektuje limit', () => {
      for (let i = 0; i < 20; i++) PeopleHubStore.recordUsage(`bob${i}@x.com`, `Bob${i}`);
      expect(searchMentions('bob', 5).length).toBe(5);
    });
  });

  describe('searchMentionsWithFallback', () => {
    it('primary z autocomplete', () => {
      PeopleHubStore.recordUsage('bob@x.com', 'Bob');
      ContactCardStore.upsert('alice@x.com', { name: 'Alice' });
      const results = searchMentionsWithFallback('bob');
      expect(results[0].email).toBe('bob@x.com');
    });

    it('fallback do ContactCardStore gdy autocomplete pusty', () => {
      ContactCardStore.upsert('alice@x.com', { name: 'Alice Cooper' });
      const results = searchMentionsWithFallback('alice');
      expect(results.length).toBe(1);
      expect(results[0].email).toBe('alice@x.com');
      expect(results[0].displayName).toBe('Alice Cooper');
    });

    it('puste gdy nic nie matche', () => {
      expect(searchMentionsWithFallback('nobody')).toEqual([]);
    });
  });

  describe('buildMentionInsertion', () => {
    const match = {
      entry: { email: 'bob@x.com', name: 'Bob Smith', frequency: 1, lastUsedAt: 0, inContacts: true },
      displayName: 'Bob Smith',
      email: 'bob@x.com',
    };

    it('default mode = to + html span z data-email', () => {
      const ins = buildMentionInsertion(match);
      expect(ins.mode).toBe('to');
      expect(ins.html).toContain('class="actuna-mention"');
      expect(ins.html).toContain('data-email="bob@x.com"');
      expect(ins.html).toContain('@Bob Smith');
      expect(ins.plainText).toBe('@Bob Smith');
      expect(ins.emailToAdd).toBe('bob@x.com');
    });

    it('cc mode', () => {
      const ins = buildMentionInsertion(match, 'cc');
      expect(ins.mode).toBe('cc');
      expect(ins.emailToAdd).toBe('bob@x.com');
    });

    it('inline_only mode → bez emailToAdd', () => {
      const ins = buildMentionInsertion(match, 'inline_only');
      expect(ins.emailToAdd).toBeUndefined();
    });

    it('HTML escape w displayName', () => {
      const m = { ...match, displayName: 'Bob <script>' };
      const ins = buildMentionInsertion(m);
      expect(ins.html).toContain('@Bob &lt;script&gt;');
      expect(ins.html).not.toContain('<script>');
    });
  });

  describe('renderMentionFallback', () => {
    it('zwraca bold span (HTML-strip safe)', () => {
      expect(renderMentionFallback('Bob Smith')).toBe('<strong>@Bob Smith</strong>');
    });

    it('escape HTML', () => {
      expect(renderMentionFallback('Bob <evil>')).toContain('&lt;evil&gt;');
    });
  });

  describe('extractEmailFromMention', () => {
    it('extract z prawidłowego span', () => {
      expect(extractEmailFromMention('<span data-email="bob@x.com">@Bob</span>'))
        .toBe('bob@x.com');
    });

    it('null gdy brak data-email', () => {
      expect(extractEmailFromMention('<span>@Bob</span>')).toBeNull();
    });

    it('un-escapes &quot; w wartości', () => {
      expect(extractEmailFromMention('<span data-email="bob&amp;cc@x.com">@Bob</span>'))
        .toBe('bob&cc@x.com');
    });
  });
});
