'use strict';
// BenDavid OS data store: the single authoritative database.
// One JSON file (data/bendavid-os.json) holds clients, tasks, activity, workflow
// runs, imported-source metadata, and settings. Writes are atomic (temp file +
// rename) and every client/task carries a `rev` number, so a stale edit can
// never silently overwrite a newer one (the API answers 409 instead).
// Markdown files in the vault are derived views of this data, never the source.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DEFAULT_WORKSPACE, getWorkspace } = require('./workspaces');
const { isMonth, monthLabel, monthsBefore } = require('./time');

const SCHEMA_VERSION = 2;
const MAX_ACTIVITY = 500;
const MAX_RUNS = 500;
const AUTO_BACKUPS_KEPT = 14;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function defaultSettings() {
  return {
    // Future scheduled execution. Every schedule starts DISABLED.
    schedules: [
      { workflowId: 'plan-my-day', enabled: false, time: '07:45', days: [...WEEKDAYS], lastFiredDate: '', lastRunId: '' },
      { workflowId: 'find-missing-statements', enabled: false, time: '09:00', days: [...WEEKDAYS], lastFiredDate: '', lastRunId: '' },
      { workflowId: 'review-pipeline', enabled: false, time: '16:00', days: ['fri'], lastFiredDate: '', lastRunId: '' },
    ],
    voice: { transcription: 'none', speech: 'none', verified: {} },
    connectionTests: {},
  };
}

