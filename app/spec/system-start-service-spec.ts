import SystemStartService from '../src/system-start-service';

// Regression for the "bare Electron welcome window at login" bug.
//
// On macOS `app.setLoginItemSettings({ openAtLogin: true })` registers the
// *currently running executable*. When the "Launch on system start" toggle is
// enabled while running in dev mode (`npm start` → electron ./app), the
// executable is node_modules/.../Electron.app — a bare Electron with no app
// path. At login macOS relaunches it without `path-to-app`, so it shows
// Electron's default welcome screen instead of ActunaMail.
//
// Fix: the Darwin service refuses to register a login item unless the app is
// packaged (a real installable bundle). The spec runner itself is an
// unpackaged Electron (electron ./app --test), i.e. exactly the dev situation,
// so the dev-branch tests need no stubbing — `app.isPackaged` is genuinely
// false here. The packaged branch is driven via the `_isPackaged()` seam.
describe('SystemStartService — dev-mode login-item guard', function systemStartServiceSpec() {
  // Darwin-only behaviour; the spec runner only executes on macOS here.
  if (process.platform !== 'darwin') return;

  const remoteApp = () => require('@electron/remote').app;
  let service: any;

  beforeEach(function () {
    service = new SystemStartService();
    // Never mutate the real OS login items during specs.
    spyOn(remoteApp(), 'setLoginItemSettings');
    spyOn(remoteApp(), 'getLoginItemSettings').andReturn({ openAtLogin: false });
  });

  describe('when running unpackaged (dev mode — the bug scenario)', function () {
    it('does not register a login item', function () {
      expect(remoteApp().isPackaged).toBe(false); // sanity: we are unpackaged
      service.configureToLaunchOnSystemStart();
      expect(remoteApp().setLoginItemSettings).not.toHaveBeenCalled();
    });

    it('reports the feature as unavailable', async function () {
      const available = await service.checkAvailability();
      expect(available).toBe(false);
    });
  });

  describe('when running packaged (production build)', function () {
    beforeEach(function () {
      spyOn(service, '_isPackaged').andReturn(true);
    });

    it('registers openAtLogin', function () {
      service.configureToLaunchOnSystemStart();
      expect(remoteApp().setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
    });

    it('reports the feature as available', async function () {
      const available = await service.checkAvailability();
      expect(available).toBe(true);
    });
  });

  describe('dontLaunchOnSystemStart', function () {
    // Disabling must always be allowed (even unpackaged) so a stale dev login
    // item can be cleared from within the app.
    it('always clears openAtLogin regardless of packaging', function () {
      service.dontLaunchOnSystemStart();
      expect(remoteApp().setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
    });
  });
});
