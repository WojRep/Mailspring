/**
 * RED spec — Wave 3-8 packages MUSZĄ mieć windowTypes (regression guard 2026-05-30).
 *
 * Regression context (verbatim user 2026-05-30): "Nie widzę możliwości
 * dodawania tagów, ustawień wazności emaili czy punktu skupienia dla nich".
 * Root cause: 6 Wave 3-8 packages bez `windowTypes` w package.json →
 * Mailspring/ActunaMail PackageManager NIE ładuje ich w żadnym oknie →
 * activate() nigdy nie odpalane → ComponentRegistry pusty dla tych slotów →
 * UI niewidoczne w produkcji mimo że feature ZA-shipowane.
 *
 * Guard: każdy Wave 3-8 internal_package MUSI mieć `windowTypes.default = true`
 * (lub explicit subset). Brak windowTypes = brak ładowania.
 */

import * as fs from 'fs';
import * as path from 'path';

const WAVE_3_8_PACKAGES = [
  'tag-system',              // #98
  'priority-inbox-pin',      // #93
  'akcje-seryjne',           // #101
  'snooze',                  // #104
  'audit-log',               // #114
  'bulk-unsubscribe',        // #115
  'centrum-dnia',            // #95
  'cleaning-suggestions',    // #116
  'contact-card',            // #102
  'follow-up',               // #106
  'keyboard-mapping',        // #109
  'markdown-composer',       // #107
  'mention-picker',          // #108
  'onboarding-tutorial',     // #110
  'pgp-smime',               // #112
  'rodo-consent',            // #113
  'threading-tree',          // #25 extras
  'time-intent-tags',        // #13
  'tracker-blocker',         // #111
  'smart-folder',            // #99
  'rule-builder',            // #100
];

describe('Wave 3-8 package windowTypes guard (regression 2026-05-30 podwójny user-report)', () => {
  const packagesRoot = path.join(__dirname, '..', 'internal_packages');

  WAVE_3_8_PACKAGES.forEach(pkgName => {
    it(`${pkgName} package.json ma windowTypes.default = true`, () => {
      const pkgJsonPath = path.join(packagesRoot, pkgName, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) {
        // Pominięcie — nie wymuszamy istnienia, ale jeśli istnieje to MUSI mieć windowTypes.
        pending(`${pkgName} not present in internal_packages (acceptable — feature may be deferred)`);
        return;
      }
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      expect(pkgJson.windowTypes).toBeDefined();
      expect(pkgJson.windowTypes.default).toBe(true);
    });
  });
});
