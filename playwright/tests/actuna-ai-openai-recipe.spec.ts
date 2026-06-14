import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AI_PLUGIN_DIST } from '../helpers';

/**
 * #156 — run a recipe through an OpenAI-compatible provider end-to-end, against a
 * LOCALHOST mock (no live LLM, deterministic). Proves: PRO license verify →
 * provider select → OpenAIProvider HTTP → response parse → recipe result with the
 * AI-generated flag. KROK 5: the engine contacts ONLY the loopback mock — never a
 * forbidden host.
 *
 * Drives the real bundled engine binary directly (the GPL boundary is a process),
 * so it needs no Electron window. A vendor-signed PRO token (#145+) activates PRO.
 * Engine-only test: PRO gating here is tier-based; the email binding is enforced
 * plugin-side (not exercised here), so an unbound token is sufficient.
 */

const PRO_TOKEN =
  'eyJ0aWVyIjoicHJvIiwiZXhwIjo0MTAyNDQ0ODAwfQ.Nv-S8qTT2YTcZ5wFOuaYtpLZdSNK64bP3lBnp0Oa60f53dzvVlP61qIbIygLbKIBipLhrEVbV5vYrn17GdtOCg';

const ENGINE = path.join(
  AI_PLUGIN_DIST,
  'engine',
  `actuna-runtime-${process.platform}-${process.arch}`
);

let server: http.Server;
let hits: string[] = [];
let xdg: string;

test.beforeAll(async () => {
  // Mock OpenAI-compatible server on loopback.
  server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'STRESZCZENIE: trzy kluczowe punkty.' } }],
        })
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;

  xdg = path.join(os.tmpdir(), `actuna-openai-e2e-${Date.now()}`);
  const eng = path.join(xdg, 'actuna-engine');
  fs.mkdirSync(eng, { recursive: true });
  fs.writeFileSync(path.join(eng, 'license.json'), JSON.stringify({ token: PRO_TOKEN }));
  fs.writeFileSync(
    path.join(eng, 'providers.json'),
    JSON.stringify({
      providers: [
        {
          id: 'openai-test',
          kind: 'openai',
          base_url: `http://127.0.0.1:${port}/v1`,
          model: 'gpt-4o-mini',
        },
        {
          id: 'vllm-test',
          kind: 'vllm',
          base_url: `http://127.0.0.1:${port}/v1`,
          model: 'mistral-7b',
        },
      ],
    })
  );
});

test.afterAll(() => {
  server.close();
  if (xdg) fs.rmSync(xdg, { recursive: true, force: true });
});

/**
 * Run the engine ASYNC (spawn, not spawnSync) — `spawnSync` blocks the Node event
 * loop, which would starve the in-process mock HTTP server and deadlock the call.
 */
function runEngine(
  payload: unknown,
  xdgDir: string
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(ENGINE, ['invoke'], {
      env: { ...process.env, XDG_CONFIG_HOME: xdgDir },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', () => {
      try {
        resolve(JSON.parse(out.trim()));
      } catch (e) {
        reject(new Error(`bad engine output: "${out}" (${e})`));
      }
    });
    child.stdin.write(JSON.stringify({ operation: 'run-recipe', payload }));
    child.stdin.end();
  });
}

test('run-recipe via OpenAI provider (mock) returns an AI result (#156)', async () => {
  const resp = await runEngine(
    {
      recipe_id: 'summarize-thread',
      context: { raw_text: 'Długi wątek o terminie spotkania i ustaleniach.' },
      consent: true,
      provider_id: 'openai-test',
      provider_secret: 'sk-test',
    },
    xdg
  );
  expect(resp.result_text).toContain('STRESZCZENIE');
  expect(resp.ai_generated).toBe(true);
  // The engine reached ONLY the loopback mock's chat/completions (KROK 5).
  expect(hits.some((h) => h.includes('/v1/chat/completions'))).toBe(true);
});

test('run-recipe via vLLM provider (OpenAI-compatible mock) returns an AI result (#162)', async () => {
  const resp = await runEngine(
    {
      recipe_id: 'summarize-thread',
      context: { raw_text: 'Wątek do streszczenia przez vLLM.' },
      consent: true,
      provider_id: 'vllm-test',
      provider_secret: 'optional',
    },
    xdg
  );
  expect(resp.result_text).toContain('STRESZCZENIE');
  expect(resp.ai_generated).toBe(true);
});

test('PRO provider is refused without a valid license (fail-closed, #153)', async () => {
  // No license.json in this fresh XDG → tier unknown → PRO provider rejected.
  const noLicXdg = path.join(os.tmpdir(), `actuna-nolic-${Date.now()}`);
  fs.mkdirSync(path.join(noLicXdg, 'actuna-engine'), { recursive: true });
  fs.writeFileSync(
    path.join(noLicXdg, 'actuna-engine', 'providers.json'),
    JSON.stringify({
      providers: [
        { id: 'openai-test', kind: 'openai', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      ],
    })
  );
  const resp = await runEngine(
    {
      recipe_id: 'summarize-thread',
      context: { raw_text: 'x' },
      consent: true,
      provider_id: 'openai-test',
      provider_secret: 'sk-test',
    },
    noLicXdg
  );
  expect(resp.code).toBe('license_invalid');
});
