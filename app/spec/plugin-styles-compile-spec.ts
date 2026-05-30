/**
 * Pre-build regression: każdy plugin .less file MUSI kompilować się przez
 * produkcyjny Less.js bez błędów.
 *
 * Why: Jasmine unit suite + Playwright dev-mode e2e NIE walidują kompilacji
 * LESS bo używają lazy electron-compile path. Production npm run build używa
 * pełnego Less.js precompile (strictszy). Konkretna pułapka: CSS native
 * `min(620px, 94vw)` — Less.js intercepts jako własną funkcję `min` i
 * próbuje porównać px z vw → "incompatible types" error → modal "Error
 * compiling Less stylesheet" w runtime + app freezes.
 *
 * Ten spec wymusza coverage dla wszystkich plugin LESS files przed merge.
 */

import fs from 'fs';
import path from 'path';

// CommonJS require — less ma multiple export shapes (node vs browser).
const less = require('less');

const APP_ROOT = path.join(__dirname, '..');
const INTERNAL_PACKAGES = path.join(APP_ROOT, 'internal_packages');
const UI_VARIABLES_PATH = path.join(APP_ROOT, 'static', 'style', 'base');

function findLessFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try { stat = fs.statSync(full); } catch (e) { continue; }
    if (stat.isDirectory()) {
      // skip node_modules wewnątrz plugin'u
      if (entry === 'node_modules') continue;
      results.push(...findLessFiles(full));
    } else if (entry.endsWith('.less')) {
      results.push(full);
    }
  }
  return results;
}

describe('Plugin LESS files — production Less.js compile check', () => {
  // Scope: Wave 1 + Wave 2 plugin styles + any future plugin styles which
  // declare only `@import "ui-variables";` jako external dep. Themes
  // (ui-dark, ui-darkside, ui-taiga, ui-ubuntu) + plugins z partial-file
  // imports (composer/buttons.less etc.) wymagają full theme stack do
  // resolve — NIE są standalone compile candidates i mają osobny pathway w
  // production build (themes manager loaduje je z own context).
  const PLUGINS_TO_VALIDATE = [
    // Wave 1
    'actuna-glass',
    'command-palette',
    'priority-inbox-pin',
    'tag-system',
    // Wave 2
    'snooze',
    'smart-folder',
    'rule-builder',
  ];

  const allLess: string[] = [];
  for (const pkg of PLUGINS_TO_VALIDATE) {
    const stylesDir = path.join(INTERNAL_PACKAGES, pkg, 'styles');
    try {
      if (fs.statSync(stylesDir).isDirectory()) {
        allLess.push(...findLessFiles(stylesDir));
      }
    } catch (e) { /* package without styles dir = OK */ }
  }

  it(`finds at least 5 plugin LESS files (sanity)`, () => {
    expect(allLess.length).toBeGreaterThan(5);
  });

  allLess.forEach(filePath => {
    const rel = path.relative(APP_ROOT, filePath);
    it(`compiles ${rel}`, async () => {
      const src = fs.readFileSync(filePath, 'utf-8');
      let renderError: any = null;
      try {
        await less.render(src, {
          paths: [
            UI_VARIABLES_PATH,
            path.join(APP_ROOT, 'static'),
            path.dirname(filePath),
          ],
          // strictMath: true byłoby idealne, ale Mailspring base.less używa
          // implicit math w wielu miejscach — pozostań przy default permissive.
        });
      } catch (e) {
        renderError = e;
      }
      if (renderError) {
        // Surface meaningful error message — Jasmine 1.x has no global `fail()`,
        // attach a synthetic actual message via expect failure.
        const line = (renderError as any).line;
        const msg = (renderError as any).message || String(renderError);
        expect(`COMPILE_ERROR ${rel}:${line} — ${msg}`).toBe('OK');
      } else {
        expect(true).toBe(true);
      }
    });
  });
});
