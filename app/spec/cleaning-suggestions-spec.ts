/**
 * Bilet MVP #116 — Cleaning Suggestions engine + Store unit tests.
 */

import {
  categorize,
  extractDomain,
  analyzeForSuggestions,
  MessageMeta,
  MIN_COUNT_THRESHOLD,
  MIN_AGE_DAYS,
} from '../internal_packages/cleaning-suggestions/lib/suggestions-engine';
import {
  CleaningStore,
} from '../internal_packages/cleaning-suggestions/lib/cleaning-store';

const DAY_MS = 24 * 60 * 60 * 1000;

function msg(threadId: string, sender: string, opts: Partial<MessageMeta> = {}): MessageMeta {
  return {
    threadId,
    sender,
    date: opts.date ?? Date.now(),
    senderDomain: opts.senderDomain,
    subject: opts.subject,
    hasListUnsubscribe: opts.hasListUnsubscribe,
  };
}

describe('Cleaning Suggestions engine — bilet MVP #116', () => {

  describe('categorize', () => {
    it('newsletters gdy hasListUnsubscribe + brak promo keywords', () => {
      expect(categorize(msg('t', 'a@x.com', { hasListUnsubscribe: true, subject: 'Weekly update' }))).toBe('newsletters');
    });

    it('promo gdy hasListUnsubscribe + subject ma keyword', () => {
      expect(categorize(msg('t', 'a@x.com', { hasListUnsubscribe: true, subject: '50% sale this week' }))).toBe('promo');
      expect(categorize(msg('t', 'a@x.com', { hasListUnsubscribe: true, subject: 'Wielka promocja' }))).toBe('promo');
    });

    it('notifications gdy noreply/notification w local part', () => {
      expect(categorize(msg('t', 'noreply@github.com'))).toBe('notifications');
      expect(categorize(msg('t', 'notifications@stripe.com'))).toBe('notifications');
    });

    it('other dla regular human-looking sender', () => {
      expect(categorize(msg('t', 'bob@company.com'))).toBe('other');
    });
  });

  describe('extractDomain', () => {
    it('lowercased domain', () => {
      expect(extractDomain('Bob@Example.COM')).toBe('example.com');
    });

    it('empty dla nieformat email', () => {
      expect(extractDomain('not-email')).toBe('');
    });
  });

  describe('analyzeForSuggestions', () => {
    it('zwraca puste gdy < MIN_COUNT_THRESHOLD', () => {
      const messages: MessageMeta[] = [];
      for (let i = 0; i < MIN_COUNT_THRESHOLD - 1; i++) {
        messages.push(msg(`t${i}`, 'promo@x.com', { hasListUnsubscribe: true, subject: 'sale', date: Date.now() - 365 * DAY_MS }));
      }
      expect(analyzeForSuggestions(messages).length).toBe(0);
    });

    it('zwraca puste gdy oldest jest nie wystarczająco stary', () => {
      const messages: MessageMeta[] = [];
      for (let i = 0; i < MIN_COUNT_THRESHOLD; i++) {
        messages.push(msg(`t${i}`, 'promo@x.com', { hasListUnsubscribe: true, subject: 'sale', date: Date.now() - 10 * DAY_MS }));
      }
      expect(analyzeForSuggestions(messages).length).toBe(0);
    });

    it('zwraca suggestion gdy >= threshold + old enough', () => {
      const messages: MessageMeta[] = [];
      for (let i = 0; i < 15; i++) {
        messages.push(msg(`t${i}`, 'promo@example.com', {
          hasListUnsubscribe: true, subject: 'sale', date: Date.now() - (60 + i) * DAY_MS,
        }));
      }
      const s = analyzeForSuggestions(messages);
      expect(s.length).toBe(1);
      expect(s[0].count).toBe(15);
      expect(s[0].category).toBe('promo');
      expect(s[0].scopeType).toBe('domain');
      expect(s[0].scopeValue).toBe('example.com');
      expect(s[0].textPl).toContain('15');
      expect(s[0].textPl).toContain('promocji');
      expect(s[0].textEn).toContain('promos');
    });

    it('scope=sender agreguje per email', () => {
      const messages: MessageMeta[] = [];
      for (let i = 0; i < 12; i++) {
        messages.push(msg(`t${i}`, 'a@example.com', {
          hasListUnsubscribe: true, date: Date.now() - 60 * DAY_MS,
        }));
      }
      const s = analyzeForSuggestions(messages, { scope: 'sender' });
      expect(s[0].scopeType).toBe('sender');
      expect(s[0].scopeValue).toBe('a@example.com');
    });

    it('multiple categories per single domain', () => {
      const messages: MessageMeta[] = [];
      // 12 promo
      for (let i = 0; i < 12; i++) {
        messages.push(msg(`p${i}`, 'shop@brand.com', {
          hasListUnsubscribe: true, subject: 'sale', date: Date.now() - 60 * DAY_MS,
        }));
      }
      // 12 newsletter (no promo keyword)
      for (let i = 0; i < 12; i++) {
        messages.push(msg(`n${i}`, 'news@brand.com', {
          hasListUnsubscribe: true, subject: 'weekly digest', date: Date.now() - 60 * DAY_MS,
        }));
      }
      const s = analyzeForSuggestions(messages);
      expect(s.length).toBe(2);
      expect(s.find(x => x.category === 'promo')?.count).toBe(12);
      expect(s.find(x => x.category === 'newsletters')?.count).toBe(12);
    });

    it('sortuje wg count desc', () => {
      const messages: MessageMeta[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push(msg(`hi${i}`, 'big@brand1.com', {
          hasListUnsubscribe: true, subject: 'newsletter', date: Date.now() - 60 * DAY_MS,
        }));
      }
      for (let i = 0; i < 15; i++) {
        messages.push(msg(`lo${i}`, 'sm@brand2.com', {
          hasListUnsubscribe: true, subject: 'newsletter', date: Date.now() - 60 * DAY_MS,
        }));
      }
      const s = analyzeForSuggestions(messages);
      expect(s[0].count).toBe(50);
      expect(s[1].count).toBe(15);
    });

    it('respektuje categories option (subset)', () => {
      const messages: MessageMeta[] = [];
      for (let i = 0; i < 12; i++) {
        messages.push(msg(`n${i}`, 'noreply@x.com', { date: Date.now() - 60 * DAY_MS }));
        messages.push(msg(`p${i}`, 'shop@x.com', { hasListUnsubscribe: true, subject: 'sale', date: Date.now() - 60 * DAY_MS }));
      }
      const s = analyzeForSuggestions(messages, { categories: ['promo'] });
      expect(s.every(x => x.category === 'promo')).toBe(true);
    });

    it('text PL z czasem (lat/mies./dni)', () => {
      const messages: MessageMeta[] = [];
      for (let i = 0; i < 12; i++) {
        messages.push(msg(`t${i}`, 'a@x.com', {
          hasListUnsubscribe: true, date: Date.now() - 400 * DAY_MS,
        }));
      }
      const s = analyzeForSuggestions(messages);
      expect(s[0].textPl).toContain('1 rok');
      expect(s[0].textEn).toContain('1 year');
    });
  });
});

