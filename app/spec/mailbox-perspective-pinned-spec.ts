/**
 * Pin cross-device (decyzja plan_to_version_1.0/46) — perspektywa "Pinned".
 *
 * Sidebar "Pinned" musi odpytywać zsynchronizowany `Thread.pinned` (keyword IMAP
 * `$Pinned`), nie lokalny cache — żeby na urządzeniu B pokazał wątki przypięte
 * gdzie indziej. Kalka MailboxPerspective.forStarred / StarredMailboxPerspective.
 *
 * TDD RED: failuje dopóki nie dodamy forPinned + PinnedMailboxPerspective.
 */
import { MailboxPerspective } from 'actunamail-exports';

describe('MailboxPerspective.forPinned (decyzja #46)', () => {
  it('exposes a static forPinned()', () => {
    expect(typeof (MailboxPerspective as any).forPinned).toBe('function');
  });

  it('returns a PinnedMailboxPerspective with pinned=true', () => {
    const p: any = (MailboxPerspective as any).forPinned(['acct-1']);
    expect(p).toBeDefined();
    expect(p.constructor.name).toBe('PinnedMailboxPerspective');
    expect(p.pinned).toBe(true);
    expect(typeof p.name).toBe('string');
  });

  it('threads() builds a query subscription without throwing', () => {
    const p: any = (MailboxPerspective as any).forPinned(['acct-1']);
    let sub: any;
    expect(() => {
      sub = p.threads();
    }).not.toThrow();
    expect(sub).toBeDefined();
    expect(typeof sub.query).toBe('function');
  });
});

describe('MailboxPerspective.forFocused (Focused = pinned ∪ starred ∪ rules/AI)', () => {
  const { FocusedStore } = require('../internal_packages/priority-inbox-pin/lib/focused-store');

  afterEach(() => FocusedStore._reset());

  it('returns a FocusedMailboxPerspective (not a pure pin view)', () => {
    const p: any = (MailboxPerspective as any).forFocused(['acct-1']);
    expect(p.constructor.name).toBe('FocusedMailboxPerspective');
    expect(p.pinned).toBe(false);
  });

  it('threads() query references both pinned and starred (auto-important signals)', () => {
    const p: any = (MailboxPerspective as any).forFocused(['acct-1']);
    const sql = (p.threads()._query.sql() || '').toLowerCase();
    expect(sql).toContain('pinned');
    expect(sql).toContain('starred');
  });

  it('includes FocusedStore.extraIds (business rules / AI providers) in the query', () => {
    FocusedStore.report('focus-rule-1', true);
    FocusedStore.registerProvider(() => ['ai-thread-1']);
    const p: any = (MailboxPerspective as any).forFocused(['acct-1']);
    const sql = p.threads()._query.sql() || '';
    expect(sql).toContain('focus-rule-1');
    expect(sql).toContain('ai-thread-1');
  });
});
