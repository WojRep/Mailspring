/**
 * Bilet #117 — warstwa adapterów synchronizacji tagów per typ serwera.
 *
 * UI rozmawia tylko z TagStore; TagStore deleguje transport do adaptera
 * wybranego per konto:
 *   - provider gmail            → GmailLabelAdapter (etykiety `Tag/...`)
 *   - provider office365/outlook → ExchangeCategoryAdapter (keywordy IMAP,
 *     Exchange mapuje server-side na kategorie Outlooka)
 *   - pozostałe IMAP            → KeywordAdapter (keywordy, jak Thunderbird)
 *   - capability zgłoszona false → LocalAdapter (localStorage + banner)
 *
 * TDD RED: failuje dopóki nie powstanie tag-system/lib/sync-adapters/.
 */
import { Actions, Thread } from 'actunamail-exports';
import {
  adapterForAccount,
  keywordForTagName,
  setKeywordCapability,
  _resetAdapters,
} from '../internal_packages/tag-system/lib/sync-adapters/tag-sync-adapters';

const CategoryStore = require('../src/flux/stores/category-store').default;

function acct(provider: string, id = 'acct-1') {
  return { id, provider } as any;
}

describe('Tag sync adapters — detekcja per konto (bilet #117)', () => {
  beforeEach(() => {
    _resetAdapters();
  });

  it('provider gmail → gmail-label', () => {
    expect(adapterForAccount(acct('gmail')).kind).toBe('gmail-label');
  });

  it('provider office365 i outlook → exchange-category', () => {
    expect(adapterForAccount(acct('office365')).kind).toBe('exchange-category');
    expect(adapterForAccount(acct('outlook')).kind).toBe('exchange-category');
  });

  it('generyczny IMAP → imap-keyword (optymistycznie; C++ ma cichy fallback)', () => {
    expect(adapterForAccount(acct('imap')).kind).toBe('imap-keyword');
  });

  it('capability zgłoszona false → local (banner)', () => {
    setKeywordCapability('acct-1', false);
    expect(adapterForAccount(acct('imap')).kind).toBe('local');
  });

  it('detekcja jest per konto (multi-account)', () => {
    setKeywordCapability('acct-bad', false);
    expect(adapterForAccount(acct('imap', 'acct-bad')).kind).toBe('local');
    expect(adapterForAccount(acct('imap', 'acct-good')).kind).toBe('imap-keyword');
  });
});

describe('keywordForTagName — sanitizacja do atomu IMAP (bilet #117)', () => {
  it('transliteruje polskie diakrytyki i zamienia spacje na _', () => {
    expect(keywordForTagName('Q1 Pilne+Ważne')).toBe('Q1_Pilne_Wazne');
  });

  it('usuwa znaki niedozwolone w atomie IMAP', () => {
    expect(keywordForTagName('a(b)c{d}e%f*g"h\\i]j')).toBe('abcdefghij');
  });

  it('zachowuje litery, cyfry, _ , - i .', () => {
    expect(keywordForTagName('Proj-X.v2_final')).toBe('Proj-X.v2_final');
  });
});

describe('KeywordAdapter / ExchangeCategoryAdapter — transport keywordów', () => {
  beforeEach(() => {
    _resetAdapters();
  });

  it('applyTag kolejkuje ChangeKeywordsTask z sanitizowanym keywordem', () => {
    spyOn(Actions, 'queueTask');
    const thread = new Thread({ id: 't1', accountId: 'acct-1' } as any);
    adapterForAccount(acct('imap')).applyTag(thread, { id: 'q1', name: 'Q1 Pilne+Ważne' } as any);
    expect(Actions.queueTask).toHaveBeenCalled();
    const task = (Actions.queueTask as any).mostRecentCall.args[0];
    expect(task.constructor.name).toBe('ChangeKeywordsTask');
    expect(task.keywordsToAdd).toEqual(['Q1_Pilne_Wazne']);
    expect(task.keywordsToRemove).toEqual([]);
  });

  it('removeTag kolejkuje ChangeKeywordsTask z keywordsToRemove', () => {
    spyOn(Actions, 'queueTask');
    const thread = new Thread({ id: 't1', accountId: 'acct-1' } as any);
    adapterForAccount(acct('office365')).removeTag(thread, { id: 'q1', name: 'Q1' } as any);
    const task = (Actions.queueTask as any).mostRecentCall.args[0];
    expect(task.keywordsToAdd).toEqual([]);
    expect(task.keywordsToRemove).toEqual(['Q1']);
  });
});

describe('LocalAdapter — brak transportu', () => {
  beforeEach(() => {
    _resetAdapters();
  });

  it('applyTag/removeTag nie kolejkuje żadnego tasku', () => {
    spyOn(Actions, 'queueTask');
    setKeywordCapability('acct-1', false);
    const adapter = adapterForAccount(acct('imap'));
    const thread = new Thread({ id: 't1', accountId: 'acct-1' } as any);
    adapter.applyTag(thread, { id: 'q1', name: 'Q1' } as any);
    adapter.removeTag(thread, { id: 'q1', name: 'Q1' } as any);
    expect(Actions.queueTask).not.toHaveBeenCalled();
  });
});

describe('GmailLabelAdapter — etykiety z prefiksem Tag/', () => {
  beforeEach(() => {
    _resetAdapters();
  });

  it('applyTag kolejkuje ChangeLabelsTask gdy etykieta Tag/<name> istnieje', () => {
    const label = { id: 'lbl-1', displayName: 'Tag/Q1', name: undefined };
    spyOn(CategoryStore, 'categories').andReturn([label]);
    spyOn(Actions, 'queueTask');
    const thread = new Thread({ id: 't1', accountId: 'acct-1' } as any);
    adapterForAccount(acct('gmail')).applyTag(thread, { id: 'q1', name: 'Q1' } as any);
    expect(Actions.queueTask).toHaveBeenCalled();
    const task = (Actions.queueTask as any).mostRecentCall.args[0];
    expect(task.constructor.name).toBe('ChangeLabelsTask');
    expect(task.labelsToAdd.length).toBe(1);
    expect(task.labelsToAdd[0].displayName).toBe('Tag/Q1');
  });

  it('applyTag kolejkuje SyncbackCategoryTask (utworzenie etykiety) gdy brak Tag/<name>', () => {
    spyOn(CategoryStore, 'categories').andReturn([]);
    spyOn(Actions, 'queueTask');
    const thread = new Thread({ id: 't1', accountId: 'acct-1' } as any);
    adapterForAccount(acct('gmail')).applyTag(thread, { id: 'q1', name: 'Q1' } as any);
    expect(Actions.queueTask).toHaveBeenCalled();
    const task = (Actions.queueTask as any).mostRecentCall.args[0];
    expect(task.constructor.name).toBe('SyncbackCategoryTask');
  });
});
