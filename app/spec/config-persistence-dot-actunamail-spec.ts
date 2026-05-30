/**
 * RETROACTIVE RED spec — dot-actunamail template path (2026-05-30).
 *
 * Regression context: po rebrandzie Mailspring→ActunaMail directory
 * `app/dot-mailspring/` zostało zrenameowane do `app/dot-actunamail/`
 * (commit pre-2026-05-30). ConfigPersistenceManager szukał starej ścieżki
 * → ENOENT crash przy fresh config init.
 *
 * Fix: `app/src/browser/config-persistence-manager.ts:34,54` —
 * path.join(resourcePath, 'dot-actunamail').
 *
 * Test (filesystem-based, deterministic) zapewnia że:
 *   1. ConfigPersistenceManager używa 'dot-actunamail' (NIE 'dot-mailspring')
 *   2. Katalog `app/dot-actunamail/` istnieje (template assets shipped)
 *   3. Stary `app/dot-mailspring/` nie istnieje (rebrand complete)
 */

import * as fs from 'fs';
import * as path from 'path';

describe('config-persistence dot-actunamail rebrand (retro-RED #fix-2026-05-30)', () => {
  const managerPath = path.join(__dirname, '..', 'src', 'browser', 'config-persistence-manager.ts');
  const appRoot = path.join(__dirname, '..');

  it('ConfigPersistenceManager references dot-actunamail (NOT dot-mailspring)', () => {
    const src = fs.readFileSync(managerPath, 'utf8');
    expect(src).toMatch(/dot-actunamail/);
    expect(src).not.toMatch(/['"]dot-mailspring['"]/);
  });

  it('app/dot-actunamail/ directory exists (template assets shipped)', () => {
    expect(fs.existsSync(path.join(appRoot, 'dot-actunamail'))).toBe(true);
  });

  it('app/dot-actunamail/config.json template exists', () => {
    expect(fs.existsSync(path.join(appRoot, 'dot-actunamail', 'config.json'))).toBe(true);
  });

  it('app/dot-mailspring/ NIE istnieje (rebrand complete)', () => {
    expect(fs.existsSync(path.join(appRoot, 'dot-mailspring'))).toBe(false);
  });
});
