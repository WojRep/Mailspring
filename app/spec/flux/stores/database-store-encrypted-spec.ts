import KeyManager from '../../../src/key-manager';

// Ticket 45 sub-faza 45b — DatabaseStore + database-agent.js PRAGMA key
// injection. Verifies that the database-store's openDatabase path calls
// `KeyManager.getDBKey()` and pragma's the key BEFORE any other pragma
// (journal_mode, page_size, etc.) on the SQLite connection.
//
// Note on test scope: 45b ships the JS-side WIRING. The actual
// encryption-at-rest behavior requires better-sqlite3-multiple-ciphers
// (45b.2 npm dep swap) plus mailsync SQLCipher amalgamation (45d).
// Until then, PRAGMA key against stock better-sqlite3 is a no-op
// (returns OK silently). This spec asserts the call ORDER and DATA
// FLOW, not the cryptographic outcome.

describe('database-store encryption wiring (ticket 45b)', function databaseStoreEncryptedSpec() {
  describe('openDatabase pragma ordering', () => {
    it('calls KeyManager.getDBKey() and injects PRAGMA key first', () => {
      const fakeKey = Buffer.alloc(32, 0x99);
      // getDBKey() is synchronous — returns the Buffer directly.
      const getDBKeySpy = spyOn(KeyManager as any, 'getDBKey').andReturn(fakeKey);

      // Capture all pragma calls on a dummy db
      const pragmaCalls: string[] = [];
      const dummyDb = {
        pragma: (sql: string) => {
          pragmaCalls.push(sql);
          return [];
        },
      };

      // Call the production opener (exported by 45b)
      const { _openWithEncryption } = require('../../../src/flux/stores/database-store');
      _openWithEncryption(dummyDb);

      // Order check: PRAGMA key must come first, before journal_mode/page_size/etc.
      expect(getDBKeySpy).toHaveBeenCalled();
      expect(pragmaCalls.length).toBeGreaterThan(0);
      expect(pragmaCalls[0]).toMatch(/^key\s*=/i);
      // The key payload must be hex-encoded (SQLCipher convention: x'...')
      expect(pragmaCalls[0]).toContain(fakeKey.toString('hex'));
    });

    it('passes hex-encoded key, not raw bytes', () => {
      const fakeKey = Buffer.alloc(32, 0xab);
      spyOn(KeyManager as any, 'getDBKey').andReturn(fakeKey);
      const pragmaCalls: string[] = [];
      const dummyDb = {
        pragma: (sql: string) => {
          pragmaCalls.push(sql);
          return [];
        },
      };
      const { _openWithEncryption } = require('../../../src/flux/stores/database-store');
      _openWithEncryption(dummyDb);
      // hex of 32 0xAB bytes is 64 char "ab" repeats
      expect(pragmaCalls[0]).toMatch(/[a-f0-9]{64}/);
      // No raw Buffer.toString() leakage
      expect(pragmaCalls[0]).not.toMatch(/Buffer/);
    });
  });

  describe('agent message envelope', () => {
    it('includes dbKeyHex when sending queries to background agent', () => {
      // 45b adds dbKeyHex to the {query, values, id, dbpath} envelope
      // that DatabaseStore._executeInBackground sends via _agent.send().
      // The agent uses it on first DB open before any query runs.
      //
      // This assertion locks in the message contract so a future
      // refactor cannot silently drop the key.
      const { _agentMessageEnvelope } = require('../../../src/flux/stores/database-store');
      const fakeKey = Buffer.alloc(32, 0x77);
      const envelope = _agentMessageEnvelope({
        query: 'SELECT 1',
        values: [],
        id: 'abc',
        dbpath: '/tmp/x.db',
        dbKey: fakeKey,
      });
      expect(envelope.dbKeyHex).toBe(fakeKey.toString('hex'));
      expect(envelope.query).toBe('SELECT 1');
      expect(envelope.dbpath).toBe('/tmp/x.db');
    });
  });
});
