'use strict';
// End-to-end API tests against a real server process using a temporary data
// folder, including a full stop/restart to prove records persist.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bdos-test-'));
const DATA = path.join(tmp, 'data');
const VAULT = path.join(tmp, 'vault');
let proc;
let base;

function start() {
  return new Promise((resolve, reject) => {
    proc = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
      env: { ...process.env, PORT: '0', BENDAVID_DATA_DIR: DATA, BENDAVID_VAULT_DIR: VAULT },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout.on('data', (d) => {
      out += d;
      const m = /BENDAVID_OS_LISTENING (\d+)/.exec(out);
      if (m) { base = `http://127.0.0.1:${m[1]}`; resolve(); }
    });
    proc.stderr.on('data', (d) => { out += d; });
    proc.on('exit', (code) => reject(new Error(`server exited ${code}: ${out}`)));
  });
}
function stop() {
  return new Promise((resolve) => { proc.removeAllListeners('exit'); proc.on('exit', resolve); proc.kill('SIGTERM'); });
}
async function call(method, url, body, headers = { 'X-BenDavid-OS': '1' }) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

before(start);
after(async () => { await stop(); fs.rmSync(tmp, { recursive: true, force: true }); });

let clientId;
let taskId;

test('first run loads clearly labelled sample records', async () => {
  const { body } = await call('GET', '/api/state');
  assert.ok(body.hasSamples);
  assert.ok(body.clients.length > 0 && body.clients.every((c) => c.sample && /\(Sample\)/.test(c.businessName)));
  assert.ok(body.integrations.every((i) => i.connected === false), 'integrations must show disconnected');
});

