'use strict';
// BenDavid OS local server: the one shared backend. The browser dashboard, the
// CLI, and any future Obsidian plugin all use this same API, task queue, and
// database. Listens on 127.0.0.1 only.

const http = require('http');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const { makeClock } = require('./time');
const { Store, HttpError } = require('./store');
const { Vault, splitFrontmatter } = require('./vault');
const { WORKSPACES } = require('./workspaces');
const deltaPlanner = require('./workspaces/delta-capital/planner');
const views = require('./workspaces/delta-capital/views');
const { WorkflowRegistry } = require('./workflows/registry');
const { RunManager } = require('./runs');
const { createConnections } = require('./connections');
const { createRouter, validateDecision } = require('./router');
const { Scheduler } = require('./scheduler');
const { loadOrCreateToken, createGuard } = require('./security');

const clock = makeClock(config.TIMEZONE);
const MAX_BODY = 1024 * 1024;
const MAX_UPLOAD = 10 * 1024 * 1024;

// ---------- startup ----------
let store;
try {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  store = new Store({ dataDir: config.DATA_DIR, clock, seedSamples: config.SEED_SAMPLES });
} catch (err) {
  console.error(`\n  BenDavid OS could not start:\n  ${err.message}\n`);
  process.exit(1);
}

const vaultEvents = [];
const vault = new Vault({
  dir: config.VAULT_DIR, clock,
  onEvent: (e) => { vaultEvents.unshift({ at: new Date().toISOString(), message: e.message }); vaultEvents.length = Math.min(vaultEvents.length, 20); },
});
vault.ensureStructure(WORKSPACES);
const vaultMigration = vault.migrateV1();
if (vaultMigration.length) store.log('system', `Moved ${vaultMigration.length} v1 vault file(s) into the new layout. See system/migration-log.md`);
vault.setIndexProvider(() => ({ workspaces: WORKSPACES, clients: store.data.clients }));

const { token, file: tokenFile } = loadOrCreateToken(config.DATA_DIR);
const connections = createConnections({ store, vault, dataDir: config.DATA_DIR });
const registry = new WorkflowRegistry();
for (const def of require('./workspaces/delta-capital/workflows')) registry.register(def);
const runs = new RunManager({ store, vault, registry, connections, clock, dataDir: config.DATA_DIR });
runs.recoverInterrupted();
// Outputs are indexed before anyone is told the run finished.
runs.onFinish(() => { try { vault.rebuildIndexes(); } catch (err) { console.error('[vault indexes]', err.message); } });
const router = createRouter(config.ROUTER);
const scheduler = new Scheduler({ store, runs, registry, clock, tickMs: config.SCHEDULER_TICK_MS });

// Wiki client views follow the database (never the other way round).
function syncClientView(c) {
  if (c.sample) return null;
  const rel = views.clientViewPath(c);
  const suffix = `(${c.id.slice(-6)}).md`;
  const dirRel = path.posix.dirname(rel);
  const dirAbs = vault.abs(dirRel);
  if (fs.existsSync(dirAbs)) {
    for (const f of fs.readdirSync(dirAbs)) {
      const full = path.join(dirAbs, f);
      if (f.endsWith(suffix) && `${dirRel}/${f}` !== rel && vault.isPristine(full)) fs.unlinkSync(full);
    }
  }
  const file = vault.abs(rel);
  if (fs.existsSync(file) && vault.isPristine(file)) {
    const { meta } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    if (Number(meta.record_rev) === c.rev && meta.record_updated_at === c.updatedAt) return { status: 'unchanged', path: rel };
  }
  return vault.writeKnowledge(rel, views.renderClientView(c, { rawSources: store.data.rawSources, today: clock.today() }));
}
function removeClientView(c) {
  if (c.sample) return;
  const file = vault.abs(views.clientViewPath(c));
  if (fs.existsSync(file) && vault.isPristine(file)) fs.unlinkSync(file);
  vault.scheduleIndexes();
}
store.onChange((changed) => {
  try {
    if (changed.client) syncClientView(changed.client);
    if (changed.deletedClient) removeClientView(changed.deletedClient);
    if (changed.rawSource && changed.rawSource.clientId) {
      const c = store.data.clients.find((x) => x.id === changed.rawSource.clientId);
      if (c) writeViewAnyway(c);
    }
  } catch (err) {
    console.error('[vault sync]', err.message);
  }
});
// A new linked import changes the view even though the record didn't change.
function writeViewAnyway(c) {
  if (c.sample) return;
  vault.writeKnowledge(views.clientViewPath(c), views.renderClientView(c, { rawSources: store.data.rawSources, today: clock.today() }));
}
for (const c of store.data.clients) {
  try { syncClientView(c); } catch (err) { console.error('[vault sync]', err.message); }
}

