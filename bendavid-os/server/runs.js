'use strict';
// Run manager: the one task queue shared by every client (browser, future
// Obsidian plugin, CLI, scheduler). Tracks each run's ID, workflow, inputs,
// start time, status, progress, sources, and outputs; enforces timeouts,
// cancellation, and duplicate prevention; persists history in the database.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError } = require('./store');
const { safeFileName } = require('./vault');
const config = require('./config');

const ACTIVE = new Set(['queued', 'running']);
const LANES = { local: 2, model: 2, agent: 1 };
const REQUEST_ID_TTL_MS = 10 * 60 * 1000;
const MAX_PROGRESS = 60;

function clone(v) { return JSON.parse(JSON.stringify(v)); }

class RunManager {
  constructor({ store, vault, registry, connections, clock, dataDir }) {
    Object.assign(this, { store, vault, registry, connections, clock, dataDir });
    this.active = new Map(); // runId -> { run, def, engine, controller, reason }
    this.queues = { local: [], model: [], agent: [] };
    this.running = { local: 0, model: 0, agent: 0 };
    this.requestIds = new Map(); // requestId -> { runId, at }
    this.listeners = [];
  }

  onFinish(fn) { this.listeners.push(fn); }

  // Runs that were queued/running when the app stopped can't be resumed.
  recoverInterrupted() {
    let n = 0;
    for (const r of this.store.data.runs) {
      if (ACTIVE.has(r.status)) {
        r.status = 'interrupted';
        r.finishedAt = r.finishedAt || new Date().toISOString();
        r.error = { code: 'interrupted', message: 'BenDavid OS stopped before this run finished. Run it again if you still need it.' };
        n++;
      }
    }
    if (n) {
      this.store.log('workflow', `${n} unfinished run(s) marked as interrupted after restart`);
      this.store.persist();
    }
    return n;
  }

  newRunId() {
    return `run_${this.clock.today().replace(/-/g, '')}_${crypto.randomBytes(3).toString('hex')}`;
  }

  get(id) {
    const live = this.active.get(id);
    if (live) return clone(live.run);
    const r = this.store.data.runs.find((x) => x.id === id);
    if (!r) throw new HttpError(404, 'Run not found');
    return clone(r);
  }

  list({ limit = 50, status = '', workflowId = '', activeOnly = false } = {}) {
    const live = new Map([...this.active.values()].map((a) => [a.run.id, a.run]));
    return this.store.data.runs
      .map((r) => live.get(r.id) || r)
      .filter((r) => (!activeOnly || ACTIVE.has(r.status)) && (!status || r.status === status) && (!workflowId || r.workflowId === workflowId))
      .slice(0, Math.min(Number(limit) || 50, 500))
      .map(clone);
  }

  async start({ workflowId, inputs, trigger = 'manual', client = 'browser', requestId = null }) {
    const def = this.registry.get(workflowId);
    const clean = this.registry.validateInputs(def, inputs, { store: this.store, today: this.clock.today() });
    const engine = def.engines[clean.engine];
    if (trigger === 'schedule' && engine.uses !== 'saved-data' && engine.uses !== 'template') {
      throw new HttpError(400, 'Scheduled runs may only use saved-data or template engines.');
    }

    // Connection checks first: everything after this point is synchronous, so
    // two near-simultaneous clicks can't both pass the duplicate checks.
    for (const req of engine.requires || []) {
      try {
        await this.connections.requireUsable(req);
      } catch (err) {
        throw new HttpError(409, err.message, { code: 'connection-required', connection: req });
      }
    }

    // Idempotency: the same click (requestId) never starts two runs.
    const now = Date.now();
    for (const [k, v] of this.requestIds) if (now - v.at > REQUEST_ID_TTL_MS) this.requestIds.delete(k);
    if (requestId) {
      if (!/^[\w-]{8,80}$/.test(requestId)) throw new HttpError(400, 'Invalid requestId');
      const seen = this.requestIds.get(requestId);
      if (seen) return { run: this.get(seen.runId), duplicate: true };
    }
    // Duplicate prevention: identical workflow + inputs already queued/running.
    const dedupeKey = this.registry.dedupeKey(workflowId, clean);
    for (const a of this.active.values()) {
      if (a.run.dedupeKey === dedupeKey) {
        if (requestId) this.requestIds.set(requestId, { runId: a.run.id, at: now });
        return { run: clone(a.run), duplicate: true };
      }
    }
    const run = {
      id: this.newRunId(), workflowId, workflowName: def.name, workspaceId: def.workspace,
      inputs: clean, engine: clean.engine, engineLabel: engine.label, uses: engine.uses, route: engine.route,
      trigger, client, requestId, dedupeKey,
      status: 'queued', createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, durationMs: null,
      timeoutMs: config.MAX_RUN_MS ? Math.min(engine.timeoutMs, config.MAX_RUN_MS) : engine.timeoutMs, progress: [], sources: [], outputs: [], result: null, error: null,
      containsSamples: false, reported: null, warnings: [],
    };
    this.addProgress(run, `Queued (${engine.label})`);
    this.store.saveRun(run);
    if (requestId) this.requestIds.set(requestId, { runId: run.id, at: now });
    const entry = { run, def, engine, controller: new AbortController(), reason: null };
    this.active.set(run.id, entry);
    this.queues[engine.lane].push(entry);
    setImmediate(() => this.pump(engine.lane));
    return { run: clone(run), duplicate: false };
  }

