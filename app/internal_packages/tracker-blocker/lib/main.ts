/**
 * Tracker blocker plugin entry — bilet MVP #111.
 *
 * activate():
 *   1. Cmd+K palette command "Manage trackers".
 *   2. Expose AppEnv.trackerBlocker API z helpers.
 *
 * Image strip wire-up (intercepting reading pane HTML render) + MDN composer
 * checkbox + recipient dialog odłożone do UI ticket.
 */

import { isTrackerUrl, trackerMatch, TRACKER_DOMAINS, TRACKER_DOMAIN_COUNT } from './tracker-blocklist';
import {
  stripAndTransformImages,
  buildProxyUrl,
  unwrapProxyUrl,
  ImageLoadMode,
} from './image-stripper';
import {
  buildMdnHeader,
  detectMdnRequest,
  buildMdnResponse,
} from './mdn-rfc-8098';

export function activate() {
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.register({
      id: 'tracker-blocker:open-prefs',
      label: 'Trackery i obrazki — preferencje',
      section: 'Settings',
      keywords: ['tracker', 'blocker', 'privacy', 'image', 'mdn'],
      handler: () => openPrefs(),
    });
  }

  (window as any).AppEnv = (window as any).AppEnv || {};
  (window as any).AppEnv.trackerBlocker = {
    isTrackerUrl,
    trackerMatch,
    stripAndTransformImages,
    buildProxyUrl,
    unwrapProxyUrl,
    mdn: {
      buildHeader: buildMdnHeader,
      detectRequest: detectMdnRequest,
      buildResponse: buildMdnResponse,
    },
    constants: {
      TRACKER_DOMAIN_COUNT,
      TRACKER_DOMAINS_SAMPLE: TRACKER_DOMAINS.slice(0, 5),
    },
  };
}

export function deactivate() {
  const palette = (window as any).AppEnv?.commandPalette;
  if (palette) {
    palette.unregister('tracker-blocker:open-prefs');
  }
  if ((window as any).AppEnv?.trackerBlocker) {
    delete (window as any).AppEnv.trackerBlocker;
  }
}

function openPrefs(): void {
  console.info('[tracker-blocker] open Preferences > Privacy > Trackers');
}

export type { ImageLoadMode, StripResult } from './image-stripper';
export type { MdnDisposition, MdnRequestInfo } from './mdn-rfc-8098';
