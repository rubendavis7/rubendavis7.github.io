'use strict';
// BenDavid OS local server. Plain Node.js, no npm dependencies.
// Listens on 127.0.0.1 only, so nothing outside this computer can reach it.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
loadEnvFile(path.join(ROOT, '.env'));

const { Store, STAGES, HttpError, todayISO } = require('./store');
const { Vault } = require('./vault');
const planner = require('./planner');
const integrations = require('./integrations');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4321);
const DATA_DIR = path.resolve(process.env.BENDAVID_DATA_DIR || path.join(ROOT, 'data'));
const VAULT_DIR = path.resolve(process.env.BENDAVID_VAULT_DIR || path.join(ROOT, 'vault'));
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY = 1024 * 1024;

// Minimal .env reader (server side only; values never reach the browser).
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

let store;
try {
  store = new Store({ dataDir: DATA_DIR, seedSamples: process.env.BENDAVID_NO_SAMPLES !== '1' });
} catch (err) {
  console.error(`\n  BenDavid OS could not start:\n  ${err.message}\n`);
  process.exit(1);
}
const vault = new Vault(VAULT_DIR);
const vaultEvents = [];

function noteVault(result) {
  if (result && result.status === 'protected') {
    vaultEvents.unshift({ at: new Date().toISOString(), message: result.message });
    vaultEvents.length = Math.min(vaultEvents.length, 20);
  }
  return result;
}

