/**
 * Bilet #117 — wiring delt: activate() tag-systemu MUSI podpiąć
 * DatabaseStore.listen tak, by delta Thread z customKeywords trafiała do
 * TagStore.syncFromThread (auto-rejestracja + przypisanie).
 *
 * RED napisany po realnym e2e (tags-sync-real): sonda widziała deltę
 * z keywordem, ale registry tag-systemu pozostawało puste — rejestracja
 * listenera padała CICHO (try/catch bez śladu). Ten spec pilnuje happy-path
 * wiringu na poziomie jednostkowym; fix usuwa ciche połykanie błędu
 * (status/error eksponowane na AppEnv.tagSystem).
 */
import { activate, deactivate } from '../internal_packages/tag-system/lib/main';
import { TagStore } from '../internal_packages/tag-system/lib/tag-store';
import { _resetAdapters } from '../internal_packages/tag-system/lib/sync-adapters/tag-sync-adapters';
import { DatabaseStore, AccountStore, Thread } from 'actunamail-exports';

const {
  DatabaseChangeRecord,
} = require('../src/flux/stores/database-change-record');

describe('tag-system activate() — wiring delt Thread → syncFromThread (bilet #117)', () => {
  beforeEach(() => {
    TagStore._reset();
    _resetAdapters();
    TagStore.init();
    spyOn(AccountStore, 'accountForId').andReturn({ id: 'acct-1', provider: 'imap' } as any);
  });

  afterEach(() => {
    try { deactivate(); } catch (e) { /* idempotent */ }
    TagStore._reset();
  });

  it('delta Thread z customKeywords → auto-rejestracja tagu + przypisanie', () => {
    activate();

    const thread = new Thread({
      id: 't-delta-1',
      accountId: 'acct-1',
      customKeywords: ['ProjektX'],
    } as any);
    DatabaseStore.trigger(
      new DatabaseChangeRecord({
        type: 'persist',
        objectClass: 'Thread',
        objects: [thread],
        objectsRawJSON: [],
      })
    );

    const tag = TagStore.list().find(t => t.name === 'ProjektX');
    expect(tag).toBeDefined();
    expect(TagStore.hasTag('t-delta-1', tag!.id)).toBe(true);
  });

  it('wiring eksponuje status (deltaWiring) zamiast cichej porażki', () => {
    activate();
    const api = (window as any).AppEnv && (window as any).AppEnv.tagSystem;
    expect(api).toBeDefined();
    expect(api.deltaWiring).toBe('ok');
  });

  it('activate() robi początkowy sweep reconcile z DB (delty sprzed aktywacji są ulotne)', async () => {
    // Lekcja z realnego e2e (2026-06-11): wątek z keywordem zsyncował się,
    // ZANIM pakiet się aktywował — delta przepadła, listener jej nie widział.
    // Sweep przy aktywacji czyta trwały stan z DB i domyka lukę bootu.
    const swept = new Thread({
      id: 't-sweep-1',
      accountId: 'acct-1',
      customKeywords: ['SweepKw'],
    } as any);
    spyOn(DatabaseStore, 'findAll').andReturn({
      limit: () => Promise.resolve([swept]),
      then: (cb: any) => Promise.resolve([swept]).then(cb),
    } as any);

    activate();
    await Promise.resolve();
    await Promise.resolve();

    const tag = TagStore.list().find(t => t.name === 'SweepKw');
    expect(tag).toBeDefined();
    expect(TagStore.hasTag('t-sweep-1', tag!.id)).toBe(true);
  });

  it('deactivate() odpina listener (delta po deactivate nie przypisuje)', () => {
    activate();
    deactivate();
    const thread = new Thread({
      id: 't-delta-2',
      accountId: 'acct-1',
      customKeywords: ['PoDeactivate'],
    } as any);
    DatabaseStore.trigger(
      new DatabaseChangeRecord({
        type: 'persist',
        objectClass: 'Thread',
        objects: [thread],
        objectsRawJSON: [],
      })
    );
    expect(TagStore.list().find(t => t.name === 'PoDeactivate')).toBeUndefined();
  });
});
