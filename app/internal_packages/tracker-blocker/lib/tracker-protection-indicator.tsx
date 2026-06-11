/**
 * TrackerProtectionIndicator — badge w MessageList:Header pokazujący ile
 * trackerów zablokowane per thread (#111 plan v1.0).
 *
 * Mockup: design/mockups/23-tracker-blocker.html.
 *
 * Reads thread.stripResult.{trackersBlocked, imagesProcessed} computed przez
 * stripAndTransformImages podczas message render.
 */

import React from 'react';

const { localized } = require('actunamail-exports');

interface Props {
  thread?: {
    id: string;
    stripResult?: {
      trackersBlocked: number;
      imagesProcessed: number;
    };
  };
}

export default class TrackerProtectionIndicator extends React.Component<Props> {
  static displayName = 'TrackerProtectionIndicator';
  static containerRequired = false;

  render() {
    const thread = this.props.thread;
    if (!thread || !thread.stripResult) return null;
    const { trackersBlocked, imagesProcessed } = thread.stripResult;
    if (imagesProcessed === 0) return null;
    const clean = trackersBlocked === 0;
    const cls = clean
      ? 'tracker-protection-indicator tracker-protection-indicator--clean'
      : 'tracker-protection-indicator tracker-protection-indicator--blocked';
    const ariaLabel = clean
      ? localized('Brak śledzących pikseli / No tracking pixels detected')
      : localized('Zablokowano {N} trackerów / Blocked {N} trackers').replace(
          /\{N\}/g,
          String(trackersBlocked)
        );
    return (
      <span className={cls} role="button" aria-label={ariaLabel} title={ariaLabel} tabIndex={0}>
        <span className="tracker-protection-icon" aria-hidden="true">
          🛡
        </span>
        <span className="tracker-protection-count">{clean ? '✓' : String(trackersBlocked)}</span>
      </span>
    );
  }
}
