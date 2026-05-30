/**
 * Bilet MVP #115 — Bulk Unsubscribe (List-Unsubscribe parser + SubscriptionStore) unit tests.
 */

import {
  parseListUnsubscribe,
  extractMailtoAddress,
} from '../internal_packages/bulk-unsubscribe/lib/list-unsubscribe-parser';
import {
  SubscriptionStore,
} from '../internal_packages/bulk-unsubscribe/lib/subscription-store';

describe('List-Unsubscribe parser — bilet MVP #115', () => {

  it('parsuje mailto-only header', () => {
    const r = parseListUnsubscribe('<mailto:unsub@example.com>');
    expect(r?.mailto).toBe('mailto:unsub@example.com');
    expect(r?.httpUrl).toBeUndefined();
    expect(r?.oneClick).toBe(false);
  });

  it('parsuje http-only header', () => {
    const r = parseListUnsubscribe('<https://example.com/unsub?id=abc>');
    expect(r?.httpUrl).toBe('https://example.com/unsub?id=abc');
    expect(r?.mailto).toBeUndefined();
  });

  it('parsuje obu URLs (RFC 2369 multi)', () => {
    const r = parseListUnsubscribe('<mailto:unsub@example.com>, <https://example.com/unsub?id=abc>');
    expect(r?.mailto).toBe('mailto:unsub@example.com');
    expect(r?.httpUrl).toBe('https://example.com/unsub?id=abc');
  });

  it('null gdy brak valid URL', () => {
    expect(parseListUnsubscribe('')).toBeNull();
    expect(parseListUnsubscribe(undefined)).toBeNull();
    expect(parseListUnsubscribe('no urls here')).toBeNull();
  });

  it('RFC 8058 one-click detection', () => {
    const r = parseListUnsubscribe(
      '<https://example.com/unsub>',
      'List-Unsubscribe=One-Click',
    );
    expect(r?.oneClick).toBe(true);
  });

  it('one-click false gdy header inny', () => {
    const r = parseListUnsubscribe('<https://example.com/u>', 'Other-Header=X');
    expect(r?.oneClick).toBe(false);
  });

  it('case-insensitive mailto', () => {
    const r = parseListUnsubscribe('<MAILTO:unsub@example.com>');
    expect(r?.mailto).toBeTruthy();
  });

  describe('extractMailtoAddress', () => {
    it('extract z mailto: prefix', () => {
      expect(extractMailtoAddress('mailto:unsub@example.com')).toBe('unsub@example.com');
    });

    it('extract z query', () => {
      expect(extractMailtoAddress('mailto:unsub@example.com?subject=unsub')).toBe('unsub@example.com');
    });

    it('case insensitive prefix', () => {
      expect(extractMailtoAddress('MAILTO:unsub@example.com')).toBe('unsub@example.com');
    });

    it('null gdy nie mailto', () => {
      expect(extractMailtoAddress('https://x.com')).toBeNull();
    });
  });
});

