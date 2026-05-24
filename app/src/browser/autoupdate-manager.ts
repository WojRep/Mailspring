/* eslint global-require: 0*/
import { dialog, nativeImage } from 'electron';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { localized } from '../intl';

const autoUpdater = null;

const IdleState = 'idle';
const CheckingState = 'checking';
const DownloadingState = 'downloading';
const UpdateAvailableState = 'update-available';
const NoUpdateAvailableState = 'no-update-available';
const UnsupportedState = 'unsupported';
const ErrorState = 'error';
const preferredChannel = 'stable';

export default class AutoUpdateManager extends EventEmitter {
  state = IdleState;
  version: string;
  config: import('../config').default;
  specMode: boolean;
  preferredChannel: string;
  feedURL: string;
  releaseNotes: string;
  releaseVersion: string;

  constructor(version: string, config: import('../config').default, specMode: boolean) {
    super();

    this.version = version;
    this.config = config;
    this.specMode = specMode;
    this.preferredChannel = preferredChannel;
    this.feedURL = ''; // WS2-E: no feed URL.

    // WS2-E: auto-update channel disabled.
    // Upstream ActunaMail polled updates.getmailspring.com on startup
    // and every 30 minutes thereafter, leaking app version, platform,
    // arch, and the user's identity.id (or 'anonymous'). The state of
    // the auto-update channel is set to UnsupportedState so the menu
    // entry shows "Updater unsupported" instead of pretending to check.
    // Actuna Mail's own update channel ships in v0.3 (per
    // README.md "Status" section). Until then updates are manual.
    this.state = UnsupportedState;
  }

  // WS2-E: updateFeedURL stubbed.
  // Upstream ActunaMail constructed a feed URL at
  //   https://updates.actuna.email/check/<platform>/<arch>/<version>/<identity.id>/<channel>
  // which leaked app + identity metadata to Foundry on every check.
  // Actuna Mail keeps the method on the class for API compatibility but
  // assigns an empty feedURL so no upstream request can be issued.
  updateFeedURL = () => {
    this.feedURL = '';
  };

  setupAutoUpdater() {
    // WS2-E: setupAutoUpdater is intentionally a no-op. We do not
    // initialize Electron's autoUpdater, do not register its event
    // handlers, and do not start the 30-minute polling interval. The
    // state was set to UnsupportedState in the constructor so any
    // observers see "updater unavailable".
  }

  emitUpdateAvailableEvent() {
    if (!this.releaseVersion) {
      return;
    }
    global.application.windowManager.sendToAllWindows(
      'update-available',
      {},
      this.getReleaseDetails()
    );
  }

  setState(state: string) {
    if (this.state === state) {
      return;
    }
    this.state = state;
    this.emit('state-changed', this.state);
  }

  getState() {
    return this.state;
  }

  getReleaseDetails() {
    return {
      releaseVersion: this.releaseVersion,
      releaseNotes: this.releaseNotes,
    };
  }

  check({ hidePopups }: { hidePopups?: boolean } = {}) {
    // WS2-E: no remote check. Show "no update available" dialog if the
    // user explicitly invokes the check, so the menu item still gives
    // feedback. Silent (hidePopups) calls are no-ops.
    if (!hidePopups) {
      this.onUpdateNotAvailable();
    }
  }

  install() {
    // WS2-E: there is no auto-update install path in v0.1. Updates are
    // applied manually by replacing the application bundle.
  }

  dialogIcon() {
    const iconPath = path.join(
      global.application.resourcePath,
      'static',
      'images',
      'actunamail.png'
    );
    if (!fs.existsSync(iconPath)) return undefined;
    return nativeImage.createFromPath(iconPath);
  }

  onUpdateNotAvailable = () => {
    // WS2-E + v0.2.b: no autoUpdater event listeners are registered.
    // Dialog informs the user without disclosing the build version.
    dialog.showMessageBox({
      type: 'info',
      buttons: [localized('OK')],
      icon: this.dialogIcon(),
      message: localized('No update available.'),
      title: localized('No update available.'),
      detail: localized(`Auto-update is disabled in this build. Download new versions manually.`),
    });
  };

  onUpdateError = (_event: any, message: string) => {
    // WS2-E: kept for API compatibility; no autoUpdater is initialized,
    // so this is unreachable by event but still callable.
    dialog.showMessageBox({
      type: 'warning',
      buttons: [localized('OK')],
      icon: this.dialogIcon(),
      message: localized('There was an error checking for updates.'),
      title: localized('Update Error'),
      detail: message,
    });
  };
}
