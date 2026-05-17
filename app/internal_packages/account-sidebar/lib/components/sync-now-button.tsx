import React from 'react';
import { localized } from 'actunamail-exports';
import { RetinaImg, Tooltip } from 'actunamail-component-kit';

// Toolbar button that forces an immediate mail + folder-list sync. Upstream
// Mailspring relied solely on the IMAP IDLE loop and the background sync
// cycle, leaving no visible "receive now" control — this fills that gap.
// Clicking it wakes every account's mailsync worker right away.
export default class SyncNowButton extends React.Component<
  Record<string, never>,
  { syncing: boolean }
> {
  static displayName = 'SyncNowButton';

  _timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props) {
    super(props);
    this.state = { syncing: false };
  }

  componentWillUnmount() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  _onSyncNow = () => {
    AppEnv.mailsyncBridge.sendSyncMailNow();
    this.setState({ syncing: true });
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    // sendSyncMailNow() has no completion callback — show a short spin so the
    // click registers visually, then settle.
    this._timeout = setTimeout(() => {
      this._timeout = null;
      this.setState({ syncing: false });
    }, 1500);
  };

  render() {
    return (
      <Tooltip content={localized('Sync now')}>
        <button
          className={`btn btn-toolbar item-sync-now${this.state.syncing ? ' spinning' : ''}`}
          aria-label={localized('Sync now')}
          onClick={this._onSyncNow}
        >
          <RetinaImg
            name="toolbar-refresh.png"
            mode={RetinaImg.Mode.ContentIsMask}
            aria-hidden="true"
          />
        </button>
      </Tooltip>
    );
  }
}
