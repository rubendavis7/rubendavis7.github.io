'use strict';
// Workflow execution route: runs the installed Claude Code CLI in headless
// mode (`claude -p ... --output-format json`), its documented interface.
//
// Safety design:
// - Only fixed workflow entry points call this. Prompts are fixed templates;
//   browser text is never passed through, and there is no shell: arguments go
//   straight to the executable.
// - Each run's working directory is a per-run folder containing only copies of
//   the files that workflow needs. Claude Code's native permission system stays
//   in charge (no bypass flags); tools are limited to read-only ones, MCP
//   servers are not loaded, and anything that would prompt is denied.
// - Timeouts and cancellation kill the whole process tree.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const { ConnectionError } = require('./errors');

let detectCache = null;

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function which(names) {
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (isFile(p)) return p;
    }
  }
  return null;
}

function fromPath(p, source) {
  if (/\.(c?js|mjs)$/i.test(p)) return { command: process.execPath, prefixArgs: [p], source };
  if (/\.(cmd|bat|ps1)$/i.test(p)) {
    return { error: `${p} is a shell script shim. Set CLAUDE_CODE_PATH to claude.exe or to the package's cli.js so BenDavid OS can start it without a shell.` };
  }
  return { command: p, prefixArgs: [], source };
}

// npm installs put a .cmd shim on PATH; find the real entry point behind it.
function fromNpmShim(shim) {
  const pkgDir = path.join(path.dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin.claude;
    const full = rel && path.join(pkgDir, rel);
    if (full && isFile(full)) return fromPath(full, full);
  } catch { /* fall through */ }
  return { error: `Found ${shim}, but could not locate the Claude Code program behind it. Set CLAUDE_CODE_PATH in .env.` };
}

function resolveExecutable() {
  const configured = config.env('CLAUDE_CODE_PATH');
  if (configured) {
    if (!isFile(configured)) return { error: `CLAUDE_CODE_PATH points to a file that does not exist: ${configured}` };
    return fromPath(configured, `CLAUDE_CODE_PATH (${configured})`);
  }
  if (process.platform === 'win32') {
    const exe = which(['claude.exe']) || [path.join(os.homedir(), '.local', 'bin', 'claude.exe')].find(isFile);
    if (exe) return { command: exe, prefixArgs: [], source: exe };
    const shim = which(['claude.cmd']) || [path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')].find(isFile);
    return shim ? fromNpmShim(shim) : null;
  }
  const bin = which(['claude']);
  return bin ? { command: bin, prefixArgs: [], source: bin } : null;
}

function capture(exe, args, { timeoutMs = 20000, cwd } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(exe.command, [...exe.prefixArgs, ...args], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: err.message });
      return;
    }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, timeoutMs);
    child.stdout.on('data', (b) => { stdout += b; });
    child.stderr.on('data', (b) => { stderr += b; });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: err.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

// Finds Claude Code and checks its documented headless flags. Uses --version
// and --help only, which make no API calls.
async function detect({ force = false } = {}) {
  if (!force && detectCache && Date.now() - detectCache.at < 60_000) return detectCache.result;
  const exe = resolveExecutable();
  let result;
  if (!exe) {
    result = { found: false, detail: 'Claude Code was not found on this computer (looked on PATH and in the usual install folders).' };
  } else if (exe.error) {
    result = { found: false, detail: exe.error };
  } else {
    const v = await capture(exe, ['--version']);
    if (v.code !== 0) {
      result = { found: false, detail: `Found ${exe.source}, but "claude --version" failed: ${(v.stderr || v.stdout).trim().slice(0, 300)}` };
    } else {
      const h = await capture(exe, ['--help']);
      const help = `${h.stdout}\n${h.stderr}`;
      const flags = {
        print: /--print\b/.test(help),
        outputFormat: /--output-format\b/.test(help),
        tools: /--tools\b/.test(help),
        permissionPrompts: /--permission-prompts\b/.test(help),
        strictMcp: /--strict-mcp-config\b/.test(help),
        noSessionPersistence: /--no-session-persistence\b/.test(help),
        appendSystemPrompt: /--append-system-prompt\b/.test(help),
      };
      const missing = ['print', 'outputFormat', 'tools'].filter((k) => !flags[k]);
      result = {
        found: true, compatible: !missing.length, exe, source: exe.source, flags,
        version: v.stdout.trim().split(/\r?\n/)[0],
        detail: missing.length ? `This Claude Code version is missing required headless options (${missing.join(', ')}). Update Claude Code.` : 'Found',
      };
    }
  }
  detectCache = { at: Date.now(), result };
  return result;
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* gone */ } }
  const t = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, 3000);
  if (t.unref) t.unref();
}

