#!/usr/bin/env node
'use strict';
// Command-line client for the running BenDavid OS server. It uses the same
// API, task queue, and records as the browser (proof of the shared backend).
//
//   node bin/bdos.js health
//   node bin/bdos.js workflows
//   node bin/bdos.js run <workflow-id> [name=value ...] [--wait]
//   node bin/bdos.js runs [count]
//   node bin/bdos.js status <run-id>
//   node bin/bdos.js cancel <run-id>
//
// Authenticates with the token in data/api-token (created by the server).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../server/config');

const BASE = `http://127.0.0.1:${config.PORT}`;

function token() {
  const file = path.join(config.DATA_DIR, 'api-token');
  if (!fs.existsSync(file)) throw new Error(`No API token at ${file}. Start BenDavid OS once first.`);
  return fs.readFileSync(file, 'utf8').trim();
}

async function call(method, url, body) {
  let res;
  try {
    res = await fetch(BASE + url, {
      method,
      headers: { Authorization: `Bearer ${token()}`, 'X-BenDavid-Client': 'cli', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`BenDavid OS is not running at ${BASE}. Start it first.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const wait = rest.includes('--wait');
  const args = rest.filter((a) => a !== '--wait');
  switch (cmd) {
    case 'health':
      return call('GET', '/api/health');
    case 'workflows':
      return (await call('GET', '/api/workflows')).map((w) => ({ id: w.id, name: w.name, engines: w.engines.map((e) => `${e.id}${e.available ? '' : ' (unavailable)'}`) }));
    case 'run': {
      const [id, ...pairs] = args;
      if (!id) throw new Error('Usage: run <workflow-id> [name=value ...] [--wait]');
      const inputs = Object.fromEntries(pairs.map((p) => { const i = p.indexOf('='); return [p.slice(0, i), parseValue(p.slice(i + 1))]; }));
      let { run } = await call('POST', `/api/workflows/${encodeURIComponent(id)}/run`, { inputs, requestId: `cli-${crypto.randomUUID()}` });
      while (wait && ['queued', 'running'].includes(run.status)) {
        await new Promise((r) => setTimeout(r, 700));
        run = await call('GET', `/api/runs/${run.id}`);
      }
      return { id: run.id, status: run.status, summary: run.result && run.result.summary, outputs: run.outputs.map((o) => o.path), error: run.error };
    }
    case 'runs':
      return (await call('GET', `/api/runs?limit=${Number(args[0]) || 10}`)).map((r) => `${r.createdAt}  ${r.status.padEnd(11)} ${r.workflowName} (${r.engineLabel}) ${r.id}`);
    case 'status':
      return call('GET', `/api/runs/${encodeURIComponent(args[0])}`);
    case 'cancel':
      return call('POST', `/api/runs/${encodeURIComponent(args[0])}/cancel`);
    default:
      throw new Error('Commands: health | workflows | run <id> [k=v] [--wait] | runs [n] | status <run-id> | cancel <run-id>');
  }
}

main(process.argv.slice(2))
  .then((out) => { console.log(typeof out === 'string' ? out : Array.isArray(out) && typeof out[0] === 'string' ? out.join('\n') : JSON.stringify(out, null, 2)); })
  .catch((err) => { console.error(err.message); process.exit(1); });
