'use strict';
// End-to-end API tests against a real server process with temporary folders,
// including stop/restart to prove records persist.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { tempDirs, TestServer } = require('./helpers');

const dirs = tempDirs('bdos-api-');
const srv = new TestServer({ data: dirs.data, vault: dirs.vault });

before(() => srv.start());
after(async () => { await srv.stop(); fs.rmSync(dirs.dir, { recursive: true, force: true }); });

let clientId;
let taskId;

test('first run loads clearly labelled sample records and shows honest statuses', async () => {
  const { body } = await srv.call('GET', '/api/state');
  assert.ok(body.hasSamples);
  assert.ok(body.clients.length > 0 && body.clients.every((c) => c.sample && /\(Sample\)/.test(c.businessName)));
  const byId = Object.fromEntries(body.connections.map((c) => [c.id, c]));
  assert.equal(byId['light-model'].state, 'not-configured');
  assert.equal(byId.gmail.state, 'not-implemented');
  assert.equal(byId.transcription.state, 'not-configured');
  assert.equal(byId['obsidian-plugin'].state, 'not-implemented');
  assert.equal(byId.scheduler.state, 'disabled');
  assert.notEqual(byId['claude-code'].state, 'verified', 'never verified without a self-test');
  assert.equal(body.timezone, 'America/New_York');
});