describe('Subscription Store — bilet MVP #115', () => {

  beforeEach(() => {
    SubscriptionStore._reset();
    SubscriptionStore.init();
  });

  describe('recordIncoming', () => {
    it('tworzy nową entry z receivedCount=1, status=pending', () => {
      const e = SubscriptionStore.recordIncoming({
        sender: 'newsletter@example.com',
        senderName: 'Example Newsletter',
        unsubscribeInfo: { mailto: 'mailto:unsub@example.com', oneClick: false },
      });
      expect(e.receivedCount).toBe(1);
      expect(e.status).toBe('pending');
      expect(e.lastReceivedAt).toBeGreaterThan(0);
    });

    it('drugi incoming inkrementuje count + updates lastReceivedAt', () => {
      SubscriptionStore.recordIncoming({ sender: 'a@x.com', receivedAt: 1000 });
      const e = SubscriptionStore.recordIncoming({ sender: 'a@x.com', receivedAt: 2000 });
      expect(e.receivedCount).toBe(2);
      expect(e.lastReceivedAt).toBe(2000);
    });

    it('sender case-insensitive normalize', () => {
      SubscriptionStore.recordIncoming({ sender: 'BOB@X.com' });
      expect(SubscriptionStore.get('bob@x.com')?.receivedCount).toBe(1);
    });

    it('wymaga sender', () => {
      { let _err; try { SubscriptionStore.recordIncoming({ sender: '' }); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/sender/); }
    });
  });

  describe('mark actions', () => {
    beforeEach(() => {
      SubscriptionStore.recordIncoming({
        sender: 'a@x.com',
        unsubscribeInfo: { httpUrl: 'https://x.com/u', oneClick: false },
      });
    });

    it('markSent ustawia status + unsubscribedAt', () => {
      const e = SubscriptionStore.markSent('a@x.com', { method: 'http' });
      expect(e?.status).toBe('sent');
      expect(e?.unsubscribedAt).toBeGreaterThan(0);
    });

    it('markConfirmed (RFC 8058 one-click POST)', () => {
      const e = SubscriptionStore.markConfirmed('a@x.com');
      expect(e?.status).toBe('confirmed');
      expect(e?.confirmedAt).toBeGreaterThan(0);
    });

    it('markFailed z error message', () => {
      const e = SubscriptionStore.markFailed('a@x.com', 'SMTP error 550');
      expect(e?.status).toBe('failed');
      expect(e?.errorMessage).toBe('SMTP error 550');
    });

    it('markBlocked alternative', () => {
      const e = SubscriptionStore.markBlocked('a@x.com');
      expect(e?.status).toBe('blocked');
    });

    it('actions nieznanego sender → undefined', () => {
      expect(SubscriptionStore.markSent('unknown@x.com')).toBeUndefined();
    });
  });

  describe('bulkMarkSent', () => {
    it('bulk dla wielu senders', () => {
      SubscriptionStore.recordIncoming({ sender: 'a@x.com' });
      SubscriptionStore.recordIncoming({ sender: 'b@x.com' });
      const n = SubscriptionStore.bulkMarkSent(['a@x.com', 'b@x.com', 'nope@x.com']);
      expect(n).toBe(2);
      expect(SubscriptionStore.listByStatus('sent').length).toBe(2);
    });
  });

  describe('queries (list, listByStatus, listActionable)', () => {
    beforeEach(() => {
      SubscriptionStore.recordIncoming({
        sender: 'pending@x.com',
        unsubscribeInfo: { mailto: 'mailto:u@x.com', oneClick: false },
      });
      SubscriptionStore.recordIncoming({
        sender: 'no-unsub@x.com', // brak unsubscribeInfo
      });
      SubscriptionStore.recordIncoming({
        sender: 'sent@x.com',
        unsubscribeInfo: { httpUrl: 'https://x.com/u', oneClick: false },
      });
      SubscriptionStore.markSent('sent@x.com');
    });

    it('list sortuje wg lastReceivedAt desc', () => {
      const list = SubscriptionStore.list();
      expect(list.length).toBe(3);
      // Newest first — kolejność insertion ostatnia = sent@x.com (post mark)
    });

    it('listByStatus filtruje', () => {
      expect(SubscriptionStore.listByStatus('sent').length).toBe(1);
      expect(SubscriptionStore.listByStatus('pending').length).toBe(2);
    });

    it('listActionable — tylko pending Z unsubscribeInfo', () => {
      const a = SubscriptionStore.listActionable();
      expect(a.length).toBe(1);
      expect(a[0].sender).toBe('pending@x.com');
    });

    it('count vs countActionable', () => {
      expect(SubscriptionStore.count()).toBe(3);
      expect(SubscriptionStore.countActionable()).toBe(1);
    });

    it('remove', () => {
      expect(SubscriptionStore.remove('pending@x.com')).toBe(true);
      expect(SubscriptionStore.remove('nope@x.com')).toBe(false);
      expect(SubscriptionStore.count()).toBe(2);
    });
  });

  describe('persistence', () => {
    it('persists do localStorage', () => {
      SubscriptionStore.recordIncoming({ sender: 'a@x.com' });
      expect(localStorage.getItem('actuna.subscriptions')).toContain('a@x.com');
    });
  });

  describe('listen', () => {
    it('emit na recordIncoming/markSent/markConfirmed/markFailed/markBlocked/remove', () => {
      let n = 0;
      const unsub = SubscriptionStore.listen(() => n++);
      SubscriptionStore.recordIncoming({ sender: 'a@x.com' });
      SubscriptionStore.markSent('a@x.com');
      SubscriptionStore.markConfirmed('a@x.com');
      SubscriptionStore.remove('a@x.com');
      expect(n).toBe(4);
      unsub();
    });
  });
});