  cancel(id) {
    const entry = this.active.get(id);
    if (!entry) {
      const r = this.get(id);
      throw new HttpError(409, `Run is already ${r.status}`);
    }
    entry.reason = 'cancelled';
    const q = this.queues[entry.engine.lane];
    const i = q.indexOf(entry);
    if (i >= 0) {
      q.splice(i, 1);
      this.finish(entry, 'cancelled', null, { code: 'cancelled', message: 'Cancelled before it started.' });
    } else {
      this.addProgress(entry.run, 'Cancel requested');
      entry.controller.abort();
    }
    return clone(entry.run);
  }

  // App is stopping: queued runs never start, running ones are stopped and
  // recorded as interrupted (child processes are killed via the abort signal).
  shutdown() {
    for (const entry of [...this.active.values()]) {
      entry.reason = 'interrupted';
      const q = this.queues[entry.engine.lane];
      const i = q.indexOf(entry);
      if (i >= 0) {
        q.splice(i, 1);
        this.finish(entry, 'interrupted', null, { code: 'interrupted', message: 'BenDavid OS was stopped before this run started.' });
      } else {
        entry.controller.abort();
      }
    }
  }

  cancelAll() {
    for (const id of [...this.active.keys()]) {
      try { this.cancel(id); } catch { /* already finished */ }
    }
  }

  pump(lane) {
    while (this.running[lane] < LANES[lane] && this.queues[lane].length) {
      const entry = this.queues[lane].shift();
      this.running[lane]++;
      this.execute(entry).finally(() => {
        this.running[lane]--;
        this.pump(lane);
      });
    }
  }

  addProgress(run, message) {
    run.progress.push({ at: new Date().toISOString(), message: String(message).slice(0, 500) });
    if (run.progress.length > MAX_PROGRESS) run.progress.splice(1, run.progress.length - MAX_PROGRESS);
  }