test('create a client with statement months', async () => {
  const r = await srv.call('POST', '/api/clients', {
    contactName: 'Test Owner', businessName: 'Test Pizza LLC', email: 'owner@testpizza.com', phone: '555-1000',
    followUpDate: '2026-10-20', nextAction: 'Request statements',
    requestedDocs: [{ kind: 'bank-statement', month: '2026-07' }, { month: '2026-08' }, { name: 'Signed application', received: true }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = r.body.client;
  clientId = c.id;
  assert.equal(c.sample, false);
  assert.equal(c.workspaceId, 'delta-capital');
  assert.equal(c.stage, 'Statements');
  assert.equal(c.rev, 1);
  assert.deepEqual(c.requestedDocs.filter((d) => d.month).map((d) => d.month), ['2026-07', '2026-08']);
  assert.equal(c.requestedDocs.find((d) => d.month === '2026-07').name, 'Bank statement: July 2026');
  assert.equal((await srv.call('POST', '/api/clients', { contactName: 'A', businessName: 'B', requestedDocs: [{ month: '2026-13' }] })).status, 400);
});

test('rejects invalid clients and requests without the app header', async () => {
  assert.equal((await srv.call('POST', '/api/clients', { contactName: '', businessName: 'X' })).status, 400);
  assert.equal((await srv.call('POST', '/api/clients', { contactName: 'A', businessName: 'B', email: 'nope' })).status, 400);
  assert.equal((await srv.call('POST', '/api/clients', { contactName: 'A', businessName: 'B' }, {})).status, 403);
});

test('edit a client; stale and invalid edits are refused without partial changes', async () => {
  const r = await srv.call('PATCH', `/api/clients/${clientId}`, {
    rev: 1, phone: '555-2000', nextAction: 'Review offer',
    offer: { confirmed: true, advanceAmount: '25,000', paybackAmount: 33750, factorRate: 1.35, paymentAmount: 300, paymentFrequency: 'Daily' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.client.phone, '555-2000');
  assert.equal(r.body.client.offer.advanceAmount, 25000);
  assert.equal(r.body.client.rev, 2);
  assert.equal((await srv.call('PATCH', `/api/clients/${clientId}`, { rev: 1, phone: 'overwrite' })).status, 409);
  assert.equal((await srv.call('PATCH', `/api/clients/${clientId}`, { rev: 2, phone: '1', followUpDate: 'tomorrow' })).status, 400);
  const c = (await srv.call('GET', '/api/state')).body.clients.find((x) => x.id === clientId);
  assert.equal(c.phone, '555-2000', 'failed edits must not partially apply');
});

test('add a note', async () => {
  const r = await srv.call('POST', `/api/clients/${clientId}/notes`, { text: 'Owner wants funds for a new oven.' });
  assert.equal(r.status, 200);
  assert.equal(r.body.client.notes[0].text, 'Owner wants funds for a new oven.');
  assert.equal(r.body.client.rev, 3);
});

test('move through every stage to Funded', async () => {
  let rev = 3;
  for (const s of ['Offer', 'Accepted', 'Contract', 'Bank Verification', 'Funding Call', 'Funded']) {
    const r = await srv.call('POST', `/api/clients/${clientId}/stage`, { stage: s, rev });
    assert.equal(r.status, 200, `${s}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.client.stage, s);
    rev = r.body.client.rev;
  }
  assert.equal((await srv.call('POST', `/api/clients/${clientId}/stage`, { stage: 'Lost', rev })).status, 400);
  assert.equal((await srv.call('POST', `/api/clients/${clientId}/stage`, { stage: 'Offer', rev: 1 })).status, 409);
});

test('create and complete a task', async () => {
  const r = await srv.call('POST', '/api/tasks', { title: 'Call Test Owner', due: '2026-10-13', clientId });
  assert.equal(r.status, 200);
  taskId = r.body.task.id;
  const done = await srv.call('PATCH', `/api/tasks/${taskId}`, { done: true, rev: 1 });
  assert.equal(done.status, 200);
  assert.equal(done.body.task.done, true);
  assert.ok(done.body.task.doneAt);
});

test('template follow-ups follow the writing rules for every stage', async () => {
  const { body } = await srv.call('GET', '/api/state');
  for (const c of body.clients) {
    const d = (await srv.call('GET', `/api/clients/${c.id}/followup`)).body;
    assert.equal(d.kind, 'template');
    assert.match(d.label, /TEMPLATE/);
    assert.ok(d.wordCount < 80, `${c.businessName}: ${d.wordCount} words`);
    assert.doesNotMatch(`${d.subject} ${d.body}`, /\b(loan|interest|lender|borrow|apr)\b/i);
    assert.doesNotMatch(d.body, /\b(sent|approved)\b/i);
  }
  const c = (await srv.call('POST', '/api/clients', { contactName: 'Una Confirmed', businessName: 'Pending Co', stage: 'Offer', offer: { confirmed: false, advanceAmount: 99999 } })).body.client;
  const d = (await srv.call('GET', `/api/clients/${c.id}/followup`)).body;
  assert.doesNotMatch(d.body, /99,999|\$/, 'unconfirmed offers never show amounts');
});

test('wiki client view is a derived view with record ID and timestamps, and hand edits are never overwritten', async () => {
  const dir = path.join(dirs.vault, 'wiki', 'delta-capital', 'clients');
  const file = fs.readdirSync(dir).find((f) => f.startsWith('Test Pizza LLC'));
  assert.ok(file, 'client view should exist');
  assert.ok(!fs.readdirSync(dir).some((f) => /sample/i.test(f)), 'samples never get wiki views');
  const full = path.join(dir, file);
  const text = fs.readFileSync(full, 'utf8');
  assert.match(text, new RegExp(`record_id: ${clientId}`));
  assert.match(text, /record_rev: \d+/);
  assert.match(text, /record_updated_at: /);
  assert.match(text, /## Sources/);
  assert.match(text, /## Uncertainties/);
  fs.appendFileSync(full, '\nMy own Obsidian edit\n');
  const c = (await srv.call('GET', '/api/state')).body.clients.find((x) => x.id === clientId);
  assert.equal((await srv.call('PATCH', `/api/clients/${clientId}`, { rev: c.rev, nextAction: 'Ask for referral' })).status, 200);
  assert.match(fs.readFileSync(full, 'utf8'), /My own Obsidian edit/);
  assert.ok(fs.existsSync(full.replace(/\.md$/, '.generated.md')));
});

test('backup and exports exclude samples by default', async () => {
  const b = await srv.call('POST', '/api/backup');
  assert.equal(b.status, 200);
  assert.ok(fs.existsSync(b.body.file));
  const j = await srv.call('GET', '/api/export?format=json');
  assert.ok(j.body.clients.length >= 1 && j.body.clients.every((c) => !c.sample));
  const csv = await srv.call('GET', '/api/export?format=csv');
  assert.match(csv.body, /Test Pizza LLC/);
  assert.doesNotMatch(csv.body, /Sample/);
});

test('records persist after a restart', async () => {
  await srv.restart();
  const { body } = await srv.call('GET', '/api/state');
  const c = body.clients.find((x) => x.id === clientId);
  assert.ok(c, 'client survives restart');
  assert.equal(c.stage, 'Funded');
  assert.equal(c.phone, '555-2000');
  assert.equal(c.nextAction, 'Ask for referral');
  assert.equal(c.notes[0].text, 'Owner wants funds for a new oven.');
  assert.deepEqual(c.requestedDocs.filter((d) => d.month).map((d) => d.month), ['2026-07', '2026-08']);
  assert.equal(body.tasks.find((t) => t.id === taskId).done, true);
  assert.equal(body.clients.filter((x) => x.sample).length, 5, 'samples are neither re-added nor lost');
});

test('samples can be removed without touching real clients', async () => {
  const r = await srv.call('DELETE', '/api/samples');
  assert.equal(r.body.removed, 5);
  const { body } = await srv.call('GET', '/api/state');
  assert.ok(body.clients.every((c) => !c.sample));
  assert.ok(body.clients.find((c) => c.id === clientId));
});

function rawRequest(port, { method = 'GET', pathName = '/api/state', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathName, headers }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('protects write endpoints from other websites; token clients work', async () => {
  const port = srv.port;
  const json = { 'Content-Type': 'application/json' };
  assert.equal(await rawRequest(port, { headers: { Host: 'evil.example' } }), 403, 'DNS rebinding host');
  assert.equal(await rawRequest(port, { method: 'POST', pathName: '/api/backup', headers: { ...json, 'X-BenDavid-OS': '1', Origin: 'https://evil.example' } }), 403, 'foreign origin');
  assert.equal(await rawRequest(port, { method: 'POST', pathName: '/api/backup', headers: { ...json, 'X-BenDavid-OS': '1', 'Sec-Fetch-Site': 'cross-site' } }), 403, 'cross-site fetch');
  assert.equal(await rawRequest(port, { method: 'POST', pathName: '/api/workflows/plan-my-day/run', headers: json, body: '{}' }), 403, 'no app header');
  assert.equal(await rawRequest(port, { method: 'POST', pathName: '/api/backup', headers: { ...json, Authorization: 'Bearer wrong' } }), 401, 'bad token');
  const ok = await srv.call('POST', '/api/workflows/find-missing-statements/run', { inputs: {} }, { Authorization: `Bearer ${srv.token()}`, 'X-BenDavid-Client': 'obsidian' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.run.client, 'obsidian');
  const tokenLeak = JSON.stringify((await srv.call('GET', '/api/state')).body);
  assert.ok(!tokenLeak.includes(srv.token()), 'token never returned by the API');
});

test('server listens on localhost only', async () => {
  const ifaces = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal);
  for (const i of ifaces) {
    await assert.rejects(fetch(`http://${i.address}:${srv.port}/api/health`, { signal: AbortSignal.timeout(1500) }));
  }
});