test('create a client', async () => {
  const r = await call('POST', '/api/clients', {
    contactName: 'Test Owner', businessName: 'Test Pizza LLC', email: 'owner@testpizza.com', phone: '555-1000',
    followUpDate: '2026-10-20', nextAction: 'Request statements',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = r.body.client;
  clientId = c.id;
  assert.equal(c.sample, false);
  assert.equal(c.stage, 'Statements');
  assert.equal(c.rev, 1);
  assert.ok(c.requestedDocs.some((d) => /statement/i.test(d.name) && !d.received));
});

test('rejects invalid clients and missing app header', async () => {
  assert.equal((await call('POST', '/api/clients', { contactName: '', businessName: 'X' })).status, 400);
  assert.equal((await call('POST', '/api/clients', { contactName: 'A', businessName: 'B', email: 'nope' })).status, 400);
  assert.equal((await call('POST', '/api/clients', { contactName: 'A', businessName: 'B' }, {})).status, 403);
});

test('edit a client, with stale edits refused', async () => {
  const r = await call('PATCH', `/api/clients/${clientId}`, {
    rev: 1, phone: '555-2000', nextAction: 'Review offer',
    offer: { confirmed: true, advanceAmount: '25,000', paybackAmount: 33750, factorRate: 1.35, paymentAmount: 300, paymentFrequency: 'Daily' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.client.phone, '555-2000');
  assert.equal(r.body.client.offer.advanceAmount, 25000);
  assert.equal(r.body.client.rev, 2);
  const stale = await call('PATCH', `/api/clients/${clientId}`, { rev: 1, phone: 'overwrite' });
  assert.equal(stale.status, 409);
  const bad = await call('PATCH', `/api/clients/${clientId}`, { rev: 2, phone: '1', followUpDate: 'tomorrow' });
  assert.equal(bad.status, 400);
  const { body } = await call('GET', '/api/state');
  const c = body.clients.find((x) => x.id === clientId);
  assert.equal(c.phone, '555-2000', 'failed edits must not partially apply');
});

test('add a note', async () => {
  const r = await call('POST', `/api/clients/${clientId}/notes`, { text: 'Owner wants funds for a new oven.' });
  assert.equal(r.status, 200);
  assert.equal(r.body.client.notes[0].text, 'Owner wants funds for a new oven.');
  assert.equal(r.body.client.rev, 3);
});

test('move through every stage to Funded', async () => {
  const stages = ['Offer', 'Accepted', 'Contract', 'Bank Verification', 'Funding Call', 'Funded'];
  let rev = 3;
  for (const s of stages) {
    const r = await call('POST', `/api/clients/${clientId}/stage`, { stage: s, rev });
    assert.equal(r.status, 200, `${s}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.client.stage, s);
    rev = r.body.client.rev;
  }
  assert.equal((await call('POST', `/api/clients/${clientId}/stage`, { stage: 'Lost', rev })).status, 400);
  assert.equal((await call('POST', `/api/clients/${clientId}/stage`, { stage: 'Offer', rev: 1 })).status, 409);
});

test('create and complete a task', async () => {
  const r = await call('POST', '/api/tasks', { title: 'Call Test Owner', due: '2026-10-13', clientId });
  assert.equal(r.status, 200);
  taskId = r.body.task.id;
  const done = await call('PATCH', `/api/tasks/${taskId}`, { done: true, rev: 1 });
  assert.equal(done.status, 200);
  assert.equal(done.body.task.done, true);
  assert.ok(done.body.task.doneAt);
});

test('follow-up templates follow the writing rules', async () => {
  const { body } = await call('GET', '/api/state');
  for (const c of body.clients) {
    const d = (await call('GET', `/api/clients/${c.id}/followup`)).body;
    assert.equal(d.kind, 'template');
    assert.match(d.label, /TEMPLATE/);
    assert.ok(d.wordCount < 80, `${c.businessName}: ${d.wordCount} words`);
    assert.doesNotMatch(`${d.subject} ${d.body}`, /\b(loan|interest|lender|borrow|apr)\b/i);
    assert.doesNotMatch(d.body, /\b(sent|approved)\b/i);
  }
  // An unconfirmed offer never shows amounts.
  const c = (await call('POST', '/api/clients', { contactName: 'Una Confirmed', businessName: 'Pending Co', stage: 'Offer', offer: { confirmed: false, advanceAmount: 99999 } })).body.client;
  const d = (await call('GET', `/api/clients/${c.id}/followup`)).body;
  assert.doesNotMatch(d.body, /99,999|\$/);
});

test('vault mirror is written and never overwrites hand edits', async () => {
  const dir = path.join(VAULT, 'Clients');
  const file = fs.readdirSync(dir).find((f) => f.startsWith('Test Pizza LLC'));
  assert.ok(file, 'client note should exist');
  assert.ok(!fs.readdirSync(dir).some((f) => /sample/i.test(f)), 'samples are never written to the vault');
  const full = path.join(dir, file);
  fs.appendFileSync(full, '\nMy own Obsidian edit\n');
  const { body } = await call('GET', '/api/state');
  const c = body.clients.find((x) => x.id === clientId);
  const r = await call('PATCH', `/api/clients/${clientId}`, { rev: c.rev, nextAction: 'Ask for referral' });
  assert.equal(r.status, 200);
  assert.match(fs.readFileSync(full, 'utf8'), /My own Obsidian edit/);
  assert.ok(fs.existsSync(full.replace(/\.md$/, '.generated.md')));
});

test('daily report and backup', async () => {
  const r = await call('POST', '/api/reports/daily');
  assert.equal(r.status, 200);
  const report = fs.readdirSync(path.join(VAULT, 'Daily Reports'));
  assert.equal(report.length, 1);
  assert.doesNotMatch(fs.readFileSync(path.join(VAULT, 'Daily Reports', report[0]), 'utf8'), /\(Sample\)/);
  const b = await call('POST', '/api/backup');
  assert.equal(b.status, 200);
  assert.ok(fs.existsSync(b.body.file));
});

test('export excludes samples by default', async () => {
  const j = await call('GET', '/api/export?format=json');
  assert.ok(j.body.clients.length >= 1 && j.body.clients.every((c) => !c.sample));
  const csv = await call('GET', '/api/export?format=csv');
  assert.match(csv.body, /Test Pizza LLC/);
  assert.doesNotMatch(csv.body, /Sample/);
});

test('records persist after a restart', async () => {
  await stop();
  await start();
  const { body } = await call('GET', '/api/state');
  const c = body.clients.find((x) => x.id === clientId);
  assert.ok(c, 'client survives restart');
  assert.equal(c.stage, 'Funded');
  assert.equal(c.phone, '555-2000');
  assert.equal(c.nextAction, 'Ask for referral');
  assert.equal(c.notes[0].text, 'Owner wants funds for a new oven.');
  assert.equal(body.tasks.find((t) => t.id === taskId).done, true);
  assert.ok(body.clients.some((x) => x.sample), 'samples are not re-added or lost');
  assert.equal(body.clients.filter((x) => x.sample).length, 5);
});

test('samples can be removed without touching real clients', async () => {
  const r = await call('DELETE', '/api/samples');
  assert.equal(r.body.removed, 5);
  const { body } = await call('GET', '/api/state');
  assert.ok(body.clients.every((c) => !c.sample));
  assert.ok(body.clients.find((c) => c.id === clientId));
});

test('server rejects foreign hosts and only listens on localhost', async () => {
  const port = new URL(base).port;
  const status = await new Promise((resolve, reject) => {
    require('node:http').get({ host: '127.0.0.1', port, path: '/api/state', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
  const ifaces = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal);
  for (const i of ifaces) {
    await assert.rejects(fetch(`http://${i.address}:${port}/api/state`, { signal: AbortSignal.timeout(1500) }));
  }
});
