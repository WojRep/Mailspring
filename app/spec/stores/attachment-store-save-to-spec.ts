import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Ticket #88 — AttachmentStore._fetchAndSaveFileTo + _fetchAndSaveAllFilesTo.
 *
 * Bypass-modal save paths used by quick-save dropdown (context menu w
 * AttachmentItem). Sprawdzamy że:
 *   - file path resolved przez _completeSaveToPath (no showSaveDialog)
 *   - kolizja nazw obsłużona przez _incrementPathToAvoidCollision
 *   - pusty dirPath / brak files → no-op (defensywne)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AttachmentStoreModule = require('../../src/flux/stores/attachment-store');
const AttachmentStore = AttachmentStoreModule.default || AttachmentStoreModule;

function fakeFile(name: string) {
  return {
    id: 'file-' + name,
    safeDisplayName: () => name,
    displayName: () => name,
  };
}

describe('AttachmentStore — fetchAndSaveFileTo (ticket #88)', () => {
  let store: any;
  let tmpDir: string;

  beforeEach(() => {
    store = AttachmentStore;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-88-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // best effort
    }
  });

  it('_fetchAndSaveFileTo: no-op gdy dirPath pusty', () => {
    spyOn(store, '_completeSaveToPath');
    store._fetchAndSaveFileTo(fakeFile('a.pdf'), '');
    expect(store._completeSaveToPath).not.toHaveBeenCalled();
  });

  it('_fetchAndSaveFileTo: wywołuje _completeSaveToPath z target dir/filename', () => {
    spyOn(store, '_completeSaveToPath');
    const file = fakeFile('a.pdf');
    store._fetchAndSaveFileTo(file, tmpDir);
    expect(store._completeSaveToPath).toHaveBeenCalled();
    const args = (store._completeSaveToPath as any).mostRecentCall.args;
    expect(args[0]).toBe(file);
    expect(args[1]).toBe(path.join(tmpDir, 'a.pdf'));
  });

  it('_fetchAndSaveFileTo: zwiększa licznik kolizji gdy plik istnieje', () => {
    spyOn(store, '_completeSaveToPath');
    fs.writeFileSync(path.join(tmpDir, 'a.pdf'), '');
    store._fetchAndSaveFileTo(fakeFile('a.pdf'), tmpDir);
    const args = (store._completeSaveToPath as any).mostRecentCall.args;
    expect(args[1]).toBe(path.join(tmpDir, 'a (1).pdf'));
  });

  it('_fetchAndSaveAllFilesTo: no-op gdy brak files', () => {
    spyOn(store, '_saveAllToDir');
    store._fetchAndSaveAllFilesTo([], tmpDir);
    expect(store._saveAllToDir).not.toHaveBeenCalled();
  });

  it('_fetchAndSaveAllFilesTo: deleguje do _saveAllToDir gdy są pliki', () => {
    spyOn(store, '_saveAllToDir').andReturn(Promise.resolve([]));
    const files = [fakeFile('a.pdf'), fakeFile('b.pdf')];
    store._fetchAndSaveAllFilesTo(files, tmpDir);
    expect(store._saveAllToDir).toHaveBeenCalledWith(files, tmpDir);
  });
});
