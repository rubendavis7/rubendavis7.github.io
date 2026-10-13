'use strict';
// Migration from v1, scheduler (fake clock), vault safety, capability
// enforcement, time zone helpers, and Markdown sanitizing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { tempDirs, TestServer, ROOT } = require('./helpers');
const { makeClock, monthsBefore, zoned } = require('../server/time');

test('v1 data and v1 vault are upgraded without losing anything', async () => {
  const d = tempDirs('bdos-mig-');
  fs.mkdirSync(d.data, { recursive: true });
  const v1 = {
    schemaVersion: 1, createdAt: '2026-10-01T12:00:00.000Z',
    clients: [{
      id: 'cli_aaaaaa111111', rev: 4, sample: false, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-05T12:00:00.000Z',
      contactName: 'Real Owner', businessName: 'Real Co', email: 'owner@real.example', phone: '1', stage: 'Offer',
      requestedDocs: [{ id: 'doc_1', name: 'Business bank statements (last 4 months)', received: false, requestedAt: '2026-10-01', receivedAt: '' }],
      offer: { confirmed: true, funder: 'F', advanceAmount: 10000, paybackAmount: 13000, factorRate: 1.3, paymentAmount: 100, paymentFrequency: 'Daily', estimatedTerm: '', notes: '' },
      lastContact: '2026-10-05', followUpDate: '2026-10-12', nextAction: 'Call', notes: [{ id: 'note_1', at: '2026-10-05T12:00:00.000Z', text: 'Keep me' }],
    }],
    tasks: [{ id: 'task_1', rev: 2, sample: false, title: 'Call Real Co', clientId: 'cli_aaaaaa111111', due: '2026-10-12', done: true, doneAt: '2026-10-12T15:00:00.000Z', createdAt: '2026-10-01T12:00:00.000Z' }],
    activity: [{ id: 'act_1', at: '2026-10-05T12:00:00.000Z', type: 'client', text: 'old activity', clientId: null, sample: false }],
  };
  const raw = JSON.stringify(v1, null, 2);
  fs.writeFileSync(path.join(d.data, 'bendavid-os.json'), raw);
  fs.mkdirSync(path.join(d.vault, 'Daily Reports'), { recursive: true });
  fs.mkdirSync(path.join(d.vault, 'Clients'), { recursive: true });
  fs.writeFileSync(path.join(d.vault, 'Daily Reports', '2026-10-12.md'), '# My report with notes\n');
  fs.writeFileSync(path.join(d.vault, 'Clients', 'Real Co (111111).md'), '---\nbendavid_generated: true\ncontent_hash: 0000\n---\n# hand edited\n');

  const srv = new TestServer({ data: d.data, vault: d.vault });
  await srv.start();
  try {
    const { body } = await srv.call('GET', '/api/state');
    const c = body.clients.find((x) => x.id === 'cli_aaaaaa111111');
    assert.ok(c);
    assert.equal(c.rev, 4);
    assert.equal(c.workspaceId, 'delta-capital');
    assert.equal(c.stageChangedAt, '2026-10-05T12:00:00.000Z');
    assert.equal(c.requestedDocs[0].kind, 'bank-statement');
    assert.equal(c.notes[0].text, 'Keep me');
    assert.equal(c.offer.advanceAmount, 10000);
    assert.equal(body.tasks[0].done, true);
    assert.equal(body.clients.filter((x) => x.sample).length, 0, 'no samples injected into an existing database');
    const backups = fs.readdirSync(path.join(d.data, 'backups'));
    const pre = backups.find((f) => f.startsWith('pre-migration-v1-'));
    assert.ok(pre, 'untouched copy of the v1 file kept');
    assert.equal(fs.readFileSync(path.join(d.data, 'backups', pre), 'utf8'), raw);
    assert.equal(JSON.parse(fs.readFileSync(path.join(d.data, 'bendavid-os.json'), 'utf8')).schemaVersion, 2);
    assert.equal(fs.readFileSync(path.join(d.vault, 'output', 'legacy-v1', 'daily-reports', '2026-10-12.md'), 'utf8'), '# My report with notes\n');
    assert.equal(fs.readFileSync(path.join(d.vault, 'output', 'legacy-v1', 'clients', 'Real Co (111111).md'), 'utf8').includes('hand edited'), true);
    assert.ok(!fs.existsSync(path.join(d.vault, 'Daily Reports')));
    assert.match(fs.readFileSync(path.join(d.vault, 'system', 'migration-log.md'), 'utf8'), /v1 → v2/);
    for (const s of ['raw', 'wiki', 'output', 'daily-notes', 'projects', 'system']) assert.ok(fs.existsSync(path.join(d.vault, s, 'index.md')), `${s}/index.md`);
    assert.ok(fs.existsSync(path.join(d.vault, 'index.md')), 'master index');
    assert.ok(fs.existsSync(path.join(d.vault, 'wiki', 'delta-capital', 'index.md')), 'workspace topic index');
  } finally {
    await srv.stop();
    fs.rmSync(d.dir, { recursive: true, force: true });
  }
});

