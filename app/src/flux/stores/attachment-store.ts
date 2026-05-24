import os from 'os';
import _fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { shell } from 'electron';
import ActunaMailStore from 'actunamail-store';
import DraftStore from './draft-store';
import * as Actions from '../actions';
import { File } from '../models/file';
import * as Utils from '../models/utils';
import { localized } from '../../intl';
import { encrypt, decrypt, looksEncrypted } from '../../attachment-crypto';
import {
  generatePreview,
  canPossiblyPreviewExtension,
  displayQuickPreviewWindow,
} from '../../quickpreview';

Promise.promisifyAll(_fs);
const fs = _fs as any;

const fileAccessibleAtPath = async (filePath) => {
  try {
    await fs.accessAsync(filePath, fs.F_OK);
    return true;
  } catch (ex) {
    return false;
  }
};

export type AttachmentDownloadData = null;

class AttachmentStore extends ActunaMailStore {
  _filePreviewPaths = {};
  _filesDirectory: string = path.join(AppEnv.getConfigDirPath(), 'files');
  _lastDownloadDirectory: string;

  // Ticket 49c — attachments in files/ are encrypted at-rest (AENC format,
  // see attachment-crypto.ts). External apps (Open, drag-out, Quick Look)
  // need a real plaintext file, so we decrypt into a temp dir OUTSIDE the
  // synced profile directory. The dir is wiped on every launch.
  _decryptedTempDir: string = path.join(os.tmpdir(), 'ActunaMail-attachments');

  constructor() {
    super();

    // viewing messages
    this.listenTo(Actions.fetchFile, this._fetch);
    this.listenTo(Actions.fetchAndOpenFile, this._fetchAndOpen);
    this.listenTo(Actions.fetchAndSaveFile, this._fetchAndSave);
    // Ticket #88 — bypass-modal save actions (quick-save dropdown).
    this.listenTo(Actions.fetchAndSaveFileTo, this._fetchAndSaveFileTo);
    this.listenTo(Actions.fetchAndSaveAllFiles, this._fetchAndSaveAll);
    this.listenTo(Actions.fetchAndSaveAllFilesTo, this._fetchAndSaveAllFilesTo);
    this.listenTo(Actions.quickPreviewFile, this._quickPreviewFile);

    // sending
    this.listenTo(Actions.addAttachment, this._onAddAttachment);
    this.listenTo(Actions.selectAttachment, this._onSelectAttachment);
    this.listenTo(Actions.removeAttachment, this._onRemoveAttachment);

    fs.mkdirSync(this._filesDirectory, { recursive: true });

    // Drop any plaintext temp files left over from a previous run, then
    // recreate the (empty) temp dir for this session.
    try {
      _fs.rmSync(this._decryptedTempDir, { recursive: true, force: true });
    } catch (err) {
      // best-effort — a stale temp dir is not fatal
    }
    fs.mkdirSync(this._decryptedTempDir, { recursive: true });
  }

  // Returns a path on disk for saving the file. Note that we must account
  // for files that don't have a name and avoid returning <downloads/dir/"">
  // which causes operations to happen on the directory (badness!)
  //
  pathForFile(file: File) {
    if (!file) {
      return null;
    }
    const id = file.id.toLowerCase();
    const filePath = path.join(
      this._filesDirectory,
      id.substr(0, 2),
      id.substr(2, 2),
      id,
      file.safeDisplayName()
    );
    if (!filePath.startsWith(this._filesDirectory + path.sep)) {
      return null;
    }
    return filePath;
  }

  // Returns a path to a PLAINTEXT copy of an at-rest attachment, suitable
  // for the OS / external apps (Open, drag-out, Quick Look). Encrypted
  // (AENC) files are decrypted into the per-session temp dir; legacy
  // pre-49 plaintext files are returned as-is (no needless copy).
  // Synchronous so it can be used from the drag-start event handler.
  decryptedPathForFileSync(sourcePath: string): string {
    const stored = _fs.readFileSync(sourcePath);
    if (!looksEncrypted(stored)) {
      return sourcePath; // legacy plaintext — usable directly
    }
    const tag = crypto.createHash('sha1').update(sourcePath).digest('hex');
    const destDir = path.join(this._decryptedTempDir, tag);
    const destPath = path.join(destDir, path.basename(sourcePath));
    try {
      // reuse an already-decrypted temp file if it is up to date
      if (_fs.statSync(destPath).mtimeMs >= _fs.statSync(sourcePath).mtimeMs) {
        return destPath;
      }
    } catch (err) {
      // temp not present yet — fall through and create it
    }
    _fs.mkdirSync(destDir, { recursive: true });
    _fs.writeFileSync(destPath, decrypt(stored));
    return destPath;
  }

