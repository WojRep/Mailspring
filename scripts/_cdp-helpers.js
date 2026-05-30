/**
 * Shared CDP helpers dla prod-path testing (no PLAYWRIGHT bypass).
 *
 * Launchuje built ActunaMail.app via env -u ELECTRON_RUN_AS_NODE + spawn,
 * używa CDP debug port + WebSocket dla DOM/Runtime inspection.
 *
 * Used by:
 *  - scripts/prod-smoke.js
 *  - scripts/prod-views.js (Suite B 100% widoków)
 *  - scripts/prod-functionality.js (Suite C 95% funkcjonalności)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { 'Host': 'localhost' } }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.setTimeout(4000, () => { req.destroy(new Error('fetchJson timeout: ' + url)); });
    req.on('error', reject);
  });
}

/**
 * Read DevToolsActivePort file written by Electron — first line is port,
 * second line is browser-level websocket path. More reliable than /json
 * polling on macOS where /json HTTP endpoint may hang under some conditions.
 */
function readDevToolsActivePort(cfgDir) {
  const f = path.join(cfgDir, 'DevToolsActivePort');
  if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf-8').split('\n');
  return { port: parseInt(lines[0], 10), browserPath: lines[1] };
}

/**
 * Enumerate targets via browser-level WebSocket Target.getTargets — works even
 * gdy /json HTTP endpoint hangs (observed under macOS w prod build).
 */
async function targetsViaWebSocket(cfgDir, timeoutMs = 10000) {
  const meta = readDevToolsActivePort(cfgDir);
  if (!meta) throw new Error('DevToolsActivePort not yet written');
  const browserWs = `ws://127.0.0.1:${meta.port}${meta.browserPath}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(browserWs);
    const t = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error('targets WS timeout')); }, timeoutMs);
    ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Target.getTargets' })));
    ws.on('message', d => {
      try {
        const m = JSON.parse(d);
        if (m.id === 1) {
          clearTimeout(t);
          ws.close();
          const targets = (m.result && m.result.targetInfos || []).filter(t => t.type === 'page').map(t => ({
            id: t.targetId,
            title: t.title,
            url: t.url,
            type: t.type,
            webSocketDebuggerUrl: `ws://127.0.0.1:${meta.port}/devtools/page/${t.targetId}`,
          }));
          resolve(targets);
        }
      } catch (e) { clearTimeout(t); ws.close(); reject(e); }
    });
    ws.on('error', err => { clearTimeout(t); reject(err); });
  });
}

function evalInTarget(wsUrl, expression, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error('eval timeout')); }, timeoutMs);
    ws.on('open', () => ws.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    })));
    ws.on('message', d => {
      try {
        const m = JSON.parse(d);
        if (m.id === 1) {
          clearTimeout(t);
          ws.close();
          if (m.result && m.result.exceptionDetails) {
            reject(new Error('eval exception: ' + m.result.exceptionDetails.text));
          } else {
            resolve(m.result && m.result.result ? m.result.result.value : null);
          }
        }
      } catch (e) { clearTimeout(t); ws.close(); reject(e); }
    });
    ws.on('error', err => { clearTimeout(t); reject(err); });
  });
}

async function captureScreenshot(wsUrl, outPath) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error('screenshot timeout')); }, 8000);
    ws.on('open', () => ws.send(JSON.stringify({ id: 99, method: 'Page.captureScreenshot', params: { format: 'png' } })));
    ws.on('message', d => {
      const m = JSON.parse(d);
      if (m.id === 99) {
        clearTimeout(t);
        ws.close();
        if (m.result && m.result.data) {
          fs.writeFileSync(outPath, Buffer.from(m.result.data, 'base64'));
          resolve(outPath);
        } else { reject(new Error('no data')); }
      }
    });
    ws.on('error', err => { clearTimeout(t); reject(err); });
  });
}

async function waitForTarget(portOrCfg, predicate, timeoutMs = 25000) {
  const start = Date.now();
  const isCfg = typeof portOrCfg === 'string' && portOrCfg.includes('/');
  while (Date.now() - start < timeoutMs) {
    try {
      const targets = isCfg
        ? await targetsViaWebSocket(portOrCfg, 4000)
        : await fetchJson(`http://localhost:${portOrCfg}/json`);
      const m = targets.find(predicate);
      if (m) return m;
    } catch (e) { /* port/file not ready */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

/**
 * Launch built ActunaMail.app w prod mode (no PLAYWRIGHT bypass), fresh config dir.
 * Returns { child, port, cfgDir, cleanup, waitForMain }.
 */
async function launchProd({ appPath, port } = {}) {
  const APP = appPath || path.resolve(__dirname, '..', 'app', 'dist', 'ActunaMail-darwin-arm64', 'ActunaMail.app', 'Contents', 'MacOS', 'ActunaMail');
  const PORT = port || (9230 + Math.floor(Math.random() * 1000));
  const CFG_DIR = path.join(os.tmpdir(), `am-prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`);

  if (!fs.existsSync(APP)) throw new Error('binary not found at ' + APP);
  fs.mkdirSync(CFG_DIR, { recursive: true });

  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  const logs = [];
  const child = spawn(APP, ['-c', CFG_DIR, '--remote-debugging-port=' + PORT], {
    env: cleanEnv, detached: false, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => logs.push(d.toString()));
  child.stderr.on('data', d => logs.push(d.toString()));

  const cleanup = async () => {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise(r => setTimeout(r, 800));
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(CFG_DIR, { recursive: true, force: true }); } catch (e) {}
  };

  const waitForMain = async (timeoutMs = 30000) => {
    // Prefer DevToolsActivePort file-based discovery (port HTTP /json hangs
    // sometimes under macOS w prod build).
    return waitForTarget(CFG_DIR, t => t.url.includes('windowType%22%3A%22default'), timeoutMs);
  };

  const listTargets = async () => {
    try { return await targetsViaWebSocket(CFG_DIR, 4000); } catch (e) { return null; }
  };

  return { child, port: PORT, cfgDir: CFG_DIR, logs, cleanup, waitForMain, listTargets };
}

module.exports = { fetchJson, evalInTarget, captureScreenshot, waitForTarget, launchProd, readDevToolsActivePort, targetsViaWebSocket };
