import { protocol } from 'electron';
import fs from 'fs';
import path from 'path';
import { decrypt } from '../attachment-crypto';

// Ticket 49d — serves inline email-image attachments to the message-body
// iframe over the custom `actuna-attachment://` scheme.
//
// Attachment files in files/ are encrypted at-rest (AENC — tickets 49b/49c).
// An <img src="cid:..."> in an email body is rewritten by
// message-item-body.tsx to `actuna-attachment://file/<fileId>`; this handler
// resolves the fileId to the on-disk file, decrypts it IN MEMORY and hands
// the plaintext to the iframe — no decrypted copy ever touches disk. Legacy
// pre-49 plaintext attachments pass through decrypt() unchanged.
//
// The scheme is declared privileged in browser/main.js (registerSchemesAs-
// Privileged) and allowed in img-src by the CSP in app/static/index.html.

const MIME_BY_EXT: { [ext: string]: string } = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

export default class ActunaAttachmentProtocolHandler {
  _filesDirectory: string;

  constructor({ configDirPath }: { configDirPath: string }) {
    this._filesDirectory = path.join(configDirPath, 'files');
    this.registerProtocol();
  }

  // Resolve files/<id[0:2]>/<id[2:4]>/<id>/ to the single attachment file it
  // holds, ignoring .DS_Store and generated <name>.png preview thumbnails.
  _resolveFilePath(fileId: string): string | null {
    const id = fileId.toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id) || id.includes('..') || id.length < 4) {
      return null;
    }
    const dir = path.join(this._filesDirectory, id.substr(0, 2), id.substr(2, 2), id);
    if (!dir.startsWith(this._filesDirectory + path.sep)) {
      return null;
    }
    let entries: string[];
    try {
      entries = fs.readdirSync(dir).filter((e) => e !== '.DS_Store');
    } catch (e) {
      return null; // directory missing
    }
    // A preview thumbnail is "<attachment-name>.png" — drop it if the file it
    // previews is also present, so it is not mistaken for the attachment.
    const previews = new Set(
      entries.filter((e) => e.endsWith('.png') && entries.includes(e.slice(0, -4)))
    );
    const candidates = entries.filter((e) => !previews.has(e));
    if (candidates.length !== 1) {
      return null; // empty or ambiguous
    }
    return path.join(dir, candidates[0]);
  }

  registerProtocol() {
    protocol.handle('actuna-attachment', (request) => {
      let fileId: string;
      try {
        // URL form: actuna-attachment://file/<fileId>
        fileId = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
      } catch (e) {
        return new Response('Bad Request', { status: 400 });
      }
      const filePath = this._resolveFilePath(fileId);
      if (!filePath) {
        return new Response('Not Found', { status: 404 });
      }
      let plain: Buffer;
      try {
        plain = decrypt(fs.readFileSync(filePath));
      } catch (e) {
        // wrong key / tampered ciphertext / read error
        return new Response('Unavailable', { status: 500 });
      }
      const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return new Response(plain, { status: 200, headers: { 'Content-Type': mime } });
    });
  }
}
