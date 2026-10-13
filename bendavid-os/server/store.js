'use strict';
// BenDavid OS data store.
// One JSON file (data/bendavid-os.json) is the single authoritative source for
// clients, tasks, and activity. Writes are atomic (temp file + rename) and every
// record carries a `rev` number so a stale edit can never silently overwrite a
// newer one (the API answers 409 instead).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSamples } = require('./samples');

const STAGES = ['Statements', 'Offer', 'Accepted', 'Contract', 'Bank Verification', 'Funding Call', 'Funded'];
const DEFAULT_DOCS = ['Business bank statements (last 4 months)', 'Signed application'];
const SCHEMA_VERSION = 1;
const MAX_ACTIVITY = 500;
const AUTO_BACKUPS_KEPT = 14;

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function todayISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

// ---------- field sanitizers ----------
function str(v, max = 500) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max);
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
function stage(v) {
  const s = str(v, 40);
  if (!STAGES.includes(s)) throw new HttpError(400, `Stage must be one of: ${STAGES.join(', ')}`);
  return s;
}
function docs(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'requestedDocs must be a list');
  return list
    .map((d) => (typeof d === 'string' ? { name: d } : d || {}))
    .filter((d) => str(d.name, 120))
    .slice(0, 40)
    .map((d) => ({
      id: typeof d.id === 'string' && d.id ? d.id.slice(0, 40) : newId('doc'),
      name: str(d.name, 120),
      received: Boolean(d.received),
      requestedAt: date(d.requestedAt, 'requestedAt') || todayISO(),
      receivedAt: d.received ? date(d.receivedAt, 'receivedAt') || todayISO() : '',
    }));
}
function offer(o) {
  o = o || {};
  return {
    confirmed: Boolean(o.confirmed),
    funder: str(o.funder, 120),
    advanceAmount: money(o.advanceAmount, 'Advance amount'),
    paybackAmount: money(o.paybackAmount, 'Payback amount'),
    factorRate: money(o.factorRate, 'Factor rate'),
    paymentAmount: money(o.paymentAmount, 'Payment amount'),
    paymentFrequency: ['', 'Daily', 'Weekly', 'Bi-weekly', 'Monthly'].includes(o.paymentFrequency) ? o.paymentFrequency : '',
    estimatedTerm: str(o.estimatedTerm, 60),
    notes: str(o.notes, 1000),
  };
}

const CLIENT_FIELDS = {
  contactName: (v) => str(v, 120),
  businessName: (v) => str(v, 160),
  email,
  phone: (v) => str(v, 40),
  stage,
  requestedDocs: docs,
  offer,
  lastContact: (v) => date(v, 'Last contact'),
  followUpDate: (v) => date(v, 'Follow-up date'),
  nextAction: (v) => str(v, 300),
};

class Store {
  constructor({ dataDir, seedSamples = true }) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'bendavid-os.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.seedSamples = seedSamples;
    this.listeners = [];
    this.load();
  }

  load() {
    fs.mkdirSync(this.backupDir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.data = { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), clients: [], tasks: [], activity: [] };
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
    for (const k of ['clients', 'tasks', 'activity']) if (!Array.isArray(this.data[k])) this.data[k] = [];
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
    const target = path.join(this.backupDir, `auto-${todayISO()}.json`);
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

  createClient(input, { sample = false } = {}) {
    const c = {
      id: newId(sample ? 'sample' : 'cli'),
      rev: 1,
      sample,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contactName: '', businessName: '', email: '', phone: '', stage: STAGES[0],
      requestedDocs: docs(DEFAULT_DOCS), offer: offer({}),
      lastContact: '', followUpDate: '', nextAction: 'Request bank statements', notes: [],
    };
    for (const [k, fn] of Object.entries(CLIENT_FIELDS)) if (input[k] !== undefined) c[k] = fn(input[k]);
    if (!c.contactName) throw new HttpError(400, 'Contact name is required');
    if (!c.businessName) throw new HttpError(400, 'Business name is required');
    this.data.clients.push(c);
    this.log('client', `Added client ${c.businessName} (${c.contactName})`, c.id, sample);
    if (!sample) this.commit({ client: c });
    return c;
  }

  updateClient(id, input) {
    const c = this.getClient(id);
    this.checkRev(c, input.rev);
    const before = c.stage;
    // Validate everything first so a bad field never leaves a half-applied edit.
    const next = {};
    for (const [k, fn] of Object.entries(CLIENT_FIELDS)) if (input[k] !== undefined) next[k] = fn(input[k]);
    if ((next.contactName ?? c.contactName) === '' || (next.businessName ?? c.businessName) === '') {
      throw new HttpError(400, 'Contact name and business name are required');
    }
    Object.assign(c, next);
    c.rev += 1;
    c.updatedAt = new Date().toISOString();
    this.log('client', before !== c.stage ? `Updated ${c.businessName}; stage ${before} → ${c.stage}` : `Updated ${c.businessName}`, c.id, c.sample);
    this.commit({ client: c });
    return c;
  }

  moveStage(id, { stage: to, rev }) {
    const c = this.getClient(id);
    this.checkRev(c, rev);
    const target = stage(to);
    if (target === c.stage) return c;
    const from = c.stage;
    c.stage = target;
    c.rev += 1;
    c.updatedAt = new Date().toISOString();
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
    if (clientId) this.getClient(clientId);
    const t = {
      id: newId(sample ? 'sample' : 'task'), rev: 1, sample, title, clientId,
      due: date(input.due, 'Due date'), done: false, doneAt: '',
      createdAt: new Date().toISOString(),
    };
    this.data.tasks.push(t);
    this.log('task', `Task added: ${title}`, clientId, sample);
    if (!sample) this.commit({ task: t });
    return t;
  }

  updateTask(id, input) {
    const t = this.getTask(id);
    this.checkRev(t, input.rev);
    if (input.title !== undefined) {
      t.title = str(input.title, 300);
      if (!t.title) throw new HttpError(400, 'Task title is required');
    }
    if (input.due !== undefined) t.due = date(input.due, 'Due date');
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

  // ---------- sample records ----------
  loadSamples(commit = true) {
    if (this.data.clients.some((c) => c.sample)) throw new HttpError(409, 'Sample records are already loaded');
    const { clients, tasks } = buildSamples(new Date());
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
    const n = this.data.clients.filter((c) => c.sample).length;
    this.data.clients = this.data.clients.filter((c) => !c.sample);
    this.data.tasks = this.data.tasks.filter((t) => !t.sample);
    this.data.activity = this.data.activity.filter((a) => !a.sample);
    this.log('system', `Removed ${n} sample client record(s)`);
    this.commit({ samples: false });
    return n;
  }

  snapshot({ includeSamples = true } = {}) {
    const keep = (r) => includeSamples || !r.sample;
    return {
      schemaVersion: this.data.schemaVersion,
      exportedAt: new Date().toISOString(),
      clients: this.data.clients.filter(keep),
      tasks: this.data.tasks.filter(keep),
      activity: this.data.activity.filter(keep),
    };
  }
}

module.exports = { Store, STAGES, HttpError, todayISO, newId };