  getDownloadDataForFile(fileId: string): AttachmentDownloadData {
    // if we ever support downloads again, put this back
    return null;
  }

  // Returns a hash of download objects keyed by fileId
  getDownloadDataForFiles(fileIds: string[] = []) {
    const downloadData: { [fileId: string]: AttachmentDownloadData } = {};
    fileIds.forEach((fileId) => {
      downloadData[fileId] = this.getDownloadDataForFile(fileId);
    });
    return downloadData;
  }

  previewPathsForFiles(fileIds: string[] = []) {
    const previewPaths: { [fileId: string]: string } = {};
    fileIds.forEach((fileId) => {
      previewPaths[fileId] = this.previewPathForFile(fileId);
    });
    return previewPaths;
  }

  previewPathForFile(fileId: string): string {
    return this._filePreviewPaths[fileId];
  }

  async _prepareAndResolveFilePath(file: File) {
    let filePath = this.pathForFile(file);

    if (await fileAccessibleAtPath(filePath)) {
      this._ensurePreviewOfFile(file);
    } else {
      // try to find the file in the directory (it should be the only file)
      // this allows us to handle obscure edge cases where the sync engine
      // the file with an altered name.
      const dir = path.dirname(filePath);
      const items = fs.readdirSync(dir).filter((i) => i !== '.DS_Store');
      if (items.length === 1) {
        filePath = path.join(dir, items[0]);
      }
    }

    return filePath;
  }

  async _ensurePreviewOfFile(file: File) {
    if (!AppEnv.config.get('core.attachments.displayFilePreview')) {
      return;
    }
    if (!canPossiblyPreviewExtension(file)) {
      return;
    }

    // Ticket 49e — the preview is generated from a decrypted temp copy, and
    // the thumbnail itself lives in the temp dir, never in the synced files/
    // directory (a thumbnail would otherwise be a plaintext derivative of
    // the encrypted attachment). The temp dir is wiped on every launch.
    const previewPath = path.join(this._decryptedTempDir, 'previews', `${file.id}.png`);

    if (await fileAccessibleAtPath(previewPath)) {
      // If the preview file already exists, set our state and bail
      this._filePreviewPaths[file.id] = previewPath;
      this.trigger();
      return;
    }

    let sourcePath: string;
    try {
      sourcePath = this.decryptedPathForFileSync(this.pathForFile(file));
    } catch (err) {
      return; // attachment could not be decrypted — skip the preview
    }
    await _fs.promises.mkdir(path.dirname(previewPath), { recursive: true });

    // If the preview file doesn't exist yet, generate it
    if (await generatePreview({ file, filePath: sourcePath, previewPath })) {
      this._filePreviewPaths[file.id] = previewPath;
      this.trigger();
    }
  }

  // Section: Retrieval of Files

  _quickPreviewFile = (filePath: string) => {
    // Ticket 49e — filePath points at the encrypted files/ entry; the Quick
    // Look / PDF / renderer preview tools need a real plaintext file, so
    // decrypt to the temp dir first (legacy plaintext passes through).
    let previewablePath: string;
    try {
      previewablePath = this.decryptedPathForFileSync(filePath);
    } catch (err) {
      return;
    }
    displayQuickPreviewWindow(previewablePath);
  };

  _fetch = (file: File) => {
    return (
      this._prepareAndResolveFilePath(file)
        .catch(this._catchFSErrors)
        // Passively ignore
        .catch(() => {})
    );
  };

  _fetchAndOpen = (file: File) => {
    return this._prepareAndResolveFilePath(file)
      .then((filePath) => shell.openPath(this.decryptedPathForFileSync(filePath)))
      .catch(this._catchFSErrors)
      .catch((error) => {
        this._presentError({ file, error });
      });
  };

  // Copy a files/ attachment to a user-chosen external path, decrypting
  // it on the way out. Exporting to a path the user picked is intentional
  // plaintext output. Legacy pre-49 attachments (no AENC header) pass
  // through decrypt() unchanged.
  _writeToExternalPath = async (filePath: string, savePath: string) => {
    const stored = await fs.readFileAsync(filePath);
    await fs.writeFileAsync(savePath, decrypt(stored));
  };

