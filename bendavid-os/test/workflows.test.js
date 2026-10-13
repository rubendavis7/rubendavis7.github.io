'use strict';
// Workflow registry, task queue, controlled execution, and the first
// end-to-end check (all with explicitly labelled SAMPLE data).

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDirs, TestServer, sleep, ROOT } = require('./helpers');

const BANNED = /\b(loans?|interest|lend(ing|er)?|borrow(ing|ed)?|apr)\b/i;
const dirs = tempDirs('bdos-wf-');
const modeFile = path.join(dirs.dir, 'fake-claude-mode');
const claudeLog = path.join(dirs.dir, 'fake-claude.log');
const srv = new TestServer({
  data: dirs.data, vault: dirs.vault,
  env: {
    BENDAVID_NO_SAMPLES: '1',
    CLAUDE_CODE_PATH: path.join(ROOT, 'test', 'fixtures', 'fake-claude.js'),
    FAKE_CLAUDE_MODE_FILE: modeFile, FAKE_CLAUDE_LOG: claudeLog,
    BENDAVID_MAX_RUN_MS: '4000',
  },
});
const setMode = (m) => fs.writeFileSync(modeFile, m);
const claudeCalls = () => (fs.existsSync(claudeLog) ? fs.readFileSync(claudeLog, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

before(() => { setMode('ok'); return srv.start(); });
after(async () => {
  await srv.stop();
  for (const c of claudeCalls()) if (alive(c.pid)) process.kill(c.pid, 'SIGKILL');
  fs.rmSync(dirs.dir, { recursive: true, force: true });
});

describe('first end-to-end check (SAMPLE data)', () => {
  let client;
  let missingRun;
  let draftRun;

  test('1. add a SAMPLE client with outstanding statement months', async () => {
    const r = await srv.call('POST', '/api/clients', {
      sample: true,
      contactName: 'Jordan Rivera (Sample)', businessName: 'Rivera Plumbing (Sample)', email: 'jordan@example.com', phone: '(555) 010-0199',
      followUpDate: '2026-10-14', lastContact: '2026-10-10', nextAction: 'Collect July to September statements',
      requestedDocs: [
        { kind: 'bank-statement', month: '2026-06', received: true },
        { kind: 'bank-statement', month: '2026-07' },
        { kind: 'bank-statement', month: '2026-08' },
        { kind: 'bank-statement', month: '2026-09' },
        { name: 'Signed application', received: true },
      ],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    client = r.body.client;
    assert.equal(client.sample, true);
    assert.match(client.id, /^sample_/);
    assert.equal(client.requestedDocs.filter((d) => d.month && !d.received).length, 3);
  });

  test('2. run Find Missing Statements', async () => {
    missingRun = await srv.runAndWait('find-missing-statements');
    assert.equal(missingRun.status, 'succeeded', JSON.stringify(missingRun.error));
    const row = missingRun.result.data.find((m) => m.clientId === client.id);
    assert.deepEqual(row.missingMonthLabels, ['July 2026', 'August 2026', 'September 2026']);
    assert.equal(missingRun.containsSamples, true);
    assert.equal(missingRun.route, 'deterministic');
    assert.equal(missingRun.uses, 'saved-data');
    assert.equal(missingRun.reported, null, 'no AI service involved, so no usage is shown');
  });

  test('3. generate a labelled follow-up draft', async () => {
    draftRun = await srv.runAndWait('prepare-follow-up', { clientId: client.id });
    assert.equal(draftRun.status, 'succeeded', JSON.stringify(draftRun.error));
    const d = draftRun.result.data;
    assert.equal(d.kind, 'template');
    assert.match(d.label, /TEMPLATE DRAFT\. Not sent/);
    assert.match(d.body, /July, August and September 2026/);
    assert.ok(d.wordCount < 80, `${d.wordCount} words`);
    assert.doesNotMatch(d.body, BANNED);
    assert.doesNotMatch(d.body, /\b(sent|approved)\b/i);
  });

  test('4. results are saved to output/ with labels, sources, date, and uncertainties', () => {
    for (const run of [missingRun, draftRun]) {
      assert.equal(run.outputs.length, 1);
      const rel = run.outputs[0].path;
      assert.match(rel, /^output\/delta-capital\//);
      const text = fs.readFileSync(path.join(dirs.vault, ...rel.split('/')), 'utf8');
      assert.match(rel, /SAMPLE/);
      assert.match(text, /contains_sample_records: true/);
      assert.match(text, /\[!warning\] SAMPLE/);
      assert.match(text, /generated_at: /);
      assert.match(text, new RegExp(`run_id: ${run.id}`));
      assert.match(text, new RegExp(`bendavid-db://clients/${client.id}@rev1`));
      assert.match(text, /## Sources/);
      assert.match(text, /## Uncertainties/);
    }
    const draft = fs.readFileSync(path.join(dirs.vault, ...draftRun.outputs[0].path.split('/')), 'utf8');
    assert.match(draft, /TEMPLATE DRAFT\. Not sent\./);
    assert.match(draft, /draft_status: not sent/);
  });

  test('5. both runs appear in run history with ID, workflow, start time, status, sources, and output', async () => {
    const runs = (await srv.call('GET', '/api/runs?limit=10')).body;
    for (const want of [missingRun, draftRun]) {
      const r = runs.find((x) => x.id === want.id);
      assert.ok(r, `run ${want.id} in history`);
      assert.equal(r.status, 'succeeded');
      assert.ok(r.workflowId && r.startedAt && r.finishedAt && r.sources.length && r.outputs.length);
    }
    const idx = fs.readFileSync(path.join(dirs.vault, 'output', 'index.md'), 'utf8');
    assert.match(idx, /SAMPLE TEMPLATE DRAFT/);
  });

  test('6. after a restart the records, runs, and files are all still there', async () => {
    await srv.restart();
    const { body } = await srv.call('GET', '/api/state');
    const c = body.clients.find((x) => x.id === client.id);
    assert.ok(c, 'client persisted');
    assert.equal(c.requestedDocs.filter((d) => d.month && !d.received).length, 3);
    for (const want of [missingRun, draftRun]) {
      const r = (await srv.call('GET', `/api/runs/${want.id}`)).body;
      assert.equal(r.status, 'succeeded');
      assert.ok(fs.existsSync(path.join(dirs.vault, ...r.outputs[0].path.split('/'))));
    }
    const files = (await srv.call('GET', '/api/knowledge')).body.files.map((f) => f.path);
    assert.ok(files.includes(draftRun.outputs[0].path), 'Knowledge page lists the draft');
  });
});

test('workflow registry describes inputs, engines, connections, actions, output, and errors', async () => {
  const wfs = (await srv.call('GET', '/api/workflows')).body;
  assert.deepEqual(wfs.map((w) => w.id), ['plan-my-day', 'find-missing-statements', 'prepare-follow-up', 'summarize-client', 'review-pipeline']);
  for (const w of wfs) {
    assert.ok(w.inputs && w.engines.length && w.allowedActions.length && w.outputFormat && w.errorBehavior.length, w.id);
    assert.ok(w.allowedActions.some((a) => a.label === 'Never sends email or texts'));
    for (const e of w.engines) assert.ok(['Saved data', 'Template', 'Connected AI service', 'Claude Code runtime'].includes(e.usesLabel));
  }
  const fu = wfs.find((w) => w.id === 'prepare-follow-up');
  const ai = fu.engines.find((e) => e.id === 'ai');
  assert.equal(ai.available, false, 'AI engine unavailable until the AI service is verified');
  assert.match(ai.unavailableReason, /Not configured/);
  assert.ok(fs.existsSync(path.join(dirs.vault, 'system', 'workflow-registry.md')));
});

test('inputs are validated strictly; free text never becomes a command', async () => {
  const r = await srv.call('POST', '/api/workflows/plan-my-day/run', { inputs: { command: 'rm -rf /' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Unknown input/);
  assert.equal((await srv.call('POST', '/api/workflows/prepare-follow-up/run', { inputs: {} })).status, 400, 'client required');
  assert.equal((await srv.call('POST', '/api/workflows/prepare-follow-up/run', { inputs: { clientId: 'cli_nope' } })).status, 400);
  assert.equal((await srv.call('POST', '/api/workflows/delete-everything/run', { inputs: {} })).status, 404);
  assert.equal((await srv.call('POST', '/api/workflows/plan-my-day/run', { inputs: { engine: 'shell' } })).status, 400);
  const ai = await srv.call('POST', '/api/workflows/prepare-follow-up/run', { inputs: { clientId: (await srv.call('GET', '/api/state')).body.clients[0].id, engine: 'ai' } });
  assert.equal(ai.status, 409, 'AI engine refused when the AI service is not connected');
  assert.equal(ai.body.code, 'connection-required');
});

test('repeated clicks with the same requestId start only one run', async () => {
  const body = { inputs: {}, requestId: 'click-0123456789' };
  const [a, b] = await Promise.all([srv.call('POST', '/api/workflows/review-pipeline/run', body), srv.call('POST', '/api/workflows/review-pipeline/run', body)]);
  assert.equal(a.body.run.id, b.body.run.id);
  assert.ok(a.body.duplicate || b.body.duplicate);
  const c = await srv.call('POST', '/api/workflows/review-pipeline/run', body);
  assert.equal(c.body.run.id, a.body.run.id);
  assert.equal(c.body.duplicate, true);
});

test('Plan My Day writes a daily note section and never overwrites your edits to it', async () => {
  const run = await srv.runAndWait('plan-my-day', { date: '2026-10-13' });
  assert.equal(run.status, 'succeeded');
  const file = path.join(dirs.vault, 'daily-notes', '2026-10-13.md');
  let text = fs.readFileSync(file, 'utf8');
  assert.match(text, /bendavid:begin id=plan/);
  assert.match(text, /SAMPLE item\(s\) left out/, 'samples stay out of daily notes');
  fs.writeFileSync(file, `${text}\nMy own review notes.\n`);
  const again = await srv.runAndWait('plan-my-day', { date: '2026-10-13' });
  assert.equal(again.status, 'succeeded');
  text = fs.readFileSync(file, 'utf8');
  assert.match(text, /My own review notes\./, 'text outside the managed block is kept');
  fs.writeFileSync(file, text.replace('### Completed today', '### Completed today (edited by me)'));
  const third = await srv.runAndWait('plan-my-day', { date: '2026-10-13' });
  assert.ok(third.warnings.some((w) => /edited by hand/.test(w)));
  assert.match(fs.readFileSync(file, 'utf8'), /edited by me/);
  assert.match(third.outputs[0].path, /^output\/delta-capital\/plans\//, 'new plan saved to output/ instead');
});

describe('controlled Claude Code execution (test double)', () => {
  test('self-test verifies the runtime before any workflow may use it', async () => {
    const before = (await srv.call('GET', '/api/connections')).body.find((c) => c.id === 'claude-code');
    assert.equal(before.state, 'unverified');
    assert.equal((await srv.call('POST', '/api/workflows/review-pipeline/run', { inputs: { engine: 'claude-code' } })).status, 409);
    const after = (await srv.call('POST', '/api/connections/claude-code/test')).body;
    assert.equal(after.state, 'verified', after.detail);
  });

  test('runs with fixed arguments, read-only tools, no bypass, in a per-run folder', async () => {
    fs.rmSync(claudeLog, { force: true });
    setMode('ok');
    const run = await srv.runAndWait('review-pipeline', { engine: 'claude-code' });
    assert.equal(run.status, 'succeeded', JSON.stringify(run.error));
    assert.equal(run.route, 'workflow');
    assert.equal(run.reported.provider, 'Claude Code');
    assert.equal(run.reported.num_turns, 2, 'usage shown only as reported by Claude Code');
    const call = claudeCalls().pop();
    const { args } = call;
    assert.equal(args[args.indexOf('--output-format') + 1], 'json');
    assert.equal(args[args.indexOf('--tools') + 1], 'Read,Glob,Grep');
    assert.equal(args[args.indexOf('--permission-prompts') + 1], 'none');
    assert.ok(args.includes('--strict-mcp-config'));
    assert.ok(!args.some((a) => /dangerously|bypassPermissions/.test(a)), 'native permissions are not bypassed');
    assert.equal(path.resolve(call.cwd), path.resolve(dirs.data, 'runs', run.id));
    assert.deepEqual(call.files.sort(), ['analysis.json', 'context', 'pipeline.json']);
    const out = fs.readFileSync(path.join(dirs.vault, ...run.outputs[0].path.split('/')), 'utf8');
    assert.match(out, /generated_with: "Claude Code 9\.9\.9/);
    assert.match(out, /Written review by Claude Code/);
  });

  test('cancel stops the run and kills the process', async () => {
    fs.rmSync(claudeLog, { force: true });
    setMode('hang');
    const start = await srv.call('POST', '/api/workflows/review-pipeline/run', { inputs: { engine: 'claude-code' } });
    const dup = await srv.call('POST', '/api/workflows/review-pipeline/run', { inputs: { engine: 'claude-code' } });
    assert.equal(dup.body.duplicate, true, 'identical active run is not started twice');
    assert.equal(dup.body.run.id, start.body.run.id);
    for (let i = 0; i < 50 && !claudeCalls().length; i++) await sleep(50);
    const pid = claudeCalls()[0].pid;
    assert.ok(alive(pid));
    const c = await srv.call('POST', `/api/runs/${start.body.run.id}/cancel`);
    assert.equal(c.status, 200);
    const run = await srv.waitRun(start.body.run.id);
    assert.equal(run.status, 'cancelled');
    await sleep(300);
    assert.equal(alive(pid), false, 'Claude Code process was stopped');
  });

  test('time limits stop runaway runs', async () => {
    fs.rmSync(claudeLog, { force: true });
    setMode('hang');
    const start = await srv.call('POST', '/api/workflows/review-pipeline/run', { inputs: { engine: 'claude-code', includeSamples: false } });
    const run = await srv.waitRun(start.body.run.id, 15000);
    assert.equal(run.status, 'timed_out');
    assert.match(run.error.message, /limit/);
    await sleep(300);
    assert.equal(alive(claudeCalls()[0].pid), false);
  });

  test('errors reported by Claude Code fail the run with details', async () => {
    setMode('error');
    const run = await srv.runAndWait('review-pipeline', { engine: 'claude-code' });
    assert.equal(run.status, 'failed');
    assert.equal(run.error.code, 'run-failed');
    assert.match(run.error.detail, /Simulated failure/);
  });

  test('a run in progress when the app stops is recorded as interrupted', async () => {
    fs.rmSync(claudeLog, { force: true });
    setMode('hang');
    const start = await srv.call('POST', '/api/workflows/review-pipeline/run', { inputs: { engine: 'claude-code' } });
    for (let i = 0; i < 50 && !claudeCalls().length; i++) await sleep(50);
    await srv.stop('SIGTERM');
    await srv.start();
    const run = (await srv.call('GET', `/api/runs/${start.body.run.id}`)).body;
    assert.equal(run.status, 'interrupted');
    await sleep(300);
    assert.equal(alive(claudeCalls()[0].pid), false, 'process stopped on shutdown');
    setMode('ok');
  });
});

test('router: known requests become decisions, ambiguous or unknown ones ask', async () => {
  const route = async (text) => (await srv.call('POST', '/api/route', { text })).body.decision;
  assert.equal((await route('plan my day')).workflowId, 'plan-my-day');
  assert.equal((await route('missing statements')).workflowId, 'find-missing-statements');
  const fu = await route('follow up jordan');
  assert.equal(fu.type, 'run');
  assert.equal(fu.workflowId, 'prepare-follow-up');
  assert.equal(fu.confirm, false);
  const ai = await route('summarize jordan with ai');
  assert.equal(ai.inputs.engine, 'ai');
  assert.equal(ai.confirm, true, 'AI routes always ask first');
  assert.equal((await route('review pipeline with claude code')).confirm, true);
  assert.equal((await route('summarize missing statements')).type, 'clarify');
  assert.equal((await route('make me a sandwich')).type, 'clarify');
  assert.equal((await route('follow up')).type, 'clarify');
  const unknown = await route('follow up zzzz');
  assert.equal(unknown.type, 'clarify');
  assert.match(unknown.question, /No client matches/);
  const any = JSON.stringify(await route('plan my day'));
  assert.doesNotMatch(any, /confidence/i);
});
