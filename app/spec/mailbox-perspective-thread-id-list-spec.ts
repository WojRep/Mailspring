/*
 * Specs for ThreadIdListPerspective — the virtual folder backing
 * AI-selected thread sets (Actuna AI). Ticket #63.
 */
import { MailboxPerspective } from '../src/mailbox-perspective';

describe('ThreadIdListPerspective', () => {
  it('constructs with an empty list without throwing', () => {
    expect(() => MailboxPerspective.forThreadIds([], ['acc-1'])).not.toThrow();
  });

  it('stores the given display name', () => {
    const p = MailboxPerspective.forThreadIds(['t1'], ['acc-1'], 'Triage AI');
    expect(p.name).toBe('Triage AI');
  });

  it('isEqual — true for the same ids, false for a different set', () => {
    const a = MailboxPerspective.forThreadIds(['t1', 't2'], ['acc-1'], 'X');
    const b = MailboxPerspective.forThreadIds(['t1', 't2'], ['acc-1'], 'X');
    const c = MailboxPerspective.forThreadIds(['t1', 't3'], ['acc-1'], 'X');
    expect(a.isEqual(b)).toBe(true);
    expect(a.isEqual(c)).toBe(false);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const p = MailboxPerspective.forThreadIds(['t1', 't2'], ['acc-1'], 'X');
    const restored = MailboxPerspective.fromJSON(p.toJSON() as any);
    expect(restored).not.toBeNull();
    expect(p.isEqual(restored)).toBe(true);
  });

  it('threads() returns a subscription for a non-empty list', () => {
    const p = MailboxPerspective.forThreadIds(['t1'], ['acc-1']);
    expect(p.threads()).toBeDefined();
  });

  it('threads() does not throw for an empty list', () => {
    const p = MailboxPerspective.forThreadIds([], ['acc-1']);
    expect(() => p.threads()).not.toThrow();
  });

  it('is a pure view — does not accept dropped threads', () => {
    const p = MailboxPerspective.forThreadIds(['t1'], ['acc-1']);
    expect(p.canReceiveThreadsFromAccountIds()).toBe(false);
  });

  // #124 — KOREKTA KIERUNKU po QA usera (verbatim 2026-06-12): „Proponuje
  // roziwązanie, że pokazuje wszystkie wrac z informacją w jakim folderze
  // wystepuje." Widoki na listach id (tagi #119, ćwiartki #120, Snoozed, AI)
  // pokazują WSZYSTKIE wątki z listy — także te w Koszu/Spamie — a informacja
  // o folderze jest renderowana przy wierszu (MailLabelSet, widoki wirtualne).
  // Dzięki temu licznik (np. tag „NotJunk 4") zgadza się z długością listy.
  it('threads() query shows ALL listed threads incl. trashed (no inAllMail filter, #124)', () => {
    const p: any = MailboxPerspective.forThreadIds(['t1', 't2'], ['acc-1']);
    const sql = (p.threads()._query.sql() || '').toLowerCase();
    expect(sql).not.toContain('inallmail');
    expect(sql).toContain("in ('t1','t2')");
  });
});