// System documentation generated from the registry (kept in step with code).
function writeRegistryDoc() {
  const described = registry.all().map((d) => registry.describe(d, { schedules: store.data.settings.schedules }));
  const fingerprint = require('crypto').createHash('sha256').update(JSON.stringify(described)).digest('hex').slice(0, 12);
  const rel = 'system/workflow-registry.md';
  const file = vault.abs(rel);
  if (fs.existsSync(file)) {
    const { meta } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    if (meta.registry_fingerprint === fingerprint && vault.isPristine(file)) return;
  }
  const body = described.map((w) => [
    `## ${w.name} (\`${w.id}\`)`, w.description, '',
    `**Inputs:** ${w.inputs.length ? w.inputs.map((i) => `${i.label}${i.required ? ' (required)' : ''}: ${i.type}${i.help ? `, ${i.help}` : ''}`).join('; ') : 'none'}`, '',
    '**Engines:**', ...w.engines.map((e) => `- ${e.label}: uses ${e.usesLabel}; route: ${e.routeLabel}; requires: ${e.requires.length ? e.requires.map((r) => r.id).join(', ') : 'nothing'}; time limit ${e.timeoutSec}s${e.note ? `. ${e.note}` : ''}`),
    '', '**Allowed actions:**', ...w.allowedActions.map((a) => `- ${a.label}`),
    '', `**Output:** ${w.outputFormat}`, '', '**Errors:**', ...w.errorBehavior.map((e) => `- ${e}`),
    '', `**Schedulable:** ${w.schedulable ? 'yes (off by default)' : 'no'}`, '',
  ].join('\n')).join('\n');
  vault.writeKnowledge(rel, {
    title: 'Workflow registry', type: 'workflow-registry', generatedWith: 'BenDavid OS workflow registry',
    sources: [{ ref: 'code://server/workspaces/delta-capital/workflows.js', label: 'Workflow definitions in the BenDavid OS code' }],
    uncertainties: [], extraMeta: { registry_fingerprint: fingerprint },
    body: `Every workflow BenDavid OS can run, generated from the code that enforces it. Run them from the **Workflows** page, the Jarvis buttons, or the command bar.\n\n${body}`,
  });
}
writeRegistryDoc();
vault.rebuildIndexes();

