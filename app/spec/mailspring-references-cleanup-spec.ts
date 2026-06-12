/**
 * #57 — strażnik czystki odwołań mailspring/nylas/N1 (transze 1–3).
 *
 * Mandat usera (2026-06-11): odwołania do Mailspring zostają WYŁĄCZNIE tam,
 * gdzie wymaga tego GPL (atrybucja) lub zgodność wsteczna (KEEP-TECH).
 * Inwentaryzacja: analysis/57-mailspring-references-inventory.md.
 *
 * Zakres strażnika (kod produkcyjny + style; specs/fixtures wyłączone —
 * fixture'y odwzorowują realne maile świata zewnętrznego):
 *  T1: brak klas CSS `nylas-*` w stylach i komponentach (pary .less↔.tsx),
 *  T2: brak fontu 'Mailspring-Pro' (rodzina nie istnieje — silent fallback;
 *      realna rodzina to 'Nylas-Pro', jej rename = transza 5 z dual-accept
 *      w base-mark-plugins.tsx),
 *  T3: brak odwołań do produktu „N1" w kodzie/komentarzach/docs pakietów,
 *  T4: punktowe: compile-cache-ts.js (nylasHome), composer/package.json.
 *
 * Allowlist (celowe, poza zakresem transz 1–3):
 *  - 'Nylas-Pro' (rodzina fontu — transza 5; usuwana z treści przed skanem T1),
 *  - windows-updater.js komentarze o nylas.exe (layout Squirrel — weryfikacja
 *    przy pracach Windows #52; nie łapie się w żaden wzorzec T1–T3).
 */

import * as fs from 'fs';
import * as path from 'path';

const APP = path.join(__dirname, '..');
const CODE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.less', '.css', '.md', '.json'];
const EXCLUDED_DIRS = new Set(['node_modules', 'specs', 'spec', 'fixtures', 'dist']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (CODE_EXT.includes(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function scanRoots(): string[] {
  const roots = [path.join(APP, 'src'), path.join(APP, 'static', 'style')];
  for (const pkg of fs.readdirSync(path.join(APP, 'internal_packages'))) {
    const p = path.join(APP, 'internal_packages', pkg);
    if (fs.statSync(p).isDirectory()) roots.push(p);
  }
  return roots.flatMap(r => (fs.existsSync(r) ? walk(r) : []));
}

describe('#57 — czystka odwołań mailspring/nylas/N1 (strażnik transz 1–3)', () => {
  const files = scanRoots();

  it('T1: brak klas CSS nylas-* w stylach i komponentach', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8').replace(/Nylas-Pro/g, '');
      if (/nylas-/i.test(content)) offenders.push(path.relative(APP, f));
    }
    expect(offenders).toEqual([]);
  });

  it("T2: brak fontu 'Mailspring-Pro' (nieistniejąca rodzina, silent fallback)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (fs.readFileSync(f, 'utf8').includes('Mailspring-Pro')) {
        offenders.push(path.relative(APP, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('T3: brak odwołań do produktu „N1" w kodzie/komentarzach/docs', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (/\bN1\b/.test(fs.readFileSync(f, 'utf8'))) {
        offenders.push(path.relative(APP, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('T5: regexp-utils — getmailspring tylko w sekcji link-tracking (legacy unwrap)', () => {
    // Transza 4 (#57): odpakowywanie starych linków link.getmailspring.com
    // w istniejących mailach to FUNKCJA (KEEP-TECH) — komentarz + regex.
    // Przykładowe domeny w docach innych regexów nie używają brandu upstream.
    const src = fs.readFileSync(path.join(APP, 'src', 'regexp-utils.ts'), 'utf8');
    const occurrences = src.match(/getmailspring/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('T7 (#123 pkt 6): rodzina fontu ActunaMail-Pro; Nylas-Pro TYLKO jako legacy dual-accept', () => {
    // Rename rodziny @font-face Nylas-Pro -> ActunaMail-Pro. Jedyne dozwolone
    // wystąpienie 'Nylas-Pro' to detekcja isOwnHTML w base-mark-plugins.tsx —
    // JUŻ wysłane/zapisane maile mają inline font-family z legacy rodziną.
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith('base-mark-plugins.tsx')) continue;
      if (fs.readFileSync(f, 'utf8').includes('Nylas-Pro')) {
        offenders.push(path.relative(APP, f));
      }
    }
    expect(offenders).toEqual([]);
    const fontsLess = fs.readFileSync(
      path.join(APP, 'internal_packages', 'custom-fonts', 'styles', 'fonts.less'),
      'utf8'
    );
    expect(fontsLess.includes("'ActunaMail-Pro'")).toBe(true);
    const markPlugins = fs.readFileSync(
      path.join(APP, 'src', 'components', 'composer-editor', 'base-mark-plugins.tsx'),
      'utf8'
    );
    expect(markPlugins.includes('ActunaMail-Pro')).toBe(true);
    expect(markPlugins.includes('Nylas-Pro')).toBe(true);
  });

  it('T8 (#123 pkt 1): edgehill TYLKO w kodzie świadomym migracji', () => {
    // Baza nazywa się actunamail.db (migracja rename-on-start, v0.5.14).
    // 'edgehill' wolno wymieniać wyłącznie kodowi, który celowo obsługuje
    // legacy profil:
    //  - database-name-migration.ts (moduł migracji, LEGACY_DB_FILENAME),
    //  - main.js (komentarz przy wywołaniu migracji),
    //  - application.ts (_deleteDatabase sprząta TAKŻE bazę pod legacy nazwą),
    //  - action-bridge.ts (historyczny URL sentry upstream — ślad audytowy,
    //    werdykt transzy 4 #57).
    const ALLOWED = new Set([
      path.join('src', 'browser', 'database-name-migration.ts'),
      path.join('src', 'browser', 'main.js'),
      path.join('src', 'browser', 'application.ts'),
      path.join('src', 'flux', 'action-bridge.ts'),
    ]);
    const offenders: string[] = [];
    for (const f of files) {
      const rel = path.relative(APP, f);
      if (ALLOWED.has(rel)) continue;
      if (/edgehill/i.test(fs.readFileSync(f, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('T4: compile-cache-ts.js i composer/package.json bez nylas', () => {
    const compileCache = fs.readFileSync(path.join(APP, 'src', 'compile-cache-ts.js'), 'utf8');
    expect(/nylas/i.test(compileCache)).toBe(false);
    const composerPkg = fs.readFileSync(
      path.join(APP, 'internal_packages', 'composer', 'package.json'),
      'utf8'
    );
    expect(/nylas/i.test(composerPkg)).toBe(false);
  });
});