describe('Cleaning Store — bilet MVP #116', () => {

  beforeEach(() => {
    CleaningStore._reset();
    CleaningStore.init();
  });

  describe('settings', () => {
    it('defaults: enabled true, all 3 categories, firstRun not done', () => {
      const s = CleaningStore.getSettings();
      expect(s.enabled).toBe(true);
      expect(s.scopeCategories.sort()).toEqual(['newsletters', 'notifications', 'promo']);
      expect(s.firstRunDone).toBe(false);
    });

    it('shouldOfferFirstRun true zanim markFirstRunDone', () => {
      expect(CleaningStore.shouldOfferFirstRun()).toBe(true);
      CleaningStore.markFirstRunDone();
      expect(CleaningStore.shouldOfferFirstRun()).toBe(false);
    });

    it('setScopeCategories filtruje "other"', () => {
      CleaningStore.setScopeCategories(['promo', 'other'] as any);
      expect(CleaningStore.getSettings().scopeCategories).toEqual(['promo']);
    });

    it('setEnabled', () => {
      CleaningStore.setEnabled(false);
      expect(CleaningStore.getSettings().enabled).toBe(false);
    });
  });

  describe('Read Later settings', () => {
    it('defaults: disabled, triggerTag=newsletter, targetFolder=Read Later, digest off', () => {
      const r = CleaningStore.getReadLaterSettings();
      expect(r.enabled).toBe(false);
      expect(r.triggerTag).toBe('newsletter');
      expect(r.targetFolder).toBe('Read Later');
      expect(r.digestSchedule).toBe('off');
    });

    it('setReadLaterEnabled', () => {
      CleaningStore.setReadLaterEnabled(true);
      expect(CleaningStore.getReadLaterSettings().enabled).toBe(true);
    });

    it('setReadLaterTriggerTag wymaga value', () => {
      expect(() => CleaningStore.setReadLaterTriggerTag('')).toThrowError(/required/);
      CleaningStore.setReadLaterTriggerTag('important-newsletter');
      expect(CleaningStore.getReadLaterSettings().triggerTag).toBe('important-newsletter');
    });

    it('setReadLaterTargetFolder', () => {
      CleaningStore.setReadLaterTargetFolder('Later/Reads');
      expect(CleaningStore.getReadLaterSettings().targetFolder).toBe('Later/Reads');
    });

    it('setDigestSchedule', () => {
      CleaningStore.setDigestSchedule('daily_9am');
      expect(CleaningStore.getReadLaterSettings().digestSchedule).toBe('daily_9am');
    });

    it('nextDigestAt off → null', () => {
      expect(CleaningStore.nextDigestAt()).toBeNull();
    });

    it('nextDigestAt daily_9am → najbliższe 9:00', () => {
      CleaningStore.setDigestSchedule('daily_9am');
      const now = new Date(2026, 4, 27, 14, 30).getTime(); // Wed 14:30
      const next = CleaningStore.nextDigestAt(now);
      expect(next).not.toBeNull();
      const dt = new Date(next!);
      expect(dt.getHours()).toBe(9);
      // 14:30 > 9:00 → następny dzień
      expect(dt.getDate()).toBe(28);
    });

    it('nextDigestAt weekly_mon_9am — najbliższy poniedziałek 9:00', () => {
      CleaningStore.setDigestSchedule('weekly_mon_9am');
      const now = new Date(2026, 4, 27, 14, 30).getTime(); // Wed
      const next = CleaningStore.nextDigestAt(now);
      const dt = new Date(next!);
      expect(dt.getDay()).toBe(1);
      expect(dt.getHours()).toBe(9);
    });
  });

  describe('suggestion history (dismissed/acted)', () => {
    const sugg = {
      id: 'sug_1',
      scopeType: 'domain' as const,
      scopeValue: 'example.com',
      category: 'promo' as const,
      threadIds: ['t1', 't2'],
      count: 2,
      oldestAt: 0,
      newestAt: 0,
      textPl: '',
      textEn: '',
    };

    it('recordAction zapisuje + lowercase scopeValue', () => {
      CleaningStore.recordAction({ ...sugg, scopeValue: 'EXAMPLE.COM' }, 'dismissed');
      expect(CleaningStore.getHistory()[0].scopeValue).toBe('example.com');
      expect(CleaningStore.getHistory()[0].action).toBe('dismissed');
    });

    it('isScopeRecentlyHandled true po actiona w withinDays', () => {
      CleaningStore.recordAction(sugg, 'dismissed');
      expect(CleaningStore.isScopeRecentlyHandled('domain', 'example.com', 'promo', 7)).toBe(true);
    });

    it('isScopeRecentlyHandled false dla innego category', () => {
      CleaningStore.recordAction(sugg, 'dismissed');
      expect(CleaningStore.isScopeRecentlyHandled('domain', 'example.com', 'newsletters', 7)).toBe(false);
    });

    it('filterFresh wyłącza dismissed scopes', () => {
      CleaningStore.recordAction(sugg, 'dismissed');
      const filtered = CleaningStore.filterFresh([sugg, { ...sugg, id: 'sug_2', scopeValue: 'other.com' }]);
      expect(filtered.length).toBe(1);
      expect(filtered[0].scopeValue).toBe('other.com');
    });
  });

  describe('persistence', () => {
    it('persists settings + read-later + history', () => {
      CleaningStore.setEnabled(false);
      CleaningStore.setReadLaterEnabled(true);
      CleaningStore.recordAction({
        id: 's', scopeType: 'domain', scopeValue: 'x.com', category: 'promo',
        threadIds: [], count: 0, oldestAt: 0, newestAt: 0, textPl: '', textEn: '',
      }, 'acted');
      expect(localStorage.getItem('actuna.cleaning-settings')).toContain('false');
      expect(localStorage.getItem('actuna.read-later-settings')).toContain('true');
      expect(localStorage.getItem('actuna.cleaning-history')).toContain('acted');
    });
  });

  describe('listen', () => {
    it('emit na settings + history', () => {
      let n = 0;
      const unsub = CleaningStore.listen(() => n++);
      CleaningStore.setEnabled(false);
      CleaningStore.markFirstRunDone();
      CleaningStore.setReadLaterEnabled(true);
      expect(n).toBe(3);
      unsub();
    });
  });
});
