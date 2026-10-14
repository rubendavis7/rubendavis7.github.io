'use strict';
// Test helpers: start/stop real server processes with isolated folders.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function tempDirs(prefix = 'bdos-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, data: path.join(dir, 'data'), vault: path.join(dir, 'vault') };
}

class TestServer {
  constructor({ data, vault, env = {} }) {
    this.data = data;
    this.vault = vault;
    this.env = env;
    this.proc = null;
    this.base = null;
    this.log = '';
  }

  start() {
    this.log = '';
    this.base = null;
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PORT: '0', BENDAVID_READY_LINE: '1', BENDAVID_DATA_DIR: this.data, BENDAVID_VAULT_DIR: this.vault,
        ANTHROPIC_API_KEY: '', BENDAVID_LIGHT_MODEL: '', BENDAVID_SCHEDULER_TICK_MS: '3600000',
        ...this.env,
      };
      this.proc = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      const onExit = (code) => reject(new Error(`server exited ${code}: ${this.log}`));
      this.proc.on('exit', onExit);
      this.proc.stdout.on('data', (d) => {
        this.log += d;
        const m = /BENDAVID_OS_LISTENING (\d+)/.exec(this.log);
        if (m && !this.base) {
          this.base = `http://127.0.0.1:${m[1]}`;
          this.port = Number(m[1]);
          this.proc.removeListener('exit', onExit);
          resolve(this);
        }
      });
      this.proc.stderr.on('data', (d) => { this.log += d; });
    });
  }

  stop(signal = 'SIGTERM') {
    return new Promise((resolve) => {
      if (!this.proc || this.proc.exitCode !== null) return resolve();
      this.proc.on('exit', resolve);
      this.proc.kill(signal);
      this.base = null;
    });
  }

  async restart() {
    await this.stop();
    return this.start();
  }

  token() { return fs.readFileSync(path.join(this.data, 'api-token'), 'utf8').trim(); }

  async call(method, url, body, headers = { 'X-BenDavid-OS': '1' }) {
    const res = await fetch(this.base + url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  }

  async runAndWait(workflowId, inputs = {}, { requestId, timeoutMs = 20000 } = {}) {
    const r = await this.call('POST', `/api/workflows/${workflowId}/run`, { inputs, ...(requestId ? { requestId } : {}) });
    if (r.status !== 200) throw new Error(`start failed ${r.status}: ${JSON.stringify(r.body)}`);
    return this.waitRun(r.body.run.id, timeoutMs);
  }

  async waitRun(id, timeoutMs = 20000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const r = (await this.call('GET', `/api/runs/${id}`)).body;
      if (!['queued', 'running'].includes(r.status)) return r;
      if (Date.now() > until) throw new Error(`run ${id} still ${r.status}`);
      await new Promise((res) => setTimeout(res, 100));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { ROOT, tempDirs, TestServer, sleep };
