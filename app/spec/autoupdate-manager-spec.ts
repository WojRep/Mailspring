import AutoUpdateManager from '../src/browser/autoupdate-manager';

// Auto-update channel was excised in WS2-E (Actuna v0.2.x compliance work):
// upstream Mailspring polled updates.getmailspring.com every 30 minutes
// and leaked app metadata + identity.id to Foundry. ActunaMail keeps the
// AutoUpdateManager class for API compatibility but the manager:
//   - sets feedURL to '' (no remote check possible),
//   - sets state to 'unsupported',
//   - turns updateFeedURL() into a stub that always re-assigns '',
//   - makes setupAutoUpdater() a no-op,
//   - never registers electron's autoUpdater event handlers.
// These specs lock that contract — if anyone re-introduces remote update
// polling, the suite fails and forces a compliance re-review (GDPR Art. 5(1)(c),
// AI Act outside-scope, KNF D §9.2). Original Foundry specs that asserted
// concrete feedURL values were stale (auto-update was already removed but the
// specs were not updated); they have been rewritten to lock the WS2-E posture.

describe('AutoUpdateManager (WS2-E: auto-update disabled)', function () {
  beforeEach(function () {
    this.actunaMailIdentityId = null;
    this.specMode = true;
    this.config = {
      set: jasmine.createSpy('config.set'),
      get: (key) => {
        if (key === 'identity.id') {
          return this.actunaMailIdentityId;
        }
        if (key === 'env') {
          return 'production';
        }
      },
      onDidChange: (key, callback) => {
        return callback();
      },
    };
  });

  describe('feedURL', () => {
    it('is empty for a release version (no remote check)', function () {
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      expect(m.feedURL).toEqual('');
    });

    it('is empty for a dev version with attached commit', function () {
      const m = new AutoUpdateManager('3.222.1-abc', this.config, this.specMode);
      expect(m.feedURL).toEqual('');
    });

    it('stays empty even when an identity.id is present', function () {
      this.actunaMailIdentityId = 'test-actunamail-id';
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      expect(m.feedURL).toEqual('');
    });

    it('stays empty after explicit updateFeedURL() call', function () {
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      this.actunaMailIdentityId = 'test-actunamail-id';
      m.updateFeedURL();
      expect(m.feedURL).toEqual('');
    });
  });

  describe('state', () => {
    it('starts in UnsupportedState (no auto-update channel)', function () {
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      expect(m.getState()).toEqual('unsupported');
    });
  });

  describe('lifecycle hooks', () => {
    it('setupAutoUpdater() is a no-op (does not throw, no side effects observable)', function () {
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      expect(() => m.setupAutoUpdater()).not.toThrow();
      expect(m.feedURL).toEqual('');
      expect(m.getState()).toEqual('unsupported');
    });

    it('check({ hidePopups: true }) is a no-op (silent suppress)', function () {
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      expect(() => m.check({ hidePopups: true })).not.toThrow();
    });

    it('install() is a no-op', function () {
      const m = new AutoUpdateManager('3.222.1', this.config, this.specMode);
      expect(() => m.install()).not.toThrow();
    });
  });
});
