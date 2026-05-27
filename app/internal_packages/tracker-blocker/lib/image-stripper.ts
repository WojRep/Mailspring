/**
 * Image stripper + proxy URL builder — bilet MVP #111.
 *
 * Pure HTML transform: skanuje incoming HTML body, znajduje <img src>, decyduje:
 *  - block (default + tracker match): replace `src` na empty + chip count.
 *  - proxy: replace `src` na `actunamail-proxy://...` (image proxy strips referer/cookies).
 *  - allow: leave intact (gdy user kliknął "Load images" per-message i NIE tracker).
 *
 * Strip również tracking pixels w form `<img width=1 height=1>` (oczywisty tracker).
 */

import { isTrackerUrl, trackerMatch } from './tracker-blocklist';

export type ImageLoadMode = 'block_all' | 'proxy_all' | 'proxy_non_trackers' | 'allow_all';

export interface StripResult {
  /** Modified HTML. */
  html: string;
  /** Count of blocked tracker images. */
  trackersBlocked: number;
  /** Count of all stripped/proxied images. */
  imagesProcessed: number;
  /** Tracker URLs that were blocked (z reason). */
  blockedUrls: Array<{ url: string; reason: string; matchedDomain?: string }>;
}

const PROXY_SCHEME = 'actunamail-proxy://';

/**
 * Strip + transform images per ImageLoadMode.
 *
 * Strategy:
 *  - block_all: wszystkie src puste, count.
 *  - proxy_all: wszystkie src przez proxy (strips referer/cookies), tracker count zaznacza tracker matches.
 *  - proxy_non_trackers: trackers blocked, non-trackers proxied. (Default safe.)
 *  - allow_all: leave src, count trackers (informational tylko).
 *
 * Detection 1x1 tracking pixel: `<img width="1" height="1">` lub `width=0 height=0`.
 */
export function stripAndTransformImages(html: string, mode: ImageLoadMode = 'proxy_non_trackers'): StripResult {
  let trackersBlocked = 0;
  let imagesProcessed = 0;
  const blockedUrls: StripResult['blockedUrls'] = [];

  const out = html.replace(/<img\b[^>]*>/gi, (imgTag) => {
    imagesProcessed++;
    const srcMatch = imgTag.match(/\bsrc\s*=\s*["']?([^"'\s>]+)["']?/i);
    if (!srcMatch) return imgTag;
    const originalSrc = srcMatch[1];

    const tracker = trackerMatch(originalSrc);
    const isOnePxPixel = /\bwidth\s*=\s*["']?[01]["']?/i.test(imgTag) && /\bheight\s*=\s*["']?[01]["']?/i.test(imgTag);
    const isTracker = tracker !== null || isOnePxPixel;

    if (isTracker) {
      trackersBlocked++;
      blockedUrls.push({
        url: originalSrc,
        reason: tracker ? 'blocklist-match' : '1x1-pixel-heuristic',
        matchedDomain: tracker || undefined,
      });
    }

    switch (mode) {
      case 'block_all':
        return imgTag.replace(/\bsrc\s*=\s*["']?[^"'\s>]+["']?/i, 'src=""');
      case 'proxy_all': {
        const proxied = buildProxyUrl(originalSrc);
        return imgTag.replace(/\bsrc\s*=\s*["']?[^"'\s>]+["']?/i, `src="${proxied}"`);
      }
      case 'proxy_non_trackers':
        if (isTracker) {
          return imgTag.replace(/\bsrc\s*=\s*["']?[^"'\s>]+["']?/i, 'src=""');
        }
        return imgTag.replace(/\bsrc\s*=\s*["']?[^"'\s>]+["']?/i, `src="${buildProxyUrl(originalSrc)}"`);
      case 'allow_all':
      default:
        return imgTag;
    }
  });

  return { html: out, trackersBlocked, imagesProcessed, blockedUrls };
}

/** Build proxy URL — strips referer/cookies/IP fingerprint (Canary pattern). */
export function buildProxyUrl(originalSrc: string): string {
  return `${PROXY_SCHEME}${encodeURIComponent(originalSrc)}`;
}

/** Parse proxy URL back to original (renderer use). */
export function unwrapProxyUrl(proxiedSrc: string): string | null {
  if (!proxiedSrc.startsWith(PROXY_SCHEME)) return null;
  return decodeURIComponent(proxiedSrc.slice(PROXY_SCHEME.length));
}
