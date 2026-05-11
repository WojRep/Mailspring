import { execFileSync, ExecFileSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Ticket 42 — Retroactive TDD coverage for v0.2.h
// scripts/check-i18n-parity.js. The script was added during Sprint 5
// (commit 4f1dd2fe7) WITHOUT a test. It encodes a 3-rule policy
// (EN↔PL parity, fork-only propagation to DE/ES/UK, identity-value
// warning) and exits non-zero on violation, so it WILL block CI when
// wired up.
//
// Strategy: spec spawns the script as a subprocess with
// LANG_DIR_OVERRIDE pointing at a controlled fixture directory, and
// asserts exit code + stderr/stdout contents. This mirrors the way
// the script runs in production (npm run lint-i18n).

const SCRIPT_PATH = path.resolve(__dirname, '..', '..', '..', 'scripts', 'check-i18n-parity.js');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function makeFixture(files: Record<string, Record<string, string>>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actuna-i18n-spec-'));
  for (const [lang, data] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, `${lang}.json`), JSON.stringify(data, null, 2), 'utf8');
  }
  return dir;
}

function runParityCheck(langDir: string): RunResult {
  const opts: ExecFileSyncOptions = {
    env: { ...process.env, LANG_DIR_OVERRIDE: langDir },
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  try {
    const stdout = execFileSync('node', [SCRIPT_PATH], opts) as unknown as string;
    return { status: 0, stdout, stderr: '' };
  } catch (e: any) {
    return {
      status: e.status ?? -1,
      stdout: (e.stdout ?? '').toString(),
      stderr: (e.stderr ?? '').toString(),
    };
  }
}

describe('check-i18n-parity', function parityScriptSpec() {
  let createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    createdDirs = [];
  });

  describe('rule 1 — EN ↔ PL parity (main languages)', () => {
    it('passes when EN and PL have identical key sets', () => {
      const dir = makeFixture({
        en: { Hello: 'Hello', World: 'World' },
        pl: { Hello: 'Cześć', World: 'Świat' },
        de: { Hello: 'Hallo', World: 'Welt' },
        es: { Hello: 'Hola', World: 'Mundo' },
        uk: { Hello: 'Привіт', World: 'Світ' },
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('EN ↔ PL parity');
      expect(result.stdout).toContain('Polityka językowa OK');
    });

    it('fails when PL is missing keys present in EN', () => {
      const dir = makeFixture({
        en: { Hello: 'Hello', World: 'World', Goodbye: 'Goodbye' },
        pl: { Hello: 'Cześć', World: 'Świat' }, // missing Goodbye
        de: {}, es: {}, uk: {},
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('FAIL');
      expect(result.stderr).toContain('parity');
    });

    it('fails when EN is missing fork-only keys present in PL', () => {
      const dir = makeFixture({
        en: { Hello: 'Hello' },
        pl: { Hello: 'Cześć', ActunaSpecific: 'Specyficzne dla Actuny' },
        de: { Hello: 'Hallo', ActunaSpecific: 'Actuna spezifisch' },
        es: { Hello: 'Hola', ActunaSpecific: 'Específico de Actuna' },
        uk: { Hello: 'Привіт', ActunaSpecific: 'Специфічне для Actuna' },
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('fork-only');
    });
  });

  describe('rule 2 — Fork-only keys must propagate to DE/ES/UK', () => {
    it('fails when fork-only PL key is missing in DE', () => {
      const dir = makeFixture({
        en: { Hello: 'Hello', ActunaSpecific: 'Specific' },
        pl: { Hello: 'Cześć', ActunaSpecific: 'Specyficzne dla Actuny' },
        de: { Hello: 'Hallo' }, // missing ActunaSpecific
        es: { Hello: 'Hola', ActunaSpecific: 'Específico' },
        uk: { Hello: 'Привіт', ActunaSpecific: 'Специфічне' },
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/de\.json/);
    });

    it('reports missing keys in all 3 optional languages independently', () => {
      const dir = makeFixture({
        en: { Hello: 'Hello', ActunaSpecific: 'Specific' },
        pl: { Hello: 'Cześć', ActunaSpecific: 'Specyficzne' },
        de: { Hello: 'Hallo' }, // missing
        es: { Hello: 'Hola' }, // missing
        uk: { Hello: 'Привіт' }, // missing
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/de\.json/);
      expect(result.stderr).toMatch(/es\.json/);
      expect(result.stderr).toMatch(/uk\.json/);
    });
  });

  describe('rule 3 — Identity-value PL flagged as INFO', () => {
    it('warns when PL value equals EN value', () => {
      const dir = makeFixture({
        en: { LongerKey: 'LongerKey' },
        pl: { LongerKey: 'LongerKey' }, // identity — not translated
        de: { LongerKey: 'LongerKey' },
        es: { LongerKey: 'LongerKey' },
        uk: { LongerKey: 'LongerKey' },
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      // Identity is INFO, not FAIL — script still exits 0
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('identyczn');
    });

    it('does not flag whitelisted same-as-EN values (Port, Spam, PDF, YouTube)', () => {
      const dir = makeFixture({
        en: { Port: 'Port', Spam: 'Spam' },
        pl: { Port: 'Port', Spam: 'Spam' },
        de: { Port: 'Port', Spam: 'Spam' },
        es: { Port: 'Port', Spam: 'Spam' },
        uk: { Port: 'Port', Spam: 'Spam' },
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(0);
      // Whitelisted entries shouldn't bump the "n keys identical" count
      // above 0; the INFO line should NOT appear at all in this fixture.
      expect(result.stdout).not.toContain('identyczn');
    });

    it('ignores very short keys (length <= 2)', () => {
      const dir = makeFixture({
        en: { OK: 'OK' },
        pl: { OK: 'OK' },
        de: { OK: 'OK' },
        es: { OK: 'OK' },
        uk: { OK: 'OK' },
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('identyczn');
    });
  });

  describe('exit code contract', () => {
    it('returns exit code 0 when all policies pass', () => {
      const dir = makeFixture({
        en: { Hello: 'Hello' },
        pl: { Hello: 'Cześć' },
        de: {}, es: {}, uk: {},
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(0);
    });

    it('returns exit code 1 on any policy violation', () => {
      const dir = makeFixture({
        en: { Hello: 'Hello' },
        pl: {}, // missing Hello — violation
        de: {}, es: {}, uk: {},
      });
      createdDirs.push(dir);
      const result = runParityCheck(dir);
      expect(result.status).toBe(1);
    });
  });
});