test('a data file from a newer version is refused, not overwritten', async () => {
  const d = tempDirs('bdos-new-');
  fs.mkdirSync(d.data, { recursive: true });
  const file = path.join(d.data, 'bendavid-os.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 99, clients: [] }));
  const srv = new TestServer({ data: d.data, vault: d.vault });
  await assert.rejects(srv.start(), /newer BenDavid OS/);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).schemaVersion, 99);
  fs.rmSync(d.dir, { recursive: true, force: true });
});

test('time helpers use America/New_York, not the computer clock', () => {
  // 03:30 UTC on Oct 14 is still Oct 13 in New York.
  const clock = makeClock('America/New_York', () => new Date('2026-10-14T03:30:00Z'));
  assert.equal(clock.today(), '2026-10-13');
  assert.equal(clock.parts().time, '23:30');
  assert.equal(zoned(new Date('2026-07-01T12:00:00Z'), 'America/New_York').hour, 8);
  assert.deepEqual(monthsBefore('2026-10-13', 3), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(monthsBefore('2026-01-05', 2), ['2025-11', '2025-12']);
});

function inProcess() {
  const d = tempDirs('bdos-core-');
  const { Store } = require('../server/store');
  const { Vault } = require('../server/vault');
  const { WorkflowRegistry } = require('../server/workflows/registry');
  const { RunManager } = require('../server/runs');
  const clock = makeClock('America/New_York');
  const store = new Store({ dataDir: d.data, clock, seedSamples: false });
  const vault = new Vault({ dir: d.vault, clock });
  const registry = new WorkflowRegistry();
  const connections = { requireUsable: async () => {}, recordFailure: () => {}, lightModelOptions: () => ({}), anthropic: {}, claudeCode: {} };
  const runs = new RunManager({ store, vault, registry, connections, clock, dataDir: d.data });
  return { d, store, vault, registry, runs, clock };
}

test('workflows can only do what their allowed actions permit', async () => {
  const { d, registry, runs } = inProcess();
  const base = { workspace: 'test', description: 'x', inputs: [], defaultEngine: 'rules', outputFormat: 'x', errorBehavior: ['x'], engines: { rules: { label: 'Rules', uses: 'saved-data', route: 'deterministic', requires: [], lane: 'local', timeoutMs: 5000 } } };
  registry.register({ ...base, id: 'sneaky-writer', name: 'Sneaky', allowedActions: ['write:output/test'], run: async (ctx) => { ctx.writeKnowledge('system/operating-rules.md', { title: 't', type: 't', sources: [{ ref: 'x', label: 'x' }], uncertainties: [], generatedWith: 'x', body: 'overwrite rules' }); } });
  registry.register({ ...base, id: 'nosy-reader', name: 'Nosy', allowedActions: ['write:output/test'], run: async (ctx) => { ctx.records(); } });
  registry.register({ ...base, id: 'no-sources', name: 'NoSources', allowedActions: ['write:output/test'], run: async (ctx) => { ctx.writeKnowledge('output/test/a.md', { title: 't', type: 't', sources: [], uncertainties: [], generatedWith: 'x', body: 'b' }); } });
  const wait = async (id) => { for (;;) { const r = runs.get(id); if (!['queued', 'running'].includes(r.status)) return r; await new Promise((res) => setTimeout(res, 20)); } };
  const a = await wait((await runs.start({ workflowId: 'sneaky-writer', inputs: {} })).run.id);
  assert.equal(a.status, 'failed');
  assert.match(a.error.message, /not allowed to write system\/operating-rules\.md/);
  const b = await wait((await runs.start({ workflowId: 'nosy-reader', inputs: {} })).run.id);
  assert.equal(b.status, 'failed');
  assert.match(b.error.message, /not allowed to read:records/);
  const c = await wait((await runs.start({ workflowId: 'no-sources', inputs: {} })).run.id);
  assert.equal(c.status, 'failed');
  assert.match(c.error.message, /must list its sources/);
  fs.rmSync(d.dir, { recursive: true, force: true });
});

test('vault paths cannot escape the vault and raw imports are never overwritten', () => {
  const { d, vault } = inProcess();
  for (const bad of ['../x.md', '/etc/passwd', 'raw/../../x.md', 'raw//x.md', '..\\x.md', '']) {
    assert.throws(() => vault.abs(bad), /Invalid vault path|outside/, bad);
  }
  fs.mkdirSync(path.join(d.vault, 'raw'), { recursive: true });
  const a = vault.importText({ title: 'Same title', kind: 'email', content: 'first', workspaceDir: 'raw' });
  const b = vault.importText({ title: 'Same title', kind: 'email', content: 'second', workspaceDir: 'raw' });
  assert.notEqual(a.path, b.path);
  assert.match(fs.readFileSync(path.join(d.vault, ...a.path.split('/')), 'utf8'), /\nfirst$/);
  const f = vault.importFile({ originalName: 'statement.pdf', bytes: Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 1, 2]), workspaceDir: 'raw' });
  assert.deepEqual([...fs.readFileSync(path.join(d.vault, ...f.path.split('/')))], [0x25, 0x50, 0x44, 0x46, 0, 1, 2], 'bytes unchanged');
  assert.ok(fs.existsSync(path.join(d.vault, ...f.sidecar.split('/'))));
  fs.rmSync(d.dir, { recursive: true, force: true });
});

