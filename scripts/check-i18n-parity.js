// Egzekwuje politykę językową Actuny:
//   - PL i EN musi mieć identyczny zestaw kluczy (główne języki — równorzędne pokrycie).
//   - Fork-only stringi (klucze nieobecne w upstream en.json) muszą występować w
//     en/pl/de/es/uk (główne + opcjonalne).
//
// Polityka: analysis/11-pl-translations-coverage.md, sekcja 9.3 w findings.md.

const fs = require('fs');
const path = require('path');

// LANG_DIR_OVERRIDE allows the test harness (app/spec/services/
// check-i18n-parity-spec.ts) to point the script at a temp fixture
// without touching the real app/lang/*.json files. Production runs
// (npm run lint-i18n) use the default app/lang path.
const LANG_DIR = process.env.LANG_DIR_OVERRIDE || path.join(__dirname, '..', 'app', 'lang');
const MAIN = ['en', 'pl'];
const OPTIONAL = ['de', 'es', 'uk'];

function load(lang) {
  return JSON.parse(fs.readFileSync(path.join(LANG_DIR, `${lang}.json`), 'utf8'));
}

function diff(aKeys, bKeys) {
  const setB = new Set(bKeys);
  return aKeys.filter((k) => !setB.has(k));
}

function checkParity(langA, langB) {
  const a = Object.keys(load(langA));
  const b = Object.keys(load(langB));
  const missingInB = diff(a, b);
  const missingInA = diff(b, a);
  return { missingInB, missingInA, sizeA: a.length, sizeB: b.length };
}

let failures = 0;

const en = load('en');
const pl = load('pl');
const enKeys = new Set(Object.keys(en));
const plKeys = new Set(Object.keys(pl));

// 1. PL == EN parity (główne języki — równorzędne)
const missingInPl = [...enKeys].filter((k) => !plKeys.has(k));
const missingInEn = [...plKeys].filter((k) => !enKeys.has(k));

if (missingInPl.length || missingInEn.length) {
  failures += 1;
  console.error(`[FAIL] EN ↔ PL parity (main languages must be equal):`);
  if (missingInPl.length) {
    console.error(`  ${missingInPl.length} key(s) in en.json missing in pl.json:`);
    missingInPl.slice(0, 10).forEach((k) => console.error(`    - ${JSON.stringify(k)}`));
    if (missingInPl.length > 10) console.error(`    ... and ${missingInPl.length - 10} more`);
  }
  if (missingInEn.length) {
    console.error(`  ${missingInEn.length} fork-only key(s) in pl.json missing in en.json:`);
    missingInEn.slice(0, 10).forEach((k) => console.error(`    - ${JSON.stringify(k)}`));
    if (missingInEn.length > 10) console.error(`    ... and ${missingInEn.length - 10} more`);
    console.error(
      `  HINT: format-localizations.js will DELETE these from pl.json on next run unless added to en.json (via callsite scan).`
    );
  }
} else {
  console.log(`[OK]   EN ↔ PL parity: ${enKeys.size} keys each.`);
}

// 2. Fork-only keys (in pl.json but not in upstream en.json) must also be in DE/ES/UK
const forkOnly = [...plKeys].filter((k) => !enKeys.has(k));
if (forkOnly.length) {
  for (const lang of OPTIONAL) {
    const opt = new Set(Object.keys(load(lang)));
    const missing = forkOnly.filter((k) => !opt.has(k));
    if (missing.length) {
      failures += 1;
      console.error(
        `[FAIL] Fork-only stringi muszą być też w ${lang}.json: ${missing.length} brakuje`
      );
      missing.slice(0, 5).forEach((k) => console.error(`    - ${JSON.stringify(k)}`));
      if (missing.length > 5) console.error(`    ... and ${missing.length - 5} more`);
    } else {
      console.log(`[OK]   Fork-only keys present in ${lang}.json (${forkOnly.length} keys).`);
    }
  }
} else {
  console.log(`[INFO] No fork-only keys in pl.json (nothing to propagate to DE/ES/UK).`);
}

// 3. Wartości polskich kluczy nie powinny być identyczne z angielskimi (z wyjątkami)
//    To jest INFO (warning), nie FAIL — niektóre stringi to zamierzone same-as-english
//    (np. "Port", "Spam", "PDF", "GitHub").
const allowedSameAsEn = new Set(['Port', 'Spam', 'PDF', 'YouTube']);
const sameAsEn = [];
for (const [k, vEn] of Object.entries(en)) {
  const vPl = pl[k];
  if (vPl !== undefined && vPl === vEn && !allowedSameAsEn.has(k) && k.length > 2) {
    sameAsEn.push(k);
  }
}
if (sameAsEn.length) {
  console.log(
    `[INFO] ${sameAsEn.length} klucz(e/y) PL ma wartość identyczną z EN (możliwe nieprzetłumaczone — review zalecany):`
  );
  sameAsEn.slice(0, 5).forEach((k) => console.log(`    - ${JSON.stringify(k)}`));
  if (sameAsEn.length > 5) console.log(`    ... and ${sameAsEn.length - 5} more`);
}

if (failures) {
  console.error(`\n${failures} polityka(y) złamana — fix wymagany.`);
  process.exit(1);
}
console.log(`\nPolityka językowa OK.`);
