'use strict';
// Workflow registry: the fixed, validated set of entry points. A workflow can
// only be started by ID with inputs that pass its schema; unknown inputs are
// rejected, and free text from the browser never becomes a command.

const { HttpError } = require('../store');

const USES = {
  'saved-data': 'Saved data',
  template: 'Template',
  'ai-service': 'Connected AI service',
  'claude-code': 'Claude Code runtime',
};
const ROUTES = {
  deterministic: 'Saved data & deterministic operations (no AI call)',
  light: 'Lightweight reasoning (configured model)',
  workflow: 'Workflow execution (Claude Code runtime)',
};

function actionLabel(code) {
  const [verb, ...rest] = code.split(':');
  const target = rest.join(':');
  switch (verb) {
    case 'read': return target === 'records' ? 'Read client, task, and activity records' : `Read vault files in ${target.replace(/^vault:/, '')}/`;
    case 'write': return `Write files in ${target}/`;
    case 'call': return 'Call the configured AI service (light model)';
    case 'exec': return 'Run Claude Code with read-only tools in a per-run folder';
    default: return code;
  }
}

function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

class WorkflowRegistry {
  constructor() { this.defs = new Map(); }

  register(def) {
    for (const k of ['id', 'name', 'description', 'inputs', 'engines', 'defaultEngine', 'allowedActions', 'outputFormat', 'errorBehavior', 'run']) {
      if (def[k] === undefined) throw new Error(`Workflow ${def.id || '?'} is missing "${k}"`);
    }
    for (const [id, e] of Object.entries(def.engines)) {
      if (!USES[e.uses] || !ROUTES[e.route] || !e.lane || !e.timeoutMs) throw new Error(`Workflow ${def.id} engine ${id} is incomplete`);
    }
    this.defs.set(def.id, def);
  }

  get(id) {
    const d = this.defs.get(id);
    if (!d) throw new HttpError(404, `Unknown workflow: ${id}`);
    return d;
  }

  all() { return [...this.defs.values()]; }

  // Strict input validation. Returns a clean object with defaults applied.
  validateInputs(def, raw, { store, today }) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const known = new Set([...def.inputs.map((i) => i.name), 'engine']);
    for (const k of Object.keys(input)) if (!known.has(k)) throw new HttpError(400, `Unknown input "${k}" for ${def.name}`);
    const clean = {};
    for (const spec of def.inputs) {
      const v = input[spec.name];
      const empty = v === undefined || v === null || v === '';
      if (empty) {
        if (spec.required) throw new HttpError(400, `${spec.label} is required for ${def.name}`);
        clean[spec.name] = spec.type === 'date' && spec.default === 'today' ? today : spec.default ?? null;
        continue;
      }
      switch (spec.type) {
        case 'client': {
          const c = store.data.clients.find((x) => x.id === v);
          if (!c) throw new HttpError(400, `${spec.label}: client not found`);
          clean[spec.name] = c.id;
          break;
        }
        case 'boolean':
          if (typeof v !== 'boolean') throw new HttpError(400, `${spec.label} must be true or false`);
          clean[spec.name] = v;
          break;
        case 'date':
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${spec.label} must be a date like ${today}`);
          clean[spec.name] = String(v);
          break;
        default:
          throw new Error(`Unsupported input type ${spec.type}`);
      }
    }
    const engine = input.engine === undefined || input.engine === '' ? def.defaultEngine : input.engine;
    if (!Object.prototype.hasOwnProperty.call(def.engines, engine)) {
      throw new HttpError(400, `Engine must be one of: ${Object.keys(def.engines).join(', ')}`);
    }
    clean.engine = engine;
    return clean;
  }

  dedupeKey(workflowId, inputs) {
    return `${workflowId}:${stableStringify(inputs)}`;
  }

  // Public description for the UI / plugin. `connections` = list of statuses.
  describe(def, { connections = [], schedules = [] } = {}) {
    const stateOf = (id) => connections.find((c) => c.id === id) || { id, state: 'unavailable', label: 'Unavailable' };
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      workspace: def.workspace,
      inputs: def.inputs.map(({ name, label, type, required, help, default: d }) => ({ name, label, type, required: Boolean(required), help: help || '', default: d ?? null })),
      defaultEngine: def.defaultEngine,
      engines: Object.entries(def.engines).map(([id, e]) => {
        const requires = (e.requires || []).map((r) => {
          const s = stateOf(r);
          return { id: r, name: s.name || r, state: s.state, label: s.label };
        });
        const blocked = requires.find((r) => r.state !== 'verified');
        return {
          id, label: e.label, uses: e.uses, usesLabel: USES[e.uses], route: e.route, routeLabel: ROUTES[e.route],
          lane: e.lane, timeoutSec: Math.round(e.timeoutMs / 1000), requires,
          available: !blocked, unavailableReason: blocked ? `${blocked.name}: ${blocked.label}` : '',
          note: e.note || '',
        };
      }),
      allowedActions: def.allowedActions.map((code) => ({ code, label: actionLabel(code) })).concat([{ code: 'never:send', label: 'Never sends email or texts' }]),
      outputFormat: def.outputFormat,
      errorBehavior: def.errorBehavior,
      schedulable: Boolean(def.schedulable),
      schedule: schedules.find((s) => s.workflowId === def.id) || null,
    };
  }
}

module.exports = { WorkflowRegistry, USES, ROUTES, stableStringify };
