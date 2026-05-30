/**
 * Bilet MVP #111 — Tracker blocker + RFC 8098 MDN unit tests.
 */

import {
  isTrackerUrl,
  trackerMatch,
  TRACKER_DOMAINS,
  TRACKER_DOMAIN_COUNT,
} from '../internal_packages/tracker-blocker/lib/tracker-blocklist';
import {
  stripAndTransformImages,
  buildProxyUrl,
  unwrapProxyUrl,
} from '../internal_packages/tracker-blocker/lib/image-stripper';
import {
  buildMdnHeader,
  detectMdnRequest,
  buildMdnResponse,
} from '../internal_packages/tracker-blocker/lib/mdn-rfc-8098';

describe('Tracker blocker — bilet MVP #111', () => {

  describe('tracker blocklist', () => {
    it('zawiera 80+ tracker domains', () => {
      expect(TRACKER_DOMAIN_COUNT).toBeGreaterThan(80);
      expect(TRACKER_DOMAINS.length).toBe(TRACKER_DOMAIN_COUNT);
    });

    it('isTrackerUrl true dla znanych trackers', () => {
      expect(isTrackerUrl('https://mailtrack.io/track/abc')).toBe(true);
      expect(isTrackerUrl('https://t.hubspot.com/open?id=123')).toBe(true);
      expect(isTrackerUrl('https://sendgrid.net/wf/open?upn=xyz')).toBe(true);
    });

    it('isTrackerUrl true dla subdomain znanego trackera', () => {
      expect(isTrackerUrl('https://m1.sendgrid.net/click')).toBe(true);
      expect(isTrackerUrl('https://email.mailgun.com/open')).toBe(true);
    });

    it('isTrackerUrl false dla nie-trackers', () => {
      expect(isTrackerUrl('https://example.com/logo.png')).toBe(false);
      expect(isTrackerUrl('https://github.com/avatars/u/1')).toBe(false);
      expect(isTrackerUrl('https://gravatar.com/avatar/abc')).toBe(false);
    });

    it('isTrackerUrl false dla invalid URL', () => {
      expect(isTrackerUrl('not a url')).toBe(false);
      expect(isTrackerUrl('')).toBe(false);
    });

    it('trackerMatch zwraca matched domain', () => {
      expect(trackerMatch('https://t.hubspot.com/abc')).toBe('t.hubspot.com');
      expect(trackerMatch('https://m1.sendgrid.net/abc')).toBe('sendgrid.net');
      expect(trackerMatch('https://example.com/x')).toBeNull();
    });
  });

  describe('stripAndTransformImages', () => {
    it('block_all empties src + counts', () => {
      const html = '<p>Hello</p><img src="https://example.com/a.png"><img src="https://t.hubspot.com/o.png">';
      const r = stripAndTransformImages(html, 'block_all');
      expect(r.imagesProcessed).toBe(2);
      expect(r.trackersBlocked).toBe(1);
      expect(r.html).toContain('src=""');
      expect(r.html).not.toContain('a.png');
    });

    it('proxy_non_trackers — blocks trackers, proxies non-trackers', () => {
      const html = '<img src="https://example.com/logo.png"><img src="https://mailtrack.io/t/abc.png">';
      const r = stripAndTransformImages(html, 'proxy_non_trackers');
      expect(r.trackersBlocked).toBe(1);
      expect(r.html).toContain('actunamail-proxy://');
      expect(r.html).toContain(encodeURIComponent('https://example.com/logo.png'));
      expect(r.html).not.toContain('mailtrack.io');
    });

    it('proxy_all proxies wszystkie + counts trackers', () => {
      const html = '<img src="https://example.com/x.png"><img src="https://mailtrack.io/t.png">';
      const r = stripAndTransformImages(html, 'proxy_all');
      expect(r.trackersBlocked).toBe(1);
      expect((r.html.match(/actunamail-proxy:/g) || []).length).toBe(2);
    });

    it('allow_all leaves src + counts tracker informational', () => {
      const html = '<img src="https://example.com/x.png"><img src="https://mailtrack.io/t.png">';
      const r = stripAndTransformImages(html, 'allow_all');
      expect(r.trackersBlocked).toBe(1);
      expect(r.html).toContain('mailtrack.io');
    });

    it('detect 1x1 pixel jako tracker (heuristic)', () => {
      const html = '<img src="https://nontracker.com/p.gif" width="1" height="1">';
      const r = stripAndTransformImages(html, 'proxy_non_trackers');
      expect(r.trackersBlocked).toBe(1);
      expect(r.blockedUrls[0].reason).toBe('1x1-pixel-heuristic');
    });

    it('zwraca blockedUrls z reason + matchedDomain', () => {
      const html = '<img src="https://t.hubspot.com/x.png">';
      const r = stripAndTransformImages(html, 'block_all');
      expect(r.blockedUrls[0].matchedDomain).toBe('t.hubspot.com');
      expect(r.blockedUrls[0].reason).toBe('blocklist-match');
    });

    it('handles html bez img', () => {
      const r = stripAndTransformImages('<p>plain text</p>', 'proxy_non_trackers');
      expect(r.imagesProcessed).toBe(0);
      expect(r.html).toBe('<p>plain text</p>');
    });
  });

  describe('buildProxyUrl / unwrapProxyUrl', () => {
    it('roundtrip', () => {
      const original = 'https://example.com/image.png?id=123&x=y';
      const proxied = buildProxyUrl(original);
      expect(proxied).toMatch(/^actunamail-proxy:\/\//);
      expect(unwrapProxyUrl(proxied)).toBe(original);
    });

    it('unwrap zwraca null gdy niewlasna schema', () => {
      expect(unwrapProxyUrl('https://example.com/x.png')).toBeNull();
    });
  });
});

describe('RFC 8098 MDN — bilet MVP #111', () => {

  describe('buildMdnHeader', () => {
    it('zwraca Disposition-Notification-To header', () => {
      const h = buildMdnHeader('sender@example.com');
      expect(h.name).toBe('Disposition-Notification-To');
      expect(h.value).toBe('sender@example.com');
    });

    it('throws dla invalid email', () => {
      { let _err; try { buildMdnHeader(''); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/email/); }
      { let _err; try { buildMdnHeader('not-email'); } catch (e) { _err = e; } expect(_err && _err.message).toMatch(/email/); }
    });
  });

  describe('detectMdnRequest', () => {
    it('zwraca senderEmail + originalMessageId (case insensitive headers)', () => {
      const info = detectMdnRequest({
        'Disposition-Notification-To': 'sender@example.com',
        'Message-ID': '<abc@example.com>',
      });
      expect(info?.senderEmail).toBe('sender@example.com');
      expect(info?.originalMessageId).toBe('<abc@example.com>');
    });

    it('zwraca null gdy header nieobecny', () => {
      expect(detectMdnRequest({ 'Subject': 'Hi' })).toBeNull();
    });

    it('null gdy value nie email', () => {
      expect(detectMdnRequest({ 'Disposition-Notification-To': 'not-email' })).toBeNull();
    });
  });

  describe('buildMdnResponse', () => {
    it('multipart/report z 3 sekcjami', () => {
      const body = buildMdnResponse({
        originalMessageId: '<abc@x.com>',
        recipientEmail: 'me@here.com',
        senderEmail: 'sender@x.com',
        disposition: 'displayed',
      });
      expect(body).toContain('multipart/report');
      expect(body).toContain('report-type=disposition-notification');
      expect(body).toContain('To: sender@x.com');
      expect(body).toContain('From: me@here.com');
      expect(body).toContain('Original-Message-ID: <abc@x.com>');
      expect(body).toContain('Disposition: manual-action/MDN-sent-manually; displayed');
      expect(body).toContain('--mdn_boundary');
      expect(body).toContain('--mdn_boundary--');
    });

    it('disposition variants: deleted/denied', () => {
      const body = buildMdnResponse({
        originalMessageId: '<x>',
        recipientEmail: 'r@x.com',
        senderEmail: 's@x.com',
        disposition: 'denied',
      });
      expect(body).toContain('Disposition: manual-action/MDN-sent-manually; denied');
    });
  });
});
