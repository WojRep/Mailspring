import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Ticket #47 Tier A — AttachmentStore._resolvedTargetSaveDir().
 *
 * Resolver musi:
 *   1. zwrócić null gdy config.defaultSaveTarget === 'askEveryTime'
 *   2. zwrócić ścieżkę dla 'downloads' / 'documents' jeśli folder istnieje
 *   3. zwrócić null gdy resolved folder NIE istnieje (fallback do modala)
 *   4. zwrócić savedState.lastDownloadDirectory dla 'lastUsed'
 *      gdy istnieje, null gdy nie istnieje
 *
 * Spec używa rzeczywistego AttachmentStore — instancja singleton
 * powstała przy imporcie modułu. Czyścimy stan między testami.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AttachmentStoreModule = require('../../src/flux/stores/attachment-store');
const AttachmentStore = AttachmentStoreModule.default || AttachmentStoreModule;

describe('AttachmentStore — _resolvedTargetSaveDir (ticket #47)', () => {
  let store: any;
  let originalLastDownloadDir: any;
  let tmpDir: string;
  let tmpDirNonexistent: string;

  beforeEach(() => {
    store = AttachmentStore;
    originalLastDownloadDir = AppEnv.savedState.lastDownloadDirectory;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-47-'));
    tmpDirNonexistent = path.join(os.tmpdir(), `actuna-47-nope-${Date.now()}`);
  });

  afterEach(() => {
    AppEnv.savedState.lastDownloadDirectory = originalLastDownloadDir;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // best effort cleanup
    }
  });

  it('zwraca null gdy target = askEveryTime (zachowanie wsteczne)', () => {
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => {
      if (key === 'core.attachments.defaultSaveTarget') return 'askEveryTime';
      return undefined;
    });
    expect(store._resolvedTargetSaveDir()).toBeNull();
  });

  it('zwraca null gdy target nie jest ustawiony', () => {
    spyOn(AppEnv.config, 'get').andReturn(undefined);
    expect(store._resolvedTargetSaveDir()).toBeNull();
  });

  it('zwraca ścieżkę Downloads gdy target = downloads i folder istnieje', () => {
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => {
      if (key === 'core.attachments.defaultSaveTarget') return 'downloads';
      return undefined;
    });
    const home = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
    const expected = path.join(home || '', 'Downloads');
    const result = store._resolvedTargetSaveDir();

    if (fs.existsSync(expected)) {
      expect(result).toBe(expected);
    } else {
      expect(result).toBeNull();
    }
  });

  it('zwraca lastDownloadDirectory dla target = lastUsed gdy ścieżka istnieje', () => {
    AppEnv.savedState.lastDownloadDirectory = tmpDir;
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => {
      if (key === 'core.attachments.defaultSaveTarget') return 'lastUsed';
      return undefined;
    });
    expect(store._resolvedTargetSaveDir()).toBe(tmpDir);
  });

  it('zwraca null dla lastUsed gdy ścieżka NIE istnieje (fallback do modala)', () => {
    AppEnv.savedState.lastDownloadDirectory = tmpDirNonexistent;
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => {
      if (key === 'core.attachments.defaultSaveTarget') return 'lastUsed';
      return undefined;
    });
    expect(store._resolvedTargetSaveDir()).toBeNull();
  });

  it('zwraca null dla lastUsed gdy nie ma savedState (pierwszy save)', () => {
    AppEnv.savedState.lastDownloadDirectory = undefined;
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => {
      if (key === 'core.attachments.defaultSaveTarget') return 'lastUsed';
      return undefined;
    });
    expect(store._resolvedTargetSaveDir()).toBeNull();
  });
});