test('scheduler: off by default, fires once inside its window, saved-data only', async () => {
  const { d, store, registry, runs } = inProcess();
  for (const def of require('../server/workspaces/delta-capital/workflows')) registry.register(def);
  const { Scheduler } = require('../server/scheduler');
  let now = new Date('2026-10-13T11:45:30Z'); // 07:45 New York, a Tuesday
  const clock = makeClock('America/New_York', () => now);
  const sch = new Scheduler({ store, runs, registry, clock });
  assert.ok(store.data.settings.schedules.every((s) => !s.enabled), 'all schedules start disabled');
  assert.deepEqual(await sch.tick(now), [], 'nothing fires while disabled');
  sch.update('plan-my-day', { enabled: true });
  assert.deepEqual(await sch.tick(now), ['plan-my-day']);
  assert.deepEqual(await sch.tick(now), [], 'at most once per day');
  const s = store.data.settings.schedules.find((x) => x.workflowId === 'plan-my-day');
  assert.equal(s.lastFiredDate, '2026-10-13');
  const run = store.data.runs.find((r) => r.id === s.lastRunId);
  assert.equal(run.trigger, 'schedule');
  now = new Date('2026-10-14T14:00:00Z'); // 10:00 next day: past the 60-minute window
  assert.deepEqual(await sch.tick(now), [], 'missed window is skipped, not run late');
  now = new Date('2026-10-17T11:46:00Z'); // Saturday
  assert.deepEqual(await sch.tick(now), [], 'only on scheduled days');
  assert.throws(() => sch.update('prepare-follow-up', { enabled: true }), /cannot be scheduled/);
  assert.throws(() => sch.update('plan-my-day', { time: '7am' }), /Time must look like/);
  await assert.rejects(runs.start({ workflowId: 'review-pipeline', inputs: { engine: 'claude-code' }, trigger: 'schedule' }), /saved-data or template/);
  for (let i = 0; i < 100 && ['queued', 'running'].includes(runs.get(run.id).status); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(runs.get(run.id).status, 'succeeded', 'the scheduled run completed');
  fs.rmSync(d.dir, { recursive: true, force: true });
});

test('Markdown renderer escapes HTML and only links to http(s) or vault notes', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'markdown.js'), 'utf8'), sandbox);
  const { render } = sandbox.window.BDOSMarkdown;
  const html = render('# Hi <script>alert(1)</script>\n[x](javascript:alert(1)) [ok](https://example.com) [[system/operating-rules|Rules]]\n<img src=x onerror=alert(1)>\n<!-- bendavid:begin id=x hash=1 -->\n| a | b |\n| --- | --- |\n| 1 | 2 |\n- [x] done', { resolve: (t) => (t === 'system/operating-rules' ? 'system/operating-rules.md' : null) });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(!/href="javascript:/i.test(html));
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /data-open="system\/operating-rules\.md"/);
  assert.ok(!html.includes('bendavid:begin'), 'managed-block markers are hidden');
  assert.match(html, /<table>/);
  assert.match(html, /type="checkbox" disabled checked/);
});
