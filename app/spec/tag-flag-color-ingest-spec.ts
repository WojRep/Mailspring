/**
 * RED tests (TDD) — ingest kolorowych flag Apple do TagStore.
 *
 * Apple koduje kolor flagi przez $MailFlagBit0/1/2 (+ \Flagged = starred).
 * Zamiast 3 surowych tagów bitowych: jeden syntetyczny tag koloru `flag_<value>`
 * z właściwym kolorem (filtr rozróżnia kolory). Surowe bity + gołe NotJunk
 * idą do IGNORED (nie tworzą tagów). Migracja czyści wcześniej zaciągnięte.
 */

import { TagStore } from '../internal_packages/tag-system/lib/tag-store';

describe('TagStore — ingest koloru flagi (syncFlagColorFromThread)', () => {
  beforeEach(() => {
    TagStore._reset();
    TagStore.init();
  });
  afterEach(() => TagStore._reset());

  it('Bit2 + starred → tag flag_4 (blue) z tokenem koloru i source "flag"', () => {
    TagStore.syncFlagColorFromThread({
      id: 't1',
      customKeywords: ['$MailFlagBit2'],
      starred: true,
    });
    expect(TagStore.hasTag('t1', 'flag_4')).toBe(true);
    const tag = TagStore.get('flag_4');
    expect(tag).toBeDefined();
    expect(tag!.color).toBe('var(--flag-blue)');
    expect(tag!.source).toBe('flag');
    expect(TagStore.threadIdsWithTag('flag_4')).toContain('t1');
  });

  it('starred bez bitów → flag_0 (gwiazdka = czerwona flaga, 1:1 Apple)', () => {
    TagStore.syncFlagColorFromThread({ id: 't2', customKeywords: [], starred: true });
    expect(TagStore.hasTag('t2', 'flag_0')).toBe(true);
    expect(TagStore.get('flag_0')!.color).toBe('var(--flag-red)');
  });

  it('reconcile: zmiana koloru na czerwoną (gwiazdka) → flag_0', () => {
    TagStore.syncFlagColorFromThread({
      id: 't3',
      customKeywords: ['$MailFlagBit2'],
      starred: true,
    });
    expect(TagStore.hasTag('t3', 'flag_4')).toBe(true);
    // teraz brak bitów = czerwona (gwiazdka)
    TagStore.syncFlagColorFromThread({ id: 't3', customKeywords: [], starred: true });
    expect(TagStore.hasTag('t3', 'flag_4')).toBe(false);
    expect(TagStore.hasTag('t3', 'flag_0')).toBe(true);
  });

  it('zdjęcie flagi (nie starred, brak bitów) → brak tagu flagi', () => {
    TagStore.syncFlagColorFromThread({
      id: 't4',
      customKeywords: ['$MailFlagBit0'],
      starred: true,
    });
    expect(TagStore.getTagIds('t4').some((id) => id.startsWith('flag_'))).toBe(true);
    TagStore.syncFlagColorFromThread({ id: 't4', customKeywords: [], starred: false });
    expect(TagStore.getTagIds('t4').some((id) => id.startsWith('flag_'))).toBe(false);
  });

  it('batch: emit dopiero na endBatch (jeden flush zamiast per-wątek) — perf', () => {
    let emits = 0;
    const off = TagStore.listen(() => {
      emits++;
    });
    TagStore.beginBatch();
    TagStore.syncFlagColorFromThread({ id: 'a', customKeywords: ['$MailFlagBit0'], starred: true });
    TagStore.syncFlagColorFromThread({ id: 'b', customKeywords: ['$MailFlagBit2'], starred: true });
    expect(emits).toBe(0); // nic w trakcie batcha
    TagStore.endBatch();
    expect(emits).toBe(1); // jeden flush na końcu
    expect(TagStore.hasTag('a', 'flag_1')).toBe(true);
    expect(TagStore.hasTag('b', 'flag_4')).toBe(true);
    off();
  });
});

describe('TagStore — migracja: usuń surowe tagi $MailFlagBit*/NotJunk', () => {
  beforeEach(() => {
    TagStore._reset();
    TagStore.init();
  });
  afterEach(() => TagStore._reset());

  it('purgeIgnoredKeywordTags usuwa TYLKO surowe $MailFlagBit* (NotJunk i user tag zostają)', () => {
    // Symuluj stan sprzed poprawki: surowe tagi z source imap.
    TagStore.register({
      id: 'imap_MailFlagBit0',
      name: '$MailFlagBit0',
      color: '#fff',
      source: 'imap',
    });
    TagStore.register({
      id: 'imap_MailFlagBit1',
      name: '$MailFlagBit1',
      color: '#fff',
      source: 'imap',
    });
    TagStore.register({ id: 'imap_NotJunk', name: 'NotJunk', color: '#fff', source: 'imap' });
    TagStore.register({ id: 'utag-keep', name: 'Prawdziwy', color: '#fff', source: 'user' });
    TagStore.apply('tX', 'imap_MailFlagBit0');

    const removed = TagStore.purgeIgnoredKeywordTags();
    expect(removed).toBe(2);
    expect(TagStore.get('imap_MailFlagBit0')).toBeUndefined();
    expect(TagStore.get('imap_MailFlagBit1')).toBeUndefined();
    expect(TagStore.hasTag('tX', 'imap_MailFlagBit0')).toBe(false);
    // NotJunk mógłby być legalnym keywordem — NIE kasujemy (bezpieczeństwo)
    expect(TagStore.get('imap_NotJunk')).toBeDefined();
    // prawdziwy user tag zostaje
    expect(TagStore.get('utag-keep')).toBeDefined();
  });

  it('init() automatycznie czyści surowe tagi bitowe (po restarcie z localStorage)', () => {
    // Symuluj stan zapisany w poprzedniej wersji (przed poprawką).
    TagStore._reset();
    localStorage.setItem(
      'actuna.tags.registry',
      JSON.stringify([
        {
          id: 'imap_MailFlagBit2',
          name: '$MailFlagBit2',
          color: '#fff',
          source: 'imap',
          createdAt: 1,
        },
        { id: 'utag-keep', name: 'Real', color: '#fff', source: 'user', createdAt: 1 },
      ])
    );
    TagStore.init(); // _load (czyta seed) + purge
    expect(TagStore.get('imap_MailFlagBit2')).toBeUndefined();
    expect(TagStore.get('utag-keep')).toBeDefined();
  });
});