// ---------- field sanitizers ----------
function str(v, max = 500) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, max);
}
function date(v, field) {
  const s = str(v, 10);
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new HttpError(400, `${field} must be a date like 2026-10-13`);
  }
  return s;
}
function email(v) {
  const s = str(v, 200);
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Email address looks invalid');
  return s;
}
function money(v, field) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${field} must be a positive number`);
  return Math.round(n * 100) / 100;
}
function docs(list, today) {
  if (!Array.isArray(list)) throw new HttpError(400, 'requestedDocs must be a list');
  const seenMonths = new Set();
  const out = [];
  for (const raw of list.slice(0, 60)) {
    const d = typeof raw === 'string' ? { name: raw } : raw || {};
    if (d.month !== undefined && d.month !== '' && !isMonth(d.month)) {
      throw new HttpError(400, 'Statement month must look like 2026-07');
    }
    const month = isMonth(d.month) ? d.month : '';
    if (month) {
      if (seenMonths.has(month)) continue;
      seenMonths.add(month);
    }
    const name = str(d.name, 120) || (month ? `Bank statement: ${monthLabel(month)}` : '');
    if (!name) continue;
    const kind = month || d.kind === 'bank-statement' || (d.kind !== 'document' && /statement/i.test(name)) ? 'bank-statement' : 'document';
    const received = Boolean(d.received);
    out.push({
      id: typeof d.id === 'string' && /^[\w-]{1,40}$/.test(d.id) ? d.id : newId('doc'),
      name, kind, month, received,
      requestedAt: date(d.requestedAt, 'requestedAt') || today,
      receivedAt: received ? date(d.receivedAt, 'receivedAt') || today : '',
    });
  }
  return out;
}
function offer(o) {
  o = o || {};
  return {
    confirmed: Boolean(o.confirmed),
    funder: str(o.funder, 120),
    advanceAmount: money(o.advanceAmount, 'Funding amount'),
    paybackAmount: money(o.paybackAmount, 'Payback amount'),
    factorRate: money(o.factorRate, 'Factor rate'),
    paymentAmount: money(o.paymentAmount, 'Remittance amount'),
    paymentFrequency: ['', 'Daily', 'Weekly', 'Bi-weekly', 'Monthly'].includes(o.paymentFrequency) ? o.paymentFrequency : '',
    estimatedTerm: str(o.estimatedTerm, 60),
    notes: str(o.notes, 1000),
  };
}

// ---------- schema migrations ----------
// v1 (first release) -> v2: workspaces, statement months, stage timestamps,
// workflow runs, imported sources, settings. Nothing is removed.
function migrate(data, { now }) {
  const from = data.schemaVersion || 1;
  if (from > SCHEMA_VERSION) {
    throw new Error(`Data file was written by a newer BenDavid OS (schema ${from}). Update the app; nothing was changed.`);
  }
  if (from >= SCHEMA_VERSION) return null;
  for (const k of ['clients', 'tasks', 'activity']) if (!Array.isArray(data[k])) data[k] = [];
  for (const c of data.clients) {
    c.workspaceId = c.workspaceId || DEFAULT_WORKSPACE;
    c.stageChangedAt = c.stageChangedAt || c.updatedAt || c.createdAt || now;
    c.notes = Array.isArray(c.notes) ? c.notes : [];
    c.requestedDocs = (c.requestedDocs || []).map((d) => ({
      ...d,
      kind: d.kind || (/statement/i.test(d.name || '') ? 'bank-statement' : 'document'),
      month: d.month || '',
    }));
  }
  for (const t of data.tasks) t.workspaceId = t.workspaceId || DEFAULT_WORKSPACE;
  data.runs = Array.isArray(data.runs) ? data.runs : [];
  data.rawSources = Array.isArray(data.rawSources) ? data.rawSources : [];
  data.settings = { ...defaultSettings(), ...(data.settings || {}) };
  data.migrations = [...(data.migrations || []), { from, to: SCHEMA_VERSION, at: now }];
  data.schemaVersion = SCHEMA_VERSION;
  return { from, to: SCHEMA_VERSION };
}

class Store {
  constructor({ dataDir, clock, seedSamples = true }) {
    this.dataDir = dataDir;
    this.clock = clock;
    this.file = path.join(dataDir, 'bendavid-os.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.seedSamples = seedSamples;
    this.listeners = [];
    this.migration = null;
    this.load();
  }

  today() { return this.clock.today(); }

  load() {
    fs.mkdirSync(this.backupDir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.data = {
        schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(),
        clients: [], tasks: [], activity: [], runs: [], rawSources: [], settings: defaultSettings(),
      };
      if (this.seedSamples) this.loadSamples(false);
      this.persist();
      return;
    }
    const raw = fs.readFileSync(this.file, 'utf8');
    try {
      this.data = JSON.parse(raw);
    } catch (err) {
      // Never overwrite a file we cannot read; the user restores from data/backups.
      throw new Error(`Data file ${this.file} is not valid JSON (${err.message}). ` +
        'Restore a copy from data/backups/ and restart. Nothing was overwritten.');
    }
    const before = this.data.schemaVersion || 1;
    if (before < SCHEMA_VERSION) {
      // Keep an untouched copy of the old file before upgrading it.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.preMigrationBackup = path.join(this.backupDir, `pre-migration-v${before}-${stamp}.json`);
      fs.writeFileSync(this.preMigrationBackup, raw);
    }
    this.migration = migrate(this.data, { now: new Date().toISOString() });
    if (this.migration) {
      this.log('system', `Upgraded data file from schema v${this.migration.from} to v${this.migration.to}. Backup: ${path.basename(this.preMigrationBackup)}`);
      this.persist();
    }
  }

  onChange(fn) { this.listeners.push(fn); }

  persist() {
    this.autoBackup();
    this.data.savedAt = new Date().toISOString();
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  autoBackup() {
    if (!fs.existsSync(this.file)) return;
    const target = path.join(this.backupDir, `auto-${this.today()}.json`);
    if (fs.existsSync(target)) return;
    fs.copyFileSync(this.file, target);
    const autos = fs.readdirSync(this.backupDir).filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of autos.slice(0, Math.max(0, autos.length - AUTO_BACKUPS_KEPT))) fs.unlinkSync(path.join(this.backupDir, f));
  }

  backupNow() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(this.backupDir, `manual-${stamp}.json`);
    fs.copyFileSync(this.file, target);
    return target;
  }

  commit(changed) {
    this.persist();
    for (const fn of this.listeners) {
      try { fn(changed); } catch (err) { console.error('[store listener]', err.message); }
    }
  }

  log(type, text, clientId = null, sample = false) {
    this.data.activity.unshift({ id: newId('act'), at: new Date().toISOString(), type, text, clientId, sample });
    this.data.activity.length = Math.min(this.data.activity.length, MAX_ACTIVITY);
  }

  workspaceFor(record) { return getWorkspace(record.workspaceId || DEFAULT_WORKSPACE); }

  // ---------- clients ----------
  getClient(id) {
    const c = this.data.clients.find((x) => x.id === id);
    if (!c) throw new HttpError(404, 'Client not found');
    return c;
  }

  checkRev(record, rev) {
    if (rev === undefined || rev === null) throw new HttpError(400, 'Missing rev (record version)');
    if (Number(rev) !== record.rev) {
      throw new HttpError(409, 'This record changed since you opened it. Reload to see the newer version; nothing was overwritten.', { current: record });
    }
  }

  clientFields(ws) {
    const today = this.today();
    return {
      contactName: (v) => str(v, 120),
      businessName: (v) => str(v, 160),
      email,
      phone: (v) => str(v, 40),
      stage: (v) => {
        const s = str(v, 40);
        if (!ws.stages.includes(s)) throw new HttpError(400, `Stage must be one of: ${ws.stages.join(', ')}`);
        return s;
      },
      requestedDocs: (v) => docs(v, today),
      offer,
      lastContact: (v) => date(v, 'Last contact'),
      followUpDate: (v) => date(v, 'Follow-up date'),
      nextAction: (v) => str(v, 300),
    };
  }

  createClient(input, { sample = false } = {}) {
    const isSample = sample || input.sample === true;
    const ws = getWorkspace(input.workspaceId || DEFAULT_WORKSPACE);
    const now = new Date().toISOString();
    const defaultMonths = monthsBefore(this.today(), ws.defaultStatementMonths).map((month) => ({ kind: 'bank-statement', month }));
    const c = {
      id: newId(isSample ? 'sample' : 'cli'), rev: 1, sample: isSample, workspaceId: ws.id,
      createdAt: now, updatedAt: now, stageChangedAt: now,
      contactName: '', businessName: '', email: '', phone: '', stage: ws.stages[0],
      requestedDocs: docs([...defaultMonths, ...ws.defaultDocs], this.today()), offer: offer({}),
      lastContact: '', followUpDate: '', nextAction: 'Request bank statements', notes: [],
    };
    for (const [k, fn] of Object.entries(this.clientFields(ws))) if (input[k] !== undefined) c[k] = fn(input[k]);
    if (!c.contactName) throw new HttpError(400, 'Contact name is required');
    if (!c.businessName) throw new HttpError(400, 'Business name is required');
    this.data.clients.push(c);
    this.log('client', `Added ${isSample ? 'SAMPLE ' : ''}client ${c.businessName} (${c.contactName})`, c.id, isSample);
    if (!sample) this.commit({ client: c });
    return c;
  }

  updateClient(id, input) {
    const c = this.getClient(id);
    this.checkRev(c, input.rev);
    const before = c.stage;
    // Validate everything first so a bad field never leaves a half-applied edit.
    const next = {};
    for (const [k, fn] of Object.entries(this.clientFields(this.workspaceFor(c)))) if (input[k] !== undefined) next[k] = fn(input[k]);
    if ((next.contactName ?? c.contactName) === '' || (next.businessName ?? c.businessName) === '') {
      throw new HttpError(400, 'Contact name and business name are required');
    }
    Object.assign(c, next);
    c.rev += 1;
    c.updatedAt = new Date().toISOString();
    if (before !== c.stage) c.stageChangedAt = c.updatedAt;
    this.log('client', before !== c.stage ? `Updated ${c.businessName}; stage ${before} → ${c.stage}` : `Updated ${c.businessName}`, c.id, c.sample);
    this.commit({ client: c });
    return c;
  }

  moveStage(id, { stage: to, rev }) {
    const c = this.getClient(id);
    this.checkRev(c, rev);
    const target = this.clientFields(this.workspaceFor(c)).stage(to);
    if (target === c.stage) return c;
    const from = c.stage;
    c.stage = target;
    c.rev += 1;
    c.updatedAt = new Date().toISOString();
    c.stageChangedAt = c.updatedAt;
    this.log('stage', `${c.businessName}: ${from} → ${target}`, c.id, c.sample);
    this.commit({ client: c });
    return c;
  }

  addNote(id, { text }) {
    const c = this.getClient(id);
    const t = str(text, 4000);
    if (!t) throw new HttpError(400, 'Note text is required');
    c.notes.unshift({ id: newId('note'), at: new Date().toISOString(), text: t });
    c.rev += 1;
    c.updatedAt = new Date().toISOString();
    this.log('note', `Note on ${c.businessName}: ${t.slice(0, 80)}${t.length > 80 ? '…' : ''}`, c.id, c.sample);
    this.commit({ client: c });
    return c;
  }

  deleteClient(id, { rev }) {
    const c = this.getClient(id);
    this.checkRev(c, rev);
    this.data.clients = this.data.clients.filter((x) => x.id !== id);
    this.data.tasks = this.data.tasks.filter((t) => t.clientId !== id);
    this.log('client', `Deleted client ${c.businessName}`, null, c.sample);
    this.commit({ deletedClient: c });
  }

  // ---------- tasks ----------
  getTask(id) {
    const t = this.data.tasks.find((x) => x.id === id);
    if (!t) throw new HttpError(404, 'Task not found');
    return t;
  }

  createTask(input, { sample = false } = {}) {
    const title = str(input.title, 300);
    if (!title) throw new HttpError(400, 'Task title is required');
    const clientId = input.clientId ? str(input.clientId, 40) : null;
    const client = clientId ? this.getClient(clientId) : null;
    const isSample = sample || Boolean(client && client.sample);
    const t = {
      id: newId(isSample ? 'sample' : 'task'), rev: 1, sample: isSample, title, clientId,
      workspaceId: client ? client.workspaceId : DEFAULT_WORKSPACE,
      due: date(input.due, 'Due date'), done: false, doneAt: '',
      createdAt: new Date().toISOString(),
    };
    this.data.tasks.push(t);
    this.log('task', `Task added: ${title}`, clientId, isSample);
    if (!sample) this.commit({ task: t });
    return t;
  }

  updateTask(id, input) {
    const t = this.getTask(id);
    this.checkRev(t, input.rev);
    const next = {};
    if (input.title !== undefined) {
      next.title = str(input.title, 300);
      if (!next.title) throw new HttpError(400, 'Task title is required');
    }
    if (input.due !== undefined) next.due = date(input.due, 'Due date');
    Object.assign(t, next);
    if (input.done !== undefined && Boolean(input.done) !== t.done) {
      t.done = Boolean(input.done);
      t.doneAt = t.done ? new Date().toISOString() : '';
      this.log('task', `${t.done ? 'Completed' : 'Reopened'}: ${t.title}`, t.clientId, t.sample);
    }
    t.rev += 1;
    this.commit({ task: t });
    return t;
  }

  deleteTask(id, { rev }) {
    const t = this.getTask(id);
    this.checkRev(t, rev);
    this.data.tasks = this.data.tasks.filter((x) => x.id !== id);
    this.log('task', `Task deleted: ${t.title}`, t.clientId, t.sample);
    this.commit({ deletedTask: t });
  }

  // ---------- workflow runs (task queue history) ----------
  saveRun(run) {
    const i = this.data.runs.findIndex((r) => r.id === run.id);
    const copy = JSON.parse(JSON.stringify(run));
    if (i >= 0) this.data.runs[i] = copy;
    else this.data.runs.unshift(copy);
    if (this.data.runs.length > MAX_RUNS) this.data.runs.length = MAX_RUNS;
    this.persist();
  }

  // ---------- imported sources (raw/) ----------
  addRawSource(meta) {
    const rec = { id: newId('src'), importedAt: new Date().toISOString(), ...meta };
    this.data.rawSources.unshift(rec);
    this.log('knowledge', `Imported ${rec.kind || 'source'} into ${rec.path}`, rec.clientId || null);
    this.commit({ rawSource: rec });
    return rec;
  }

  // ---------- settings ----------
  updateSettings(mutator, logText) {
    mutator(this.data.settings);
    if (logText) this.log('system', logText);
    this.commit({ settings: true });
    return this.data.settings;
  }

  // ---------- sample records ----------
  loadSamples(commit = true) {
    if (this.data.clients.some((c) => c.sample)) throw new HttpError(409, 'Sample records are already loaded');
    const { buildSamples } = require('./workspaces/delta-capital/samples');
    const { clients, tasks } = buildSamples(this.today());
    const idMap = {};
    for (const s of clients) {
      const { key, notes, ...fields } = s;
      const c = this.createClient(fields, { sample: true });
      c.notes = (notes || []).map((text) => ({ id: newId('note'), at: new Date().toISOString(), text }));
      idMap[key] = c.id;
    }
    for (const t of tasks) this.createTask({ ...t, clientId: idMap[t.clientKey] }, { sample: true });
    this.log('system', 'Loaded SAMPLE records (fictional, for practice only)', null, true);
    if (commit) this.commit({ samples: true });
  }

  removeSamples() {
    const removed = this.data.clients.filter((c) => c.sample);
    this.data.clients = this.data.clients.filter((c) => !c.sample);
    this.data.tasks = this.data.tasks.filter((t) => !t.sample);
    this.data.activity = this.data.activity.filter((a) => !a.sample);
    this.log('system', `Removed ${removed.length} sample client record(s)`);
    this.commit({ samples: false, removedSamples: removed });
    return removed.length;
  }

  snapshot({ includeSamples = true } = {}) {
    const keep = (r) => includeSamples || !r.sample;
    return {
      schemaVersion: this.data.schemaVersion,
      exportedAt: new Date().toISOString(),
      clients: this.data.clients.filter(keep),
      tasks: this.data.tasks.filter(keep),
      activity: this.data.activity.filter(keep),
      runs: this.data.runs.filter((r) => includeSamples || !r.containsSamples),
      rawSources: this.data.rawSources,
    };
  }
}

module.exports = { Store, HttpError, newId, SCHEMA_VERSION, defaultSettings, migrate };