  // Ticket #47 Tier A — when the user picked a concrete save target in
  // Preferences (Downloads / Documents / lastUsed), skip the modal and
  // write directly. 'askEveryTime' keeps the original showSaveDialog
  // flow. Collision handling uses _incrementPathToAvoidCollision (same
  // logic as the multi-file save path).
  _completeSaveToPath = (file: File, savePath: string) => {
    const newDownloadDirectory = path.dirname(savePath);
    return this._prepareAndResolveFilePath(file)
      .then((filePath) => this._writeToExternalPath(filePath, savePath))
      .then(() => {
        if (AppEnv.savedState.lastDownloadDirectory !== newDownloadDirectory) {
          AppEnv.savedState.lastDownloadDirectory = newDownloadDirectory;

          if (
            this._lastDownloadDirectory !== newDownloadDirectory &&
            AppEnv.config.get('core.attachments.openFolderAfterDownload')
          ) {
            this._lastDownloadDirectory = newDownloadDirectory;
            require('@electron/remote').shell.showItemInFolder(savePath);
          }
        }
      })
      .catch(this._catchFSErrors)
      .catch((error) => {
        this._presentError({ file, error });
      });
  };

  _fetchAndSave = (file) => {
    const defaultPath = this._defaultSavePath(file);
    const defaultExtension = path.extname(defaultPath);

    // Ticket #47 Tier A — direct save without modal when defaultSaveTarget
    // resolves to a concrete folder.
    const targetDir = this._resolvedTargetSaveDir();
    if (targetDir) {
      let externalPath = path.join(targetDir, file.safeDisplayName());
      while (fs.existsSync(externalPath)) {
        externalPath = this._incrementPathToAvoidCollision(externalPath);
      }
      this._completeSaveToPath(file, externalPath);
      return;
    }

    AppEnv.showSaveDialog({ defaultPath }, (savePath) => {
      if (!savePath) {
        return;
      }

      const saveExtension = path.extname(savePath);
      const didLoseExtension = defaultExtension !== '' && saveExtension === '';
      let actualSavePath = savePath;
      if (didLoseExtension) {
        actualSavePath += defaultExtension;
      }

      this._completeSaveToPath(file, actualSavePath);
    });
  };

  _saveAllToDir = (files: File[], dirPath: string) => {
    this._lastDownloadDirectory = dirPath;
    AppEnv.savedState.lastDownloadDirectory = dirPath;

    const seenPaths = new Set();
    const lastSavePaths: string[] = [];
    const savePromises = files.map((file) => {
      let externalPath = path.join(dirPath, file.safeDisplayName());
      while (seenPaths.has(externalPath) || fs.existsSync(externalPath)) {
        externalPath = this._incrementPathToAvoidCollision(externalPath);
      }
      seenPaths.add(externalPath);

      return this._prepareAndResolveFilePath(file)
        .then((filePath) => this._writeToExternalPath(filePath, externalPath))
        .then(() => lastSavePaths.push(externalPath));
    });

    return Promise.all(savePromises)
      .then(() => {
        if (
          lastSavePaths.length > 0 &&
          AppEnv.config.get('core.attachments.openFolderAfterDownload')
        ) {
          require('@electron/remote').shell.showItemInFolder(lastSavePaths[0]);
        }
        return lastSavePaths;
      })
      .catch(this._catchFSErrors)
      .catch((error) => {
        this._presentError({ error });
        return [];
      });
  };

  // Ticket #88 — bypass-modal single-file save to a specific directory.
  // Triggered by quick-save dropdown (favorites / Downloads / Documents).
  // Reuses _completeSaveToPath for the actual write + showItemInFolder.
  _fetchAndSaveFileTo = (file: File, dirPath: string) => {
    if (!dirPath) return;
    let externalPath = path.join(dirPath, file.safeDisplayName());
    while (fs.existsSync(externalPath)) {
      externalPath = this._incrementPathToAvoidCollision(externalPath);
    }
    this._completeSaveToPath(file, externalPath);
  };

  // Ticket #88 — bypass-modal multi-file save to a specific directory.
  _fetchAndSaveAllFilesTo = (files: File[], dirPath: string) => {
    if (!dirPath || !files || files.length === 0) return Promise.resolve([]);
    return this._saveAllToDir(files, dirPath);
  };

