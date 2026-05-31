/**
 * FocusedStore — Focused = przypięte ∪ reguły biznesowe ∪ AI (decyzja #46 + user
 * 2026-05-31: "Focused ma wykrywać dodatkowo ważne emaile, używa reguł biznesowych
 * oraz AI do automatycznego wybierania najważniejszych emaili w INBOX").
 *
 * FocusedStore zbiera dodatkowe (poza pinned/starred, które idą zapytaniem DB)
 * thread-id uznane za ważne:
 *   - report(): wynik deterministycznego klasyfikatora (reguły biznesowe),
 *   - registerProvider(): hook dla OPT-IN pluginu AI (compliance — AI osobno).
 *
 * TDD RED: failuje dopóki nie powstanie focused-store.
 */
import { FocusedStore } from '../internal_packages/priority-inbox-pin/lib/focused-store';

describe('FocusedStore (Focused = rules ∪ AI)', () => {
  beforeEach(() => FocusedStore._reset());
  afterEach(() => FocusedStore._reset());

  it('report() adds and removes focused thread ids (business rules)', () => {
    FocusedStore.report('t1', true);
    expect(FocusedStore.extraIds()).toContain('t1');
    FocusedStore.report('t1', false);
    expect(FocusedStore.extraIds()).not.toContain('t1');
  });

  it('registerProvider() contributes ids (AI opt-in hook) and disposes', () => {
    const dispose = FocusedStore.registerProvider(() => ['ai-1', 'ai-2']);
    expect(FocusedStore.extraIds().slice().sort()).toEqual(['ai-1', 'ai-2']);
    dispose();
    expect(FocusedStore.extraIds()).toEqual([]);
  });

  it('extraIds() is the deduped union of reports + providers', () => {
    FocusedStore.report('x', true);
    FocusedStore.registerProvider(() => ['x', 'y']);
    expect(FocusedStore.extraIds().slice().sort()).toEqual(['x', 'y']);
  });

  it('notifies listeners on change', () => {
    let hits = 0;
    const un = FocusedStore.listen(() => {
      hits += 1;
    });
    FocusedStore.report('z', true);
    expect(hits).toBeGreaterThan(0);
    un();
  });
});