store.onChange((changed) => {
  if (changed.client) noteVault(vault.writeClient(changed.client));
  if (changed.deletedClient) vault.removeClient(changed.deletedClient);
});
// Bring mirrors up to date on start (protected files are left alone).
for (const c of store.data.clients) noteVault(vault.writeClient(c));

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...(isJson ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// Blocks other websites (and DNS-rebinding tricks) from talking to this server.
function checkOrigin(req, port) {
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!allowed.has(req.headers.host)) throw new HttpError(403, 'Forbidden host');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers['x-bendavid-os'] !== '1') throw new HttpError(403, 'Missing app header');
    const origin = req.headers.origin;
    if (origin && !allowed.has(origin.replace(/^https?:\/\//, ''))) throw new HttpError(403, 'Forbidden origin');
  }
}

function state() {
  return {
    today: todayISO(),
    stages: STAGES,
    clients: store.data.clients,
    tasks: store.data.tasks,
    activity: store.data.activity.slice(0, 60),
    integrations: integrations.status(),
    vaultEvents,
    paths: { data: store.file, backups: store.backupDir, vault: VAULT_DIR },
    hasSamples: store.data.clients.some((c) => c.sample),
  };
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // Prefix formula-looking cells so Excel won't execute them.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function clientsCsv(clients) {
  const cols = ['businessName', 'contactName', 'email', 'phone', 'stage', 'lastContact', 'followUpDate', 'nextAction', 'missingDocs', 'offerConfirmed', 'funder', 'advanceAmount', 'paybackAmount', 'factorRate', 'paymentAmount', 'paymentFrequency', 'estimatedTerm', 'sample'];
  const rows = clients.map((c) => ({
    ...c, ...c.offer, offerConfirmed: c.offer.confirmed ? 'yes' : 'no', sample: c.sample ? 'SAMPLE' : '',
    missingDocs: c.requestedDocs.filter((d) => !d.received).map((d) => d.name).join('; '),
  }));
  return [cols.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\r\n');
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/api\/state$/, () => state());
route('GET', /^\/api\/integrations$/, () => integrations.status());

route('POST', /^\/api\/clients$/, async (req) => ({ client: store.createClient(await readJson(req)) }));
route('PATCH', /^\/api\/clients\/([\w-]+)$/, async (req, [id]) => ({ client: store.updateClient(id, await readJson(req)) }));
route('DELETE', /^\/api\/clients\/([\w-]+)$/, async (req, [id]) => { store.deleteClient(id, await readJson(req)); return { ok: true }; });
route('POST', /^\/api\/clients\/([\w-]+)\/stage$/, async (req, [id]) => ({ client: store.moveStage(id, await readJson(req)) }));
route('POST', /^\/api\/clients\/([\w-]+)\/notes$/, async (req, [id]) => ({ client: store.addNote(id, await readJson(req)) }));
route('GET', /^\/api\/clients\/([\w-]+)\/followup$/, (req, [id]) => planner.followUpDraft(store.getClient(id)));

route('POST', /^\/api\/tasks$/, async (req) => ({ task: store.createTask(await readJson(req)) }));
route('PATCH', /^\/api\/tasks\/([\w-]+)$/, async (req, [id]) => ({ task: store.updateTask(id, await readJson(req)) }));
route('DELETE', /^\/api\/tasks\/([\w-]+)$/, async (req, [id]) => { store.deleteTask(id, await readJson(req)); return { ok: true }; });

route('GET', /^\/api\/plan$/, () => planner.planDay(store.data));
route('GET', /^\/api\/missing-statements$/, () => planner.missingStatements(store.data));

route('POST', /^\/api\/reports\/daily$/, () => {
  const today = todayISO();
  const result = noteVault(vault.writeDailyReport(today, planner.dailyReport(store.data, today)));
  store.log('report', result.status === 'protected' ? result.message : `Daily report saved to vault (${today})`);
  store.commit({});
  return { ...result, file: path.relative(ROOT, result.wroteInstead || result.file) };
});

route('POST', /^\/api\/backup$/, () => {
  const file = store.backupNow();
  store.log('system', `Backup created: ${path.basename(file)}`);
  store.commit({});
  return { file };
});

route('GET', /^\/api\/export$/, (req, _m, url) => {
  const includeSamples = url.searchParams.get('samples') === '1';
  const snap = store.snapshot({ includeSamples });
  const stamp = todayISO();
  if (url.searchParams.get('format') === 'csv') {
    return { raw: `﻿${clientsCsv(snap.clients)}`, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bendavid-clients-${stamp}.csv"` } };
  }
  return { raw: JSON.stringify(snap, null, 2), headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="bendavid-export-${stamp}.json"` } };
});

route('POST', /^\/api\/samples$/, () => { store.loadSamples(); return { ok: true }; });
route('DELETE', /^\/api\/samples$/, () => ({ removed: store.removeSamples() }));

// Integration routes exist so the boundary is real, but they refuse until connected.
route('POST', /^\/api\/integrations\/gmail\/draft$/, () => { integrations.get('gmail'); throw new HttpError(501, 'Not implemented'); });
route('POST', /^\/api\/integrations\/ai\/command$/, () => { integrations.get('ai'); throw new HttpError(501, 'Not implemented'); });

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(PUBLIC_DIR, `.${rel}`);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
}

function createServer(port) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      checkOrigin(req, port());
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
        return serveStatic(req, res, url);
      }
      for (const r of routes) {
        const m = r.pattern.exec(url.pathname);
        if (m && r.method === req.method) {
          const out = await r.handler(req, m.slice(1), url);
          if (out && out.raw !== undefined) return send(res, 200, out.raw, out.headers);
          return send(res, 200, out);
        }
      }
      throw new HttpError(404, 'Unknown API route');
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      send(res, status, { error: status === 500 ? 'Something went wrong on the server. Check the console window.' : err.message, ...(err.extra || {}) });
    }
  });
}

let actualPort = PORT;
const server = createServer(() => actualPort);
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`\n  Port ${PORT} is already in use. BenDavid OS may already be running: open http://localhost:${PORT}\n`);
  else console.error(err);
  process.exit(1);
});
server.listen(PORT, HOST, async () => {
  actualPort = server.address().port;
  await integrations.runSelfTests();
  console.log(`BENDAVID_OS_LISTENING ${actualPort}`);
  console.log(`\n  BenDavid OS is running at http://localhost:${actualPort}`);
  console.log(`  Data file: ${store.file}`);
  console.log(`  Vault:     ${VAULT_DIR}`);
  console.log('  Keep this window open. Press Ctrl+C to stop.\n');
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
