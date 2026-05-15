const Sqlite3 = require('better-sqlite3');
const dbs = {};

const deathDelay = 5000;
let deathTimer = setTimeout(() => process.exit(0), deathDelay);

function getDatabase(dbpath, dbKeyHex) {
  if (dbs[dbpath]) {
    return Promise.resolve(dbs[dbpath]);
  }

  try {
    const db = new Sqlite3(dbpath, { readonly: true, timeout: 10000 });
    // Ticket 45b: PRAGMA key FIRST (no-op against stock better-sqlite3 until
    // 45b.2 npm dep swap to better-sqlite3-multiple-ciphers; load-bearing
    // once the cipher engine lights up). dbKeyHex is hex-encoded 32 bytes
    // passed from the renderer via IPC envelope (_agentMessageEnvelope).
    if (dbKeyHex) {
      db.pragma(`key = "x'${dbKeyHex}'"`);
    }
    dbs[dbpath] = db;
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  return Promise.resolve(dbs[dbpath]);
}

process.on('message', m => {
  clearTimeout(deathTimer);
  const { query, values, id, dbpath, dbKeyHex } = m;
  const start = Date.now();

  getDatabase(dbpath, dbKeyHex).then(db => {
    clearTimeout(deathTimer);
    const fn = query.startsWith('SELECT') ? 'all' : 'run';
    const stmt = db.prepare(query);
    const results = stmt[fn](values);
    process.send({ type: 'results', results, id, agentTime: Date.now() - start });

    clearTimeout(deathTimer);
    deathTimer = setTimeout(() => process.exit(0), deathDelay);
  });
});