  async execute(entry) {
    const { run, def, engine, controller } = entry;
    run.status = 'running';
    run.startedAt = new Date().toISOString();
    this.addProgress(run, 'Started');
    this.store.saveRun(run);
    const timer = setTimeout(() => {
      entry.reason = 'timed_out';
      this.addProgress(run, `Timed out after ${Math.round(run.timeoutMs / 1000)}s`);
      controller.abort();
    }, run.timeoutMs);
    const aborted = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { code: 'aborted' })), { once: true });
    });
    try {
      const ctx = this.buildContext(entry);
      const result = await Promise.race([def.run(ctx), aborted]);
      this.finish(entry, 'succeeded', result || {}, null);
    } catch (err) {
      if (entry.reason === 'cancelled') this.finish(entry, 'cancelled', null, { code: 'cancelled', message: 'Cancelled while running. Any partial output was discarded.' });
      else if (entry.reason === 'interrupted') this.finish(entry, 'interrupted', null, { code: 'interrupted', message: 'BenDavid OS was stopped while this run was in progress.' });
      else if (entry.reason === 'timed_out') this.finish(entry, 'timed_out', null, { code: 'timeout', message: `Stopped: the run exceeded its ${Math.round(run.timeoutMs / 1000)}-second limit.` });
      else {
        if (err.status === 503 || err.code) {
          for (const req of engine.requires || []) this.connections.recordFailure(req, err);
        }
        if (!(err instanceof HttpError) && !err.code) console.error(`[run ${run.id}]`, err);
        this.finish(entry, 'failed', null, {
          code: err.code || 'error',
          message: err.message || 'The workflow failed.',
          detail: err.detail ? String(err.detail).slice(0, 2000) : undefined,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  finish(entry, status, result, error) {
    const { run } = entry;
    if (!ACTIVE.has(run.status)) return;
    run.status = status;
    run.finishedAt = new Date().toISOString();
    run.durationMs = run.startedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : 0;
    if (result) {
      run.result = { summary: String(result.summary || '').slice(0, 1000), data: result.data ?? null };
      if (JSON.stringify(run.result).length > 200_000) run.result.data = { truncated: true };
    }
    run.error = error;
    this.addProgress(run, status === 'succeeded' ? 'Finished' : `${status.replace('_', ' ')}: ${error ? error.message : ''}`);
    this.active.delete(run.id);
    this.store.saveRun(run);
    this.store.log('workflow', `${run.workflowName} ${status.replace('_', ' ')}${run.result && run.result.summary ? `: ${run.result.summary}` : error ? `: ${error.message}` : ''} (${run.id})`, run.inputs.clientId || null, run.containsSamples);
    this.store.commit({ run });
    for (const fn of this.listeners) {
      try { fn(clone(run)); } catch (err) { console.error('[run listener]', err.message); }
    }
  }

  // Capability-scoped context. A workflow can only do what its allowedActions
  // and engine permit; there is no capability to send anything.
  buildContext(entry) {
    const { run, def, engine, controller } = entry;
    const allowed = new Set(def.allowedActions);
    const writePrefixes = def.allowedActions.filter((a) => a.startsWith('write:')).map((a) => a.slice(6));
    const requires = new Set(engine.requires || []);
    const self = this;
    const need = (code) => {
      if (!allowed.has(code)) throw new Error(`${def.name} is not allowed to ${code}`);
    };
    const checkWrite = (rel) => {
      if (!writePrefixes.some((p) => rel === p || rel.startsWith(`${p}/`))) throw new Error(`${def.name} is not allowed to write ${rel}`);
    };
    const recordOutput = (res, kind) => {
      if (res.status === 'protected') {
        run.warnings.push(res.message);
        self.addProgress(run, res.message);
        if (res.wroteInstead) run.outputs.push({ path: res.wroteInstead, kind, note: 'Saved beside your edited file' });
      } else {
        run.outputs.push({ path: res.path, kind });
        self.addProgress(run, `Saved ${res.path}`);
      }
      return res;
    };
    return {
      runId: run.id,
      shortId: run.id.slice(-6),
      inputs: clone(run.inputs),
      engineId: run.engine,
      today: run.inputs.date || this.clock.today(),
      clock: this.clock,
      signal: controller.signal,
      progress: (m) => self.addProgress(run, m),
      addSource: (s) => { if (!run.sources.some((x) => x.ref === s.ref)) run.sources.push({ ref: s.ref, label: s.label, path: s.path || null }); },
      markSample: (flag = true) => { if (flag) run.containsSamples = true; },
      warn: (m) => { run.warnings.push(m); self.addProgress(run, m); },
      records: () => {
        need('read:records');
        const d = self.store.data;
        return clone({ clients: d.clients, tasks: d.tasks, activity: d.activity, rawSources: d.rawSources });
      },
      client: (id) => {
        need('read:records');
        return clone(self.store.getClient(id));
      },
      readVault: (rel) => {
        const area = rel.split('/')[0];
        need(area === 'raw' ? 'read:vault:raw' : 'read:vault:system');
        if (!['system', 'projects', 'raw'].includes(area)) throw new Error(`${def.name} may not read ${rel}`);
        return self.vault.read(rel);
      },
      writeKnowledge: (rel, opts) => {
        checkWrite(rel);
        // Default provenance: every source this run has recorded so far.
        const sources = opts.sources && opts.sources.length ? opts.sources : clone(run.sources);
        return recordOutput(self.vault.writeKnowledge(rel, { ...opts, sources, runId: run.id }), opts.type || 'report');
      },
      upsertBlock: (rel, blockId, content, opts) => {
        checkWrite(rel);
        return recordOutput(self.vault.upsertBlock(rel, blockId, content, opts), 'daily-note');
      },
      outputPath: (folder, title) => `${folder}/${run.inputs.date || self.clock.today()} ${safeFileName(title)} (${run.id.slice(-6)}).md`,
      model: {
        structured: async (opts) => {
          need('call:light-model');
          if (!requires.has('light-model')) throw new Error('This engine does not use the AI service');
          self.addProgress(run, 'Calling the AI service (light model)…');
          const res = await self.connections.anthropic.structured({ ...opts, ...self.connections.lightModelOptions(), signal: controller.signal });
          run.reported = { provider: 'Anthropic API', requestedModel: res.requestedModel, servedBy: res.servedBy, usage: res.usage };
          self.addProgress(run, `AI service answered (model reported: ${res.servedBy})`);
          return res;
        },
      },
      claudeCode: {
        run: async ({ prompt, appendSystemPrompt, files = {} }) => {
          need('exec:claude-code');
          if (!requires.has('claude-code')) throw new Error('This engine does not use Claude Code');
          const dir = path.join(self.dataDir, 'runs', run.id);
          fs.mkdirSync(dir, { recursive: true });
          for (const [rel, content] of Object.entries(files)) {
            const target = path.resolve(dir, rel);
            if (!target.startsWith(dir + path.sep)) throw new Error('Invalid run file path');
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, content);
          }
          run.workDir = path.relative(self.dataDir, dir).split(path.sep).join('/');
          const res = await self.connections.claudeCode.run({
            // The run manager's timer stops the run first; this is a backstop.
            cwd: dir, prompt, appendSystemPrompt, timeoutMs: run.timeoutMs + 5000,
            signal: controller.signal, onProgress: (m) => self.addProgress(run, m),
          });
          run.reported = { provider: 'Claude Code', version: res.version, ...res.reported };
          self.addProgress(run, `Claude Code finished${res.reported.num_turns ? ` in ${res.reported.num_turns} turn(s)` : ''}`);
          return res;
        },
      },
    };
  }
}

module.exports = { RunManager, ACTIVE };