  _fetchAndSaveAll = (files: File[]) => {
    const defaultPath = this._defaultSaveDir();

    // Ticket #47 Tier A — direct save without modal when defaultSaveTarget
    // resolves to a concrete folder.
    const targetDir = this._resolvedTargetSaveDir();
    if (targetDir) {
      return this._saveAllToDir(files, targetDir);
    }

    return new Promise((resolve) => {
      AppEnv.showOpenDialog(
        {
          defaultPath,
          title: localized('Save Into...'),
          buttonLabel: localized('Download All'),
          properties: ['openDirectory', 'createDirectory'],
        },
        (selected) => {
          if (!selected) {
            return;
          }
          const dirPath = selected[0];
          if (!dirPath) {
            return;
          }
          this._saveAllToDir(files, dirPath).then(resolve);
        }
      );
    });
  };

  _incrementPathToAvoidCollision(attemptedPath: string) {
    const ext = path.extname(attemptedPath);
    const dir = path.dirname(attemptedPath);
    let name = path.basename(attemptedPath, ext);
    // Use " (N)" format for collision counters to avoid conflicts with filenames
    // that end with hyphen-number patterns (like dates: "report-2023.pdf")
    const match = / \((\d+)\)$/.exec(name);
    let counter = 0;
    if (match) {
      counter = Number(match[1]);
      name = name.substr(0, match.index);
    }
    return path.join(dir, `${name} (${counter + 1})${ext}`);
  }

  // Ticket #47 Tier A — resolve a concrete save directory based on the
  // user's `core.attachments.defaultSaveTarget` setting. Returns null
  // when the user explicitly wants the picker dialog ('askEveryTime'),
  // or when the resolved path does not exist on disk (fall back to the
  // existing _defaultSaveDir behaviour and let the modal handle it).
  _resolvedTargetSaveDir(): string | null {
    const target = AppEnv.config.get('core.attachments.defaultSaveTarget');
    if (!target || target === 'askEveryTime') return null;

    const home = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;

    let dir: string | null = null;
    if (target === 'downloads') {
      dir = path.join(home || '', 'Downloads');
    } else if (target === 'documents') {
      try {
        // Electron's app.getPath('documents') is cross-platform-aware
        // (Win: My Documents, macOS: ~/Documents, Linux: $XDG_DOCUMENTS_DIR
        // or ~/Documents). Available via @electron/remote.
        const remote = require('@electron/remote');
        dir = remote.app.getPath('documents');
      } catch (err) {
        dir = home ? path.join(home, 'Documents') : null;
      }
    } else if (target === 'lastUsed') {
      const last = AppEnv.savedState.lastDownloadDirectory;
      if (last && fs.existsSync(last)) return last;
      // No last-used yet → fall back to ask
      return null;
    }

    if (dir && fs.existsSync(dir)) return dir;
    return null;
  }

  _defaultSaveDir() {
    let home = '';
    if (process.platform === 'win32') {
      home = process.env.USERPROFILE;
    } else {
      home = process.env.HOME;
    }

    let downloadDir = path.join(home, 'Downloads');
    if (!fs.existsSync(downloadDir)) {
      downloadDir = os.tmpdir();
    }

    if (AppEnv.savedState.lastDownloadDirectory) {
      if (fs.existsSync(AppEnv.savedState.lastDownloadDirectory)) {
        downloadDir = AppEnv.savedState.lastDownloadDirectory;
      }
    }

    return downloadDir;
  }

  _defaultSavePath(file: File) {
    const downloadDir = this._defaultSaveDir();
    return path.join(downloadDir, file.safeDisplayName());
  }