// ---------- HTTP helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...(isJson ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, `Request too large (limit ${Math.round(limit / 1024 / 1024)} MB)`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req, MAX_BODY);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // keep Excel from running formulas
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
function clientsCsv(clients) {
  const cols = ['businessName', 'contactName', 'email', 'phone', 'stage', 'lastContact', 'followUpDate', 'nextAction', 'missingDocs', 'offerConfirmed', 'funder', 'advanceAmount', 'paybackAmount', 'factorRate', 'paymentAmount', 'paymentFrequency', 'estimatedTerm', 'recordId', 'updatedAt'];
  const rows = clients.map((c) => ({
    ...c, ...c.offer, offerConfirmed: c.offer.confirmed ? 'yes' : 'no', recordId: c.id,
    missingDocs: deltaPlanner.missingDocs(c).map((d) => d.name).join('; '),
  }));
  return [cols.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\r\n');
}

async function state() {
  const conns = await connections.list();
  return {
    today: clock.today(),
    now: clock.parts(),
    timezone: clock.tz,
    version: config.VERSION,
    workspace: { id: 'delta-capital', name: WORKSPACES['delta-capital'].name, stages: WORKSPACES['delta-capital'].stages },
    stages: WORKSPACES['delta-capital'].stages,
    clients: store.data.clients,
    tasks: store.data.tasks,
    activity: store.data.activity.slice(0, 60),
    activeRuns: runs.list({ activeOnly: true, limit: 20 }),
    recentRuns: runs.list({ limit: 8 }),
    connections: conns.map(({ id, name, state: st, label, detail }) => ({ id, name, state: st, label, detail })),
    voice: store.data.settings.voice,
    vaultEvents,
    router: { id: router.id, name: router.name },
    paths: { data: store.file, backups: store.backupDir, vault: vault.dir, token: tokenFile },
    hasSamples: store.data.clients.some((c) => c.sample),
  };
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/api\/health$/, () => ({ ok: true, app: 'BenDavid OS', version: config.VERSION, schemaVersion: store.data.schemaVersion, timezone: clock.tz, uptimeSec: Math.round(process.uptime()) }));
route('GET', /^\/api\/state$/, () => state());

// Records (saved data)
route('POST', /^\/api\/clients$/, async (req) => ({ client: store.createClient(await readJson(req)) }));
route('PATCH', /^\/api\/clients\/([\w-]+)$/, async (req, [id]) => ({ client: store.updateClient(id, await readJson(req)) }));
route('DELETE', /^\/api\/clients\/([\w-]+)$/, async (req, [id]) => { store.deleteClient(id, await readJson(req)); return { ok: true }; });
route('POST', /^\/api\/clients\/([\w-]+)\/stage$/, async (req, [id]) => ({ client: store.moveStage(id, await readJson(req)) }));
route('POST', /^\/api\/clients\/([\w-]+)\/notes$/, async (req, [id]) => ({ client: store.addNote(id, await readJson(req)) }));
route('GET', /^\/api\/clients\/([\w-]+)\/followup$/, (req, [id]) => deltaPlanner.followUpDraft(store.getClient(id)));
route('POST', /^\/api\/tasks$/, async (req) => ({ task: store.createTask(await readJson(req)) }));
route('PATCH', /^\/api\/tasks\/([\w-]+)$/, async (req, [id]) => ({ task: store.updateTask(id, await readJson(req)) }));
route('DELETE', /^\/api\/tasks\/([\w-]+)$/, async (req, [id]) => { store.deleteTask(id, await readJson(req)); return { ok: true }; });

// Deterministic reads (no AI call, no run record)
route('GET', /^\/api\/plan$/, () => deltaPlanner.planDay(store.data, clock.today()));
route('GET', /^\/api\/missing-statements$/, () => deltaPlanner.missingStatements(store.data, { today: clock.today() }));
route('GET', /^\/api\/pipeline$/, () => deltaPlanner.reviewPipeline(store.data, { today: clock.today() }));

// Workflows and runs (the shared task queue)
route('GET', /^\/api\/workflows$/, async () => {
  const conns = await connections.list();
  return registry.all().map((d) => registry.describe(d, { connections: conns, schedules: store.data.settings.schedules }));
});
route('POST', /^\/api\/workflows\/([\w-]+)\/run$/, async (req, [id], url, who) => {
  const body = await readJson(req);
  const { run, duplicate } = await runs.start({ workflowId: id, inputs: body.inputs || {}, trigger: 'manual', client: who.client, requestId: body.requestId || null });
  return { run, duplicate };
});
route('GET', /^\/api\/runs$/, (req, m, url) => runs.list({
  limit: url.searchParams.get('limit'), status: url.searchParams.get('status') || '', workflowId: url.searchParams.get('workflow') || '', activeOnly: url.searchParams.get('active') === '1',
}));
route('GET', /^\/api\/runs\/([\w-]+)$/, (req, [id]) => runs.get(id));
route('POST', /^\/api\/runs\/([\w-]+)\/cancel$/, (req, [id]) => ({ run: runs.cancel(id) }));
route('POST', /^\/api\/reports\/daily$/, async (req, m, url, who) => runs.start({ workflowId: 'plan-my-day', inputs: {}, client: who.client }));

// Request routing (returns a decision; never executes)
route('POST', /^\/api\/route$/, async (req) => {
  const { text } = await readJson(req);
  const decision = validateDecision(router.route(text, { clients: store.data.clients }), registry);
  return { router: router.id, decision };
});

// Knowledge (vault)
route('GET', /^\/api\/knowledge$/, () => ({ dir: vault.dir, files: vault.list(), rawSources: store.data.rawSources }));
route('GET', /^\/api\/knowledge\/file$/, (req, m, url) => vault.read(url.searchParams.get('path') || ''));
route('GET', /^\/api\/knowledge\/download$/, (req, m, url) => {
  const rel = url.searchParams.get('path') || '';
  const file = vault.abs(rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new HttpError(404, 'File not found');
  return { raw: fs.readFileSync(file), headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${path.basename(file).replace(/["\r\n]/g, '')}"`, 'Content-Security-Policy': 'sandbox' } };
});
function rawTarget(clientId) {
  const c = clientId ? store.getClient(clientId) : null;
  return { clientId: c ? c.id : null, dir: WORKSPACES[(c && c.workspaceId) || 'delta-capital'].vault.raw };
}
route('POST', /^\/api\/knowledge\/raw$/, async (req) => {
  const b = await readJson(req);
  const kind = ['note', 'email', 'document', 'other'].includes(b.kind) ? b.kind : 'note';
  const { clientId, dir } = rawTarget(b.clientId);
  const res = vault.importText({ title: String(b.title || '').slice(0, 120), kind, content: String(b.content || '').slice(0, 500_000), workspaceDir: dir, clientId });
  const src = store.addRawSource({ path: res.path, title: String(b.title || kind).slice(0, 120), kind, clientId, sha256: res.sha256, size: res.size, workspaceId: 'delta-capital' });
  return { source: src };
});
route('POST', /^\/api\/knowledge\/raw-file$/, async (req) => {
  let name;
  try { name = decodeURIComponent(String(req.headers['x-filename'] || 'upload')); } catch { throw new HttpError(400, 'Invalid file name'); }
  const kind = ['note', 'email', 'document', 'other'].includes(req.headers['x-kind']) ? req.headers['x-kind'] : 'document';
  const { clientId, dir } = rawTarget(req.headers['x-client-id'] || null);
  const bytes = await readBody(req, MAX_UPLOAD);
  const res = vault.importFile({ originalName: name, bytes, kind, title: name, workspaceDir: dir, clientId });
  const src = store.addRawSource({ path: res.path, sidecar: res.sidecar, title: name.slice(0, 120), kind, clientId, sha256: res.sha256, size: res.size, workspaceId: 'delta-capital' });
  return { source: src };
});
route('POST', /^\/api\/knowledge\/reindex$/, () => {
  for (const c of store.data.clients) syncClientView(c);
  return { results: vault.rebuildIndexes().map((r) => ({ path: r.path, status: r.status })) };
});

// Connections
route('GET', /^\/api\/connections$/, () => connections.list());
route('POST', /^\/api\/connections\/([\w-]+)\/test$/, async (req, [id]) => connections.runSelfTest(id));
route('PUT', /^\/api\/connections\/voice$/, async (req) => {
  const b = await readJson(req);
  if (b.transcription !== undefined) connections.setVoice('transcription', b.transcription);
  if (b.speech !== undefined) connections.setVoice('speech', b.speech);
  return { voice: store.data.settings.voice };
});
route('POST', /^\/api\/connections\/voice\/verified$/, async (req) => {
  const { kind } = await readJson(req);
  connections.markVoiceVerified(kind);
  return { voice: store.data.settings.voice };
});

// Schedules (off by default)
route('GET', /^\/api\/schedules$/, () => ({ timezone: clock.tz, schedules: store.data.settings.schedules }));
route('PUT', /^\/api\/schedules\/([\w-]+)$/, async (req, [id]) => ({ schedule: scheduler.update(id, await readJson(req)) }));

// Data safety
route('POST', /^\/api\/backup$/, () => {
  const file = store.backupNow();
  store.log('system', `Backup created: ${path.basename(file)}`);
  store.commit({});
  return { file };
});
route('GET', /^\/api\/export$/, (req, m, url) => {
  const snap = store.snapshot({ includeSamples: url.searchParams.get('samples') === '1' });
  const stamp = clock.today();
  if (url.searchParams.get('format') === 'csv') {
    return { raw: `﻿${clientsCsv(snap.clients)}`, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bendavid-clients-${stamp}.csv"` } };
  }
  return { raw: JSON.stringify(snap, null, 2), headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="bendavid-export-${stamp}.json"` } };
});
route('POST', /^\/api\/samples$/, () => { store.loadSamples(); return { ok: true }; });
route('DELETE', /^\/api\/samples$/, () => ({ removed: store.removeSamples() }));

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad path', { 'Content-Type': 'text/plain' }); }
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(config.PUBLIC_DIR, `.${rel}`);
  if (!file.startsWith(config.PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
}

let actualPort = config.PORT;
const guard = createGuard({ token, getPort: () => actualPort });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    const who = guard(req);
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      return serveStatic(req, res, url);
    }
    for (const r of routes) {
      const m = r.pattern.exec(url.pathname);
      if (m && r.method === req.method) {
        const out = await r.handler(req, m.slice(1), url, who);
        if (out && out.raw !== undefined) return send(res, 200, out.raw, out.headers);
        return send(res, 200, out);
      }
    }
    throw new HttpError(404, 'Unknown API route');
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    send(res, status, { error: status === 500 ? 'Something went wrong on the server. Check the BenDavid OS window.' : err.message, ...(err.extra || {}) });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`\n  Port ${config.PORT} is already in use. BenDavid OS may already be running: open http://localhost:${config.PORT}\n`);
  else console.error(err);
  process.exit(1);
});

server.listen(config.PORT, config.HOST, () => {
  actualPort = server.address().port;
  scheduler.start();
  const on = store.data.settings.schedules.filter((s) => s.enabled).length;
  console.log(`BENDAVID_OS_LISTENING ${actualPort}`);
  console.log(`\n  BenDavid OS ${config.VERSION} is running at http://localhost:${actualPort}  (or http://127.0.0.1:${actualPort})`);
  console.log(`  Data:      ${store.file}${store.migration ? ` (upgraded from schema v${store.migration.from}; backup kept)` : ''}`);
  console.log(`  Vault:     ${vault.dir}`);
  console.log(`  Time zone: ${clock.tz} (today is ${clock.today()})`);
  console.log(`  Schedules: ${on ? `${on} on (run only while this window is open)` : 'all off'}`);
  console.log('  Keep this window open. Press Ctrl+C to stop.\n');
});

function shutdown() {
  scheduler.stop();
  runs.shutdown();
  server.close();
  setTimeout(() => process.exit(0), 400).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
