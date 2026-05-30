/**
 * RETROACTIVE RED spec — LESS min() / max() Less.js conflict (2026-05-30).
 *
 * Regression context: production build crashed z "incompatible types" gdy
 * .less files używały min(620px, 94vw). Less.js precompile (production-mode,
 * stricter niż dev-mode) parse-konfliktuje Less native min() z CSS min().
 *
 * Fix: zamiana min(620px, 94vw) → width: 94vw; max-width: 620px;
 * (CSS equivalent bez Less precompile conflict).
 *
 * Test (source-based, lint) zapewnia że NONE z naszych Wave 3-8 .less files
 * NIE zawiera surowych `min(<dimensional>, <dimensional>)` calls które by
 * triggered Less.js conflict w production build.
 */

import * as fs from 'fs';
import * as path from 'path';

function findLessFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.less')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

describe('LESS min()/max() Less.js conflict (retro-RED #fix-2026-05-30)', () => {
  const packagesDir = path.join(__dirname, '..', 'internal_packages');

  it('NO Wave 3-8 .less file używa min(<dimensional>, <dimensional>) (Less.js conflict)', () => {
    const lessFiles = findLessFiles(packagesDir);
    const offenders: string[] = [];
    // Matches CSS min() with dimensional args: min(620px, 94vw) etc.
    // We intentionally allow var(--x) inside since those are safe per Less.js.
    const badPattern = /\bmin\s*\(\s*\d+(\.\d+)?(px|vw|vh|em|rem|%)\s*,\s*\d+(\.\d+)?(px|vw|vh|em|rem|%)\s*\)/;
    for (const file of lessFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (badPattern.test(content)) {
        offenders.push(path.relative(packagesDir, file));
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `LESS files using min(Xpx, Xvw) pattern (Less.js production-mode conflict):\n  - ` +
        offenders.join('\n  - ') +
        '\n\nFix: replace with `width: <smaller>; max-width: <larger>;` (CSS equivalent).'
      );
    }
    expect(offenders.length).toBe(0);
  });

  it('smart-folder.less używa max-width pattern (post-fix sentinel)', () => {
    const file = path.join(packagesDir, 'smart-folder', 'styles', 'smart-folder.less');
    if (!fs.existsSync(file)) {
      pending('smart-folder.less not present yet');
      return;
    }
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toMatch(/width:\s*94vw/);
    expect(content).toMatch(/max-width:\s*620px/);
    expect(content).not.toMatch(/min\(\s*620px\s*,\s*94vw\s*\)/);
  });
});