  _presentError({ file, error }: { file?: File; error?: Error } = {}) {
    const name = file ? file.displayName() : localized('one or more files');
    const errorString = error ? error.toString() : '';

    require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      message: localized('Download Failed'),
      detail: localized(
        `Unable to download %@. Check your network connection and try again. %@`,
        name,
        errorString
      ),
      buttons: ['OK'],
    });
  }

  _catchFSErrors(error) {
    let message = null;
    if (['EPERM', 'EROFS', 'EPIPE', 'EBUSY', 'EMFILE', 'EACCES', 'UNKNOWN'].includes(error.code)) {
      message = localized(
        'ActunaMail could not save an attachment. Check that permissions are set correctly and try restarting ActunaMail if the issue persists.'
      );
    }
    if (['ENOSPC'].includes(error.code)) {
      message = localized(
        'ActunaMail could not save an attachment because you have run out of disk space.'
      );
    }

    if (message) {
      require('@electron/remote').dialog.showMessageBoxSync({
        type: 'warning',
        message: localized('Download Failed'),
        detail: `${message}\n\n${error.message}`,
        buttons: [localized('OK')],
      });
      return Promise.resolve();
    }
    return Promise.reject(error);
  }

  // Section: Adding Files

  _assertIdPresent(headerMessageId: string) {
    if (!headerMessageId) {
      throw new Error('You need to pass the headerID of the message (draft) this Action refers to');
    }
  }

  _getFileStats(filepath: string) {
    return fs
      .statAsync(filepath)
      .catch(() =>
        Promise.reject(
          new Error(`${filepath} could not be found, or has invalid file permissions.`)
        )
      );
  }

  // Copy a user-picked file into the files/ directory, encrypting it
  // at-rest (AENC). The stored ciphertext is ~33 bytes larger than the
  // input; file.size keeps the plaintext size (what the recipient gets
  // once mailsync decrypts on send).
  async _copyToInternalPath(originPath: string, targetPath: string) {
    let plain: Buffer;
    try {
      plain = await fs.readFileAsync(originPath);
    } catch (err) {
      throw new Error(`Could not read file at path: ${originPath}`);
    }
    try {
      await fs.writeFileAsync(targetPath, encrypt(plain));
    } catch (err) {
      throw new Error(`Could not write ${path.basename(targetPath)} to files directory.`);
    }
  }

  async _deleteFile(file: File) {
    // Delete the file, it's preview if present and it's containing folder. We don't
    // delete other arbitrary files in case for some reason other files are saved here.
    try {
      const filePath = this.pathForFile(file);
      await fs.unlinkAsync(filePath);
      if (await fileAccessibleAtPath(`${filePath}.png`)) {
        await fs.unlinkAsync(`${filePath}.png`);
      }
      await fs.rmdirAsync(path.dirname(filePath));
    } catch (err) {
      throw new Error(`Error deleting file file ${file.filename}:\n\n${err.message}`);
    }
  }

  async _applySessionChanges(headerMessageId: string, changeFunction) {
    const session = await DraftStore.sessionForClientId(headerMessageId);
    const files = changeFunction(session.draft().files);
    session.changes.add({ files });
  }

  // Handlers

  _onSelectAttachment = ({ headerMessageId }) => {
    this._assertIdPresent(headerMessageId);

    // When the dialog closes, it triggers `Actions.addAttachment`
    return AppEnv.showOpenDialog({ properties: ['openFile', 'multiSelections'] }, (paths) => {
      if (paths == null) {
        return;
      }
      let pathsToOpen = paths;
      if (typeof pathsToOpen === 'string') {
        pathsToOpen = [pathsToOpen];
      }

      pathsToOpen.forEach((filePath) => Actions.addAttachment({ headerMessageId, filePath }));
    });
  };

  _onAddAttachment = async ({
    headerMessageId,
    filePath,
    inline = false,
    onCreated = (file: File) => {},
  }) => {
    this._assertIdPresent(headerMessageId);

    try {
      const filename = path.basename(filePath);
      const stats = await this._getFileStats(filePath);
      if (stats.isDirectory()) {
        throw new Error(
          localized(`%@ is a directory. Try compressing it and attaching it again.`, filename)
        );
      } else if (stats.size > 25 * 1000000) {
        throw new Error(
          localized(`%@ cannot be attached because it is larger than 25MB.`, filename)
        );
      }

      const file = new File({
        id: Utils.generateTempId(),
        filename: filename,
        size: stats.size,
        contentType: null,
        messageId: null,
        contentId: inline ? Utils.generateContentId() : null,
      });

      await _fs.promises.mkdir(path.dirname(this.pathForFile(file)), { recursive: true });
      await this._copyToInternalPath(filePath, this.pathForFile(file));

      await this._applySessionChanges(headerMessageId, (files) => {
        if (files.reduce((c, f) => c + f.size, 0) >= 25 * 1000000) {
          throw new Error(localized(`Sorry, you can't attach more than 25MB of attachments`));
        }
        return files.concat([file]);
      });
      onCreated(file);
    } catch (err) {
      AppEnv.showErrorDialog(err.message);
    }
  };

  _onRemoveAttachment = async (headerMessageId: string, fileToRemove: File) => {
    if (!fileToRemove) {
      return;
    }

    await this._applySessionChanges(headerMessageId, (files) =>
      files.filter(({ id }) => id !== fileToRemove.id)
    );

    try {
      await this._deleteFile(fileToRemove);
    } catch (err) {
      AppEnv.showErrorDialog(err.message);
    }
  };
}

export default new AttachmentStore();
