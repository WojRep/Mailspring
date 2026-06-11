/**
 * Bilet #117 — TagStore × sync: delegacja do adaptera + inbound reconcile
 * + jednorazowa migracja lokalnych przypisań (wzorzec MIGRATED_KEY z PinStore).
 *
 * localStorage zostaje natychmiastowym cache UI; źródłem prawdy między
 * urządzeniami są keywordy/etykiety na serwerze konta.
 *
 * Tagi `__system_*` (priority/other override, time-intent) NIE są syncowane —
 * to lokalne nakładki behawioralne (rollover o północy churnowałby serwer).
 *
 * TDD RED: failuje dopóki TagStore nie dyspozycjonuje tasków + nie przyjmuje delt.
 */
import { TagStore } from '../internal_packages/tag-system/lib/tag-store';
import { _resetAdapters } from '../internal_packages/tag-system/lib/sync-adapters/tag-sync-adapters';
import { DatabaseStore, Thread, Actions, AccountStore } from 'actunamail-exports';

const MIGRATED_KEY = 'actuna.tags.migrated-v117';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function stubAccount(provider = 'imap') {
  spyOn(AccountStore, 'accountForId').andReturn({ id: 'acct-1', provider } as any);
}

describe('TagStore — cross-device dispatch przez adapter (bilet #117)', () => {
  beforeEach(() => {
    TagStore._reset();
    _resetAdapters();
    try { localStorage.removeItem(MIGRATED_KEY); } catch (e) { /* node */ }
    TagStore.init();
    TagStore.register({ id: 'q1', name: 'Q1 Pilne+Ważne', color: '#f00', source: 'user' });
    TagStore.register({ id: '__system_today', name: 'Today', color: '#00f', source: 'system', systemManaged: true });
  });

  it('apply() kolejkuje ChangeKeywordsTask na koncie keyword-IMAP', async () => {
    stubAccount('imap');
    spyOn(DatabaseStore, 'find').andReturn(
      Promise.resolve(new Thread({ id: 't1', accountId: 'acct-1' } as any)) as any
    );
    spyOn(Actions, 'queueTask');

    TagStore.apply('t1', 'q1');
    await flush();

    expect(Actions.queueTask).toHaveBeenCalled();
    const task = (Actions.queueTask as any).mostRecentCall.args[0];
    expect(task.constructor.name).toBe('ChangeKeywordsTask');
    expect(task.keywordsToAdd).toEqual(['Q1_Pilne_Wazne']);
  });

  it('remove() kolejkuje ChangeKeywordsTask z keywordsToRemove', async () => {
    stubAccount('imap');
    TagStore.apply('t1', 'q1');
    spyOn(DatabaseStore, 'find').andReturn(
      Promise.resolve(new Thread({ id: 't1', accountId: 'acct-1' } as any)) as any
    );
    spyOn(Actions, 'queueTask');

    TagStore.remove('t1', 'q1');
    await flush();

    const task = (Actions.queueTask as any).mostRecentCall.args[0];
    expect(task.keywordsToRemove).toEqual(['Q1_Pilne_Wazne']);
  });

  it('tagi __system_* NIE dyspozycjonują syncu', async () => {
    stubAccount('imap');
    spyOn(DatabaseStore, 'find').andReturn(
      Promise.resolve(new Thread({ id: 't1', accountId: 'acct-1' } as any)) as any
    );
    spyOn(Actions, 'queueTask');

    TagStore.apply('t1', '__system_today');
    await flush();

    expect(Actions.queueTask).not.toHaveBeenCalled();
  });

  it('lokalny cache aktualizuje się natychmiast (instant UI), niezależnie od syncu', () => {
    stubAccount('imap');
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(null) as any);
    TagStore.apply('t1', 'q1');
    expect(TagStore.hasTag('t1', 'q1')).toBe(true);
  });
});