function parseOutput(stdout) {
  const text = stdout.trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* try last line */ }
  const lines = text.split(/\r?\n/).filter(Boolean);
  try { return JSON.parse(lines[lines.length - 1]); } catch { return null; }
}

async function run({ cwd, prompt, appendSystemPrompt = '', tools = ['Read', 'Glob', 'Grep'], timeoutMs = 600_000, signal, onProgress = () => {} }) {
  const d = await detect();
  if (!d.found) throw new ConnectionError('not-found', d.detail);
  if (!d.compatible) throw new ConnectionError('incompatible', d.detail);
  const args = ['-p', prompt, '--output-format', 'json', '--tools', tools.join(',')];
  if (d.flags.strictMcp) args.push('--strict-mcp-config');
  if (d.flags.noSessionPersistence) args.push('--no-session-persistence');
  if (d.flags.permissionPrompts) args.push('--permission-prompts', 'none');
  if (appendSystemPrompt && d.flags.appendSystemPrompt) args.push('--append-system-prompt', appendSystemPrompt);
  const model = config.env('BENDAVID_CLAUDE_CODE_MODEL');
  if (model) args.push('--model', model);

  return new Promise((resolve, reject) => {
    const started = Date.now();
    let child;
    try {
      child = spawn(d.exe.command, [...d.exe.prefixArgs, ...args], {
        cwd, env: process.env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(new ConnectionError('spawn-failed', `Could not start Claude Code: ${err.message}`));
      return;
    }
    onProgress(`Claude Code ${d.version} started (process ${child.pid}); read-only tools: ${tools.join(', ') || 'none'}`);
    let stdout = '';
    let stderr = '';
    let stopReason = null;
    child.stdout.on('data', (b) => { if (stdout.length < 5e6) stdout += b; });
    child.stderr.on('data', (b) => { if (stderr.length < 2e5) stderr += b; });
    const timer = setTimeout(() => { stopReason = 'timeout'; killTree(child); }, timeoutMs);
    const onAbort = () => { stopReason = stopReason || 'cancelled'; killTree(child); };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new ConnectionError('spawn-failed', `Could not start Claude Code: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (stopReason === 'timeout') return reject(new ConnectionError('timeout', `Claude Code did not finish within ${Math.round(timeoutMs / 1000)} seconds and was stopped.`));
      if (stopReason === 'cancelled') return reject(new ConnectionError('cancelled', 'Cancelled; the Claude Code process was stopped.'));
      const json = parseOutput(stdout);
      if (!json) {
        return reject(new ConnectionError('bad-output', `Claude Code exited (code ${code}) without the expected JSON result.`, stderr.trim().slice(-800) || stdout.trim().slice(-800)));
      }
      const reported = {
        subtype: json.subtype, num_turns: json.num_turns, duration_ms: json.duration_ms,
        total_cost_usd: json.total_cost_usd, session_id: json.session_id,
        permission_denials: Array.isArray(json.permission_denials) ? json.permission_denials.length : undefined,
      };
      if (json.is_error || (json.subtype && json.subtype !== 'success')) {
        return reject(new ConnectionError('run-failed', `Claude Code reported an error (${json.subtype || 'error'}).`, String(json.result || stderr || '').slice(0, 1500)));
      }
      resolve({ text: String(json.result || ''), version: d.version, wallMs: Date.now() - started, reported });
    });
  });
}

async function selfTest({ cwd, signal }) {
  fs.mkdirSync(cwd, { recursive: true });
  const r = await run({ cwd, prompt: 'Reply with exactly the word OK and nothing else.', tools: [], timeoutMs: 180_000, signal });
  if (!/\bOK\b/.test(r.text)) throw new ConnectionError('unexpected', `Claude Code answered "${r.text.slice(0, 80)}" instead of "OK".`);
  return { version: r.version, reported: r.reported, checks: ['Claude Code started in headless mode.', 'It returned the expected JSON result.'] };
}

function resetCache() { detectCache = null; }

module.exports = { detect, run, selfTest, resolveExecutable, resetCache };
