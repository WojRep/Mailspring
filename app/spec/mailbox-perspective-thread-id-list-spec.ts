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

  // #124: widoki na listach id (tagi #119, ćwiartki priorytetów #120, Snoozed,
  // listy AI) muszą wykluczać wątki przeniesione w całości do Kosza/Spamu —
  // inaczej „Usuń" zostawia wątek na liście (id wciąż spełnia kryterium widoku).
  // Zgłoszenie usera 2026-06-12: „Po wybraniu usuniecia wiaodmości, wiadomość
  // cały czas jest widoczna na liście" + „Pozycja Tags, Priority, wszyekie tam
  // gdzie filtrujemy"; „z widoku normalnej skrzynki prawidłowo usuwa".
  it('threads() query excludes threads moved entirely to Trash/Spam (inAllMail filter, #124)', () => {
    const p: any = MailboxPerspective.forThreadIds(['t1', 't2'], ['acc-1']);
    const sql = (p.threads()._query.sql() || '').toLowerCase();
    expect(sql).toContain('inallmail');
  });
});
