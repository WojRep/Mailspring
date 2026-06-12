/**
 * #123 pkt 1 — jednorazowa migracja nazwy bazy edgehill.db → actunamail.db.
 *
 * `edgehill.db` to wewnętrzna nazwa z czasów Nylas. Decyzja usera
 * (2026-06-11): rename z migracją. Nazwę pliku konstruują DWIE strony:
 * renderer (database-store.ts) i C++ mailsync (MailStore.cpp z env
 * CONFIG_DIR_PATH) — obie zmienione synchronicznie na DB_FILENAME.
 *
 * Wywoływana w main procesie zaraz po setupConfigDir() — PRZED otwarciem
 * bazy przez renderer i PRZED startem mailsync, więc rename jest bezpieczny
 * (żaden proces nie trzyma uchwytu). Pliki -wal/-shm wędrują razem z bazą
 * (niedomknięty WAL z poprzedniej sesji musi zostać przy swojej bazie).
 *
 * Gdy actunamail.db już istnieje, nie ruszamy niczego — także zalegającej
 * edgehill.db (nie nadpisujemy nowszej bazy starą; zostaje do ręcznego
 * sprzątnięcia).
 */

import fs from 'fs';
import path from 'path';

export const DB_FILENAME = 'actunamail.db';
export const LEGACY_DB_FILENAME = 'edgehill.db';

const SUFFIXES = ['', '-wal', '-shm'];

export function migrateLegacyDatabaseName(configDirPath: string): {
  migrated: boolean;
  renamed: string[];
} {
  const renamed: string[] = [];

  if (fs.existsSync(path.join(configDirPath, DB_FILENAME))) {
    return { migrated: false, renamed };
  }
  if (!fs.existsSync(path.join(configDirPath, LEGACY_DB_FILENAME))) {
    return { migrated: false, renamed };
  }

  for (const suffix of SUFFIXES) {
    const from = path.join(configDirPath, LEGACY_DB_FILENAME + suffix);
    const to = path.join(configDirPath, DB_FILENAME + suffix);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.renameSync(from, to);
      renamed.push(path.basename(to));
    }
  }

  return { migrated: renamed.length > 0, renamed };
}