describe('TagStore.syncFromThread — inbound reconcile z delt (bilet #117)', () => {
  beforeEach(() => {
    TagStore._reset();
    _resetAdapters();
    try { localStorage.removeItem(MIGRATED_KEY); } catch (e) { /* node */ }
    TagStore.init();
    TagStore.register({ id: 'q1', name: 'Q1 Pilne+Ważne', color: '#f00', source: 'user' });
  });

  it('keyword znanego tagu → przypisanie dodane', () => {
    stubAccount('imap');
    TagStore.syncFromThread({ id: 't1', accountId: 'acct-1', customKeywords: ['Q1_Pilne_Wazne'] } as any);
    expect(TagStore.hasTag('t1', 'q1')).toBe(true);
  });

  it('nieznany keyword → auto-rejestracja tagu (source imap) + przypisanie', () => {
    stubAccount('imap');
    TagStore.syncFromThread({ id: 't1', accountId: 'acct-1', customKeywords: ['ProjektX'] } as any);
    const tag = TagStore.list().find(t => t.name === 'ProjektX');
    expect(tag).toBeDefined();
    expect(tag!.source).toBe('imap');
    expect(TagStore.hasTag('t1', tag!.id)).toBe(true);
  });

  it('keyword Thunderbirda $label1 → tag o nazwie Important', () => {
    stubAccount('imap');
    TagStore.syncFromThread({ id: 't1', accountId: 'acct-1', customKeywords: ['$label1'] } as any);
    const tag = TagStore.list().find(t => t.name === 'Important');
    expect(tag).toBeDefined();
    expect(TagStore.hasTag('t1', tag!.id)).toBe(true);
  });

  it('zniknięcie keywordu na serwerze → przypisanie usunięte (konto keyword)', () => {
    stubAccount('imap');
    TagStore.syncFromThread({ id: 't1', accountId: 'acct-1', customKeywords: ['Q1_Pilne_Wazne'] } as any);
    expect(TagStore.hasTag('t1', 'q1')).toBe(true);
    TagStore.syncFromThread({ id: 't1', accountId: 'acct-1', customKeywords: [] } as any);
    expect(TagStore.hasTag('t1', 'q1')).toBe(false);
  });

  it('NIE wycina lokalnych przypisań na koncie local (capability=false)', () => {
    const adapters = require('../internal_packages/tag-system/lib/sync-adapters/tag-sync-adapters');
    adapters.setKeywordCapability('acct-1', false);
    stubAccount('imap');
    TagStore.apply('t1', 'q1');
    TagStore.syncFromThread({ id: 't1', accountId: 'acct-1', customKeywords: [] } as any);
    expect(TagStore.hasTag('t1', 'q1')).toBe(true);
  });

  it('pin keyword $Pinned jest ignorowany (osobny mechanizm #93)', () => {
    stubAccount('imap');
    TagStore.syncFromThread({ id: 't1', accountId: 'acct-1', customKeywords: ['$Pinned'] } as any);
    expect(TagStore.list().find(t => t.name === '$Pinned')).toBeUndefined();
  });
});

describe('TagStore — jednorazowa migracja lokalnych przypisań (bilet #117)', () => {
  const STORAGE_ASSIGNMENTS = 'actuna.tags.assignments';
  const STORAGE_REGISTRY = 'actuna.tags.registry';

  beforeEach(() => {
    TagStore._reset();
    _resetAdapters();
    try { localStorage.removeItem(MIGRATED_KEY); } catch (e) { /* node */ }
  });

  it('pcha istniejące lokalne przypisania na serwer przy pierwszym init, potem guard', async () => {
    localStorage.setItem(STORAGE_REGISTRY, JSON.stringify([
      { id: 'q1', name: 'Q1', color: '#f00', source: 'user', createdAt: 1 },
    ]));
    localStorage.setItem(STORAGE_ASSIGNMENTS, JSON.stringify([['old-1', ['q1']], ['old-2', ['q1']]]));
    stubAccount('imap');
    spyOn(DatabaseStore, 'find').andReturn(
      Promise.resolve(new Thread({ id: 'resolved', accountId: 'acct-1' } as any)) as any
    );
    spyOn(Actions, 'queueTask');

    TagStore.init();
    await flush();

    expect((Actions.queueTask as any).callCount).toBe(2);
    expect(localStorage.getItem(MIGRATED_KEY)).toBeTruthy();
  });

  it('nie migruje ponownie gdy guard ustawiony', async () => {
    localStorage.setItem(STORAGE_REGISTRY, JSON.stringify([
      { id: 'q1', name: 'Q1', color: '#f00', source: 'user', createdAt: 1 },
    ]));
    localStorage.setItem(STORAGE_ASSIGNMENTS, JSON.stringify([['old-1', ['q1']]]));
    localStorage.setItem(MIGRATED_KEY, '1');
    stubAccount('imap');
    spyOn(DatabaseStore, 'find').andReturn(
      Promise.resolve(new Thread({ id: 'x', accountId: 'acct-1' } as any)) as any
    );
    spyOn(Actions, 'queueTask');

    TagStore.init();
    await flush();

    expect((Actions.queueTask as any).callCount).toBe(0);
  });
});
