/**
 * RETROACTIVE RED spec — Tier B bypass safeStorage gate (2026-05-30).
 *
 * Regression context: macOS 26.5 Sequoia ad-hoc signed apps NIE mają dostępu
 * do safeStorage backend (Apple security tightening dla unsigned apps).
 * verifySafeStorageBackend() refuse-to-start blokował legitimate Tier B
 * users (password-based DBKey unwrap via Argon2, KEYCHAIN-NIEZALEŻNE).
 *
 * Fix: `app/src/browser/main.js:404-418` — sprawdza istnienie
 * db-key.tierb.enc PRZED verifySafeStorageBackend; gdy exists → skip gate.
 * Tier A users (Keychain-dependent) NADAL muszą przejść gate.
 *
 * Test (source-based, deterministic) zapewnia że bypass logic istnieje
 * i jest poprawnie warunkowy.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('main.js Tier B safeStorage bypass (retro-RED #fix-2026-05-30)', () => {
  const mainPath = path.join(__dirname, '..', 'src', 'browser', 'main.js');
  let src: string;

  beforeEach(() => {
    src = fs.readFileSync(mainPath, 'utf8');
  });

  it('checks db-key.tierb.enc existence przed verifySafeStorageBackend', () => {
    expect(src).toMatch(/tierBKeyPath\s*=\s*path\.join\(options\.configDirPath,\s*['"]db-key\.tierb\.enc['"]\)/);
    expect(src).toMatch(/const\s+hasTierB\s*=\s*fs\.existsSync\(tierBKeyPath\)/);
  });

  it('safeStorage gate jest warunkowy — uruchamia się TYLKO gdy !hasTierB', () => {
    expect(src).toMatch(/if\s*\(\s*!hasTierB\s*\)\s*\{[\s\S]*?verifySafeStorageBackend/);
  });

  it('Tier B users dostają fallback instruction w error dialog', () => {
    expect(src).toMatch(/copy\s+db-key\.tierb\.enc\s+to:/);
  });

  it('zachowane comment wyjaśniające intent (Apple Sequoia ad-hoc signed restriction)', () => {
    expect(src).toMatch(/ad-hoc signed|Sequoia|safeStorage|Tier B/);
  });
});
