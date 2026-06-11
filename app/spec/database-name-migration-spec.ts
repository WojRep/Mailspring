/**
 * #123 pkt 1 — rename bazy edgehill.db → actunamail.db z jednorazową
 * migracją rename-on-start (decyzja usera 2026-06-11: „Tak — rename
 * z migracją"). RED first per TDD.
 *
 * Kontrakt modułu app/src/browser/database-name-migration.ts:
 *  - DB_FILENAME = 'actunamail.db', LEGACY_DB_FILENAME = 'edgehill.db'
 *  - migrateLegacyDatabaseName(configDirPath) wywoływana w main procesie
 *    PRZED otwarciem DB i PRZED startem mailsync:
 *      • legacy istnieje, nowa nie → rename pliku + sufiksów -wal/-shm
 *      • nowa już istnieje → NIE dotyka niczego (też gdy legacy obok)
 *      • brak obu → no-op
 *      • zwraca { migrated, renamed[] }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let migration: any = null;
try {
  migration = require('../src/browser/database-name-migration');
} catch (e) {
  /* RED: moduł jeszcze nie istnieje */
}

function makeTmpDir(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `actunamail-dbmig-${tag}-`));
}

describe('#123 — migracja nazwy bazy edgehill.db → actunamail.db', () => {
  it('moduł database-name-migration istnieje i eksportuje kontrakt', () => {
    expect(migration).not.toBeNull();
    expect(migration.DB_FILENAME).toBe('actunamail.db');
    expect(migration.LEGACY_DB_FILENAME).toBe('edgehill.db');
    expect(typeof migration.migrateLegacyDatabaseName).toBe('function');
  });

  it('rename legacy → nowa (plik główny + -wal + -shm)', () => {
    if (!migration) return;
    const dir = makeTmpDir('rename');
    for (const suffix of ['', '-wal', '-shm']) {
      fs.writeFileSync(path.join(dir, `edgehill.db${suffix}`), `data${suffix}`);
    }
    const result = migration.migrateLegacyDatabaseName(dir);
    expect(result.migrated).toBe(true);
    for (const suffix of ['', '-wal', '-shm']) {
      expect(fs.existsSync(path.join(dir, `actunamail.db${suffix}`))).toBe(true);
      expect(fs.existsSync(path.join(dir, `edgehill.db${suffix}`))).toBe(false);
    }
    expect(fs.readFileSync(path.join(dir, 'actunamail.db'), 'utf8')).toBe('data');
  });

  it('rename bez plików WAL/SHM (czyste zamknięcie bazy)', () => {
    if (!migration) return;
    const dir = makeTmpDir('nowal');
    fs.writeFileSync(path.join(dir, 'edgehill.db'), 'data');
    const result = migration.migrateLegacyDatabaseName(dir);
    expect(result.migrated).toBe(true);
    expect(fs.existsSync(path.join(dir, 'actunamail.db'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'actunamail.db-wal'))).toBe(false);
  });

  it('nowa baza już istnieje → nic nie rusza (nawet gdy legacy obok)', () => {
    if (!migration) return;
    const dir = makeTmpDir('both');
    fs.writeFileSync(path.join(dir, 'actunamail.db'), 'new');
    fs.writeFileSync(path.join(dir, 'edgehill.db'), 'old');
    const result = migration.migrateLegacyDatabaseName(dir);
    expect(result.migrated).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'actunamail.db'), 'utf8')).toBe('new');
    expect(fs.existsSync(path.join(dir, 'edgehill.db'))).toBe(true);
  });

  it('brak obu plików → no-op (świeży profil)', () => {
    if (!migration) return;
    const dir = makeTmpDir('fresh');
    const result = migration.migrateLegacyDatabaseName(dir);
    expect(result.migrated).toBe(false);
    expect(fs.existsSync(path.join(dir, 'actunamail.db'))).toBe(false);
  });

  it('database-store używa actunamail.db (actunamail.test.db w spec mode)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'flux', 'stores', 'database-store.ts'),
      'utf8'
    );
    expect(src.includes("'actunamail.db'")).toBe(true);
    expect(src.includes("'actunamail.test.db'")).toBe(true);
    expect(src.includes("'edgehill.db'")).toBe(false);
  });

  it('mailsync (C++) otwiera actunamail.db (kontrakt obu stron)', () => {
    const cpp = fs.readFileSync(
      path.join(__dirname, '..', '..', 'mailsync', 'MailSync', 'MailStore.cpp'),
      'utf8'
    );
    expect(cpp.includes('"actunamail.db"')).toBe(true);
    expect(cpp.includes('"edgehill.db"')).toBe(false);
  });

  it('main.js wywołuje migrację przed startem aplikacji', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'browser', 'main.js'), 'utf8');
    expect(mainJs.includes('migrateLegacyDatabaseName')).toBe(true);
  });
});
