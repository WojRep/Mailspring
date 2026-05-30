/**
 * Bilet MVP #94 — Sender Approval unit tests.
 */

import { SenderApprovalStore } from '../internal_packages/sender-approval/lib/sender-approval-store';

describe('Sender Approval — bilet MVP #94', () => {

  beforeEach(() => {
    SenderApprovalStore._reset();
  });

  describe('SenderApprovalStore', () => {
    it('isUnknown returns true for never-seen email', () => {
      expect(SenderApprovalStore.isUnknown('new@example.com')).toBe(true);
    });

    it('addToQuarantine moves email to quarantine', () => {
      SenderApprovalStore.addToQuarantine({ email: 'spam@example.com', lastSubject: 'Hello' });
      expect(SenderApprovalStore.isInQuarantine('spam@example.com')).toBe(true);
      expect(SenderApprovalStore.isUnknown('spam@example.com')).toBe(false);
    });

    it('addToQuarantine increments mailCount on re-entry', () => {
      SenderApprovalStore.addToQuarantine({ email: 'spam@example.com' });
      SenderApprovalStore.addToQuarantine({ email: 'spam@example.com' });
      SenderApprovalStore.addToQuarantine({ email: 'spam@example.com' });
      const list = SenderApprovalStore.listQuarantine();
      expect(list[0].mailCount).toBe(3);
    });

    it('addToQuarantine normalizes email (lowercase + trim)', () => {
      SenderApprovalStore.addToQuarantine({ email: '  SPAM@Example.COM  ' });
      expect(SenderApprovalStore.isInQuarantine('spam@example.com')).toBe(true);
    });

    it('addToQuarantine skips if known or blocked', () => {
      SenderApprovalStore.acceptSender('known@example.com');
      SenderApprovalStore.blockSender('blocked@example.com');
      SenderApprovalStore.addToQuarantine({ email: 'known@example.com' });
      SenderApprovalStore.addToQuarantine({ email: 'blocked@example.com' });
      expect(SenderApprovalStore.listQuarantine().length).toBe(0);
    });

    it('acceptSender moves quarantine → known', () => {
      SenderApprovalStore.addToQuarantine({ email: 'guest@example.com' });
      expect(SenderApprovalStore.acceptSender('guest@example.com')).toBe(true);
      expect(SenderApprovalStore.isKnown('guest@example.com')).toBe(true);
      expect(SenderApprovalStore.isInQuarantine('guest@example.com')).toBe(false);
    });

    it('blockSender moves quarantine → blocklist', () => {
      SenderApprovalStore.addToQuarantine({ email: 'bad@example.com' });
      expect(SenderApprovalStore.blockSender('bad@example.com')).toBe(true);
      expect(SenderApprovalStore.isBlocked('bad@example.com')).toBe(true);
      expect(SenderApprovalStore.isInQuarantine('bad@example.com')).toBe(false);
    });

    it('blockSender removes from known if previously known', () => {
      SenderApprovalStore.acceptSender('flip@example.com');
      SenderApprovalStore.blockSender('flip@example.com');
      expect(SenderApprovalStore.isKnown('flip@example.com')).toBe(false);
      expect(SenderApprovalStore.isBlocked('flip@example.com')).toBe(true);
    });

    it('acceptSender after block removes from block', () => {
      SenderApprovalStore.blockSender('flop@example.com');
      SenderApprovalStore.acceptSender('flop@example.com');
      expect(SenderApprovalStore.isBlocked('flop@example.com')).toBe(false);
      expect(SenderApprovalStore.isKnown('flop@example.com')).toBe(true);
    });

    it('acceptDomain bulk accepts all from quarantine matching domain', () => {
      SenderApprovalStore.addToQuarantine({ email: 'a@example.com' });
      SenderApprovalStore.addToQuarantine({ email: 'b@example.com' });
      SenderApprovalStore.addToQuarantine({ email: 'c@other.com' });
      const count = SenderApprovalStore.acceptDomain('example.com');
      expect(count).toBe(2);
      expect(SenderApprovalStore.isKnown('a@example.com')).toBe(true);
      expect(SenderApprovalStore.isKnown('b@example.com')).toBe(true);
      expect(SenderApprovalStore.isInQuarantine('c@other.com')).toBe(true);
    });

    it('acceptDomain accepts "@example.com" with at-sign prefix', () => {
      SenderApprovalStore.addToQuarantine({ email: 'a@example.com' });
      const count = SenderApprovalStore.acceptDomain('@example.com');
      expect(count).toBe(1);
    });

    it('blockDomain bulk blocks all from quarantine matching domain', () => {
      SenderApprovalStore.addToQuarantine({ email: 'a@spam.tk' });
      SenderApprovalStore.addToQuarantine({ email: 'b@spam.tk' });
      const count = SenderApprovalStore.blockDomain('spam.tk');
      expect(count).toBe(2);
      expect(SenderApprovalStore.isBlocked('a@spam.tk')).toBe(true);
    });

    it('removeFromQuarantine defers decision (NOT accept/block)', () => {
      SenderApprovalStore.addToQuarantine({ email: 'defer@example.com' });
      expect(SenderApprovalStore.removeFromQuarantine('defer@example.com')).toBe(true);
      expect(SenderApprovalStore.isInQuarantine('defer@example.com')).toBe(false);
      expect(SenderApprovalStore.isKnown('defer@example.com')).toBe(false);
      expect(SenderApprovalStore.isBlocked('defer@example.com')).toBe(false);
      expect(SenderApprovalStore.isUnknown('defer@example.com')).toBe(true);
    });

    it('listQuarantine sorted by lastReceivedAt desc', () => {
      const t0 = Date.now() - 5000;
      const t1 = Date.now() - 1000;
      SenderApprovalStore.addToQuarantine({ email: 'a@x.com', lastReceivedAt: t0 });
      SenderApprovalStore.addToQuarantine({ email: 'b@x.com', lastReceivedAt: t1 });
      const list = SenderApprovalStore.listQuarantine();
      expect(list[0].email).toBe('b@x.com');
      expect(list[1].email).toBe('a@x.com');
    });

    it('stats returns correct counts', () => {
      SenderApprovalStore.acceptSender('known1@x.com');
      SenderApprovalStore.acceptSender('known2@x.com');
      SenderApprovalStore.blockSender('block1@x.com');
      SenderApprovalStore.addToQuarantine({ email: 'q1@x.com' });
      SenderApprovalStore.addToQuarantine({ email: 'q2@x.com' });
      SenderApprovalStore.addToQuarantine({ email: 'q3@x.com' });
      const s = SenderApprovalStore.stats();
      expect(s.known).toBe(2);
      expect(s.blocked).toBe(1);
      expect(s.quarantine).toBe(3);
    });

    it('persists to localStorage', () => {
      SenderApprovalStore.acceptSender('persist@x.com');
      const raw = localStorage.getItem('actuna.sender-approval.known');
      expect(raw).toContain('persist@x.com');
    });

    it('listen notifies on changes', () => {
      let count = 0;
      const unsub = SenderApprovalStore.listen(() => count++);
      SenderApprovalStore.addToQuarantine({ email: 'a@x.com' });
      SenderApprovalStore.acceptSender('a@x.com');
      expect((count) >= (2)).toBe(true);
      unsub();
    });

    it('ignores empty email', () => {
      SenderApprovalStore.addToQuarantine({ email: '' });
      expect(SenderApprovalStore.stats().quarantine).toBe(0);
      expect(SenderApprovalStore.acceptSender('')).toBe(false);
      expect(SenderApprovalStore.blockSender('')).toBe(false);
    });
  });
});
