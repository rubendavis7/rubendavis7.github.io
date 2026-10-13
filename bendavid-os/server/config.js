'use strict';
// Central configuration. Values come from real environment variables first,
// then from the git-ignored bendavid-os/.env file. .env values are kept in this
// module only: they are NOT copied into process.env, so secrets never leak into
// child processes (for example Claude Code workflow runs) or the browser.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const fileEnv = readEnvFile(path.join(ROOT, '.env'));

function env(name, fallback = undefined) {
  const v = process.env[name] ?? fileEnv[name];
  return v === undefined || v === '' ? fallback : v;
}

const config = {
  ROOT,
  VERSION: require('../package.json').version,
  HOST: '127.0.0.1',
  PORT: Number(env('PORT', 4321)),
  DATA_DIR: path.resolve(env('BENDAVID_DATA_DIR', path.join(ROOT, 'data'))),
  VAULT_DIR: path.resolve(env('BENDAVID_VAULT_DIR', path.join(ROOT, 'vault'))),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  TIMEZONE: env('BENDAVID_TIMEZONE', 'America/New_York'),
  SEED_SAMPLES: env('BENDAVID_NO_SAMPLES') !== '1',
  SCHEDULER_TICK_MS: Number(env('BENDAVID_SCHEDULER_TICK_MS', 30000)),
  ROUTER: env('BENDAVID_ROUTER', 'rules'),
  // Optional cap on every run's time limit (used by tests; normally unset).
  MAX_RUN_MS: Number(env('BENDAVID_MAX_RUN_MS', 0)) || null,
  env,
  // Secrets are read on demand and never logged or returned by the API.
  secret: (name) => env(name),
};

module.exports = config;
