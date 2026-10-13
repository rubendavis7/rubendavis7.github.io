'use strict';
// Connection registry: the single place that decides what each outside
// service's status is. Every status comes from a real check (files on disk,
// detected programs, a stored self-test result whose configuration fingerprint
// still matches). Nothing is assumed connected.
//
// States: available | verified | unverified | failed | not-configured |
//         not-found | not-implemented | disabled | unavailable

const fs = require('fs');
const path = require('path');
const anthropic = require('./anthropic');
const claudeCode = require('./claude-code');
const { ConnectionError } = require('./errors');

const LABELS = {
  available: 'Available', verified: 'Verified', unverified: 'Configured, not verified', failed: 'Self-test failed',
  'not-configured': 'Not configured', 'not-found': 'Not found', 'not-implemented': 'Not implemented',
  disabled: 'Disabled', unavailable: 'Unavailable', enabled: 'Enabled',
};

function createConnections({ store, vault, dataDir }) {
  const tests = () => store.data.settings.connectionTests;

  function saveTest(id, record) {
    store.updateSettings((s) => { s.connectionTests[id] = record; });
  }

  function lightModelStatus() {
    const d = anthropic.describe();
    const base = {
      id: 'light-model', name: 'AI service (light model)', route: 'Lightweight reasoning',
      enables: ['Prepare Follow-Up with the AI engine', 'Summarize Client with the AI engine'],
      setup: [
        'Create the file bendavid-os\\.env (copy .env.example). Never paste keys into chat or the browser.',
        'Add ANTHROPIC_API_KEY=your key and BENDAVID_LIGHT_MODEL=the model ID you choose (for example claude-opus-5-5).',
        'Restart BenDavid OS, then click Run self-test here. It checks the model is available to your key and makes one small API call.',
      ],
      config: d, canTest: d.sdkInstalled && d.keyPresent && Boolean(d.model),
    };
    if (!d.sdkInstalled) return { ...base, state: 'unavailable', detail: 'The Anthropic SDK is not installed. Run "npm install" in the bendavid-os folder.' };
    if (!d.keyPresent || !d.model) {
      const missing = [!d.keyPresent && 'ANTHROPIC_API_KEY', !d.model && 'BENDAVID_LIGHT_MODEL'].filter(Boolean);
      return { ...base, state: 'not-configured', detail: `Missing in .env: ${missing.join(' and ')}.` };
    }
    const t = tests()['light-model'];
    if (t && t.fingerprint === anthropic.fingerprint()) {
      return t.ok
        ? { ...base, state: 'verified', detail: `Self-test passed ${t.at} with ${t.info.model}.`, lastTest: t }
        : { ...base, state: 'failed', detail: t.error, lastTest: t };
    }
    return { ...base, state: 'unverified', detail: `Key and model (${d.model}) are set but not verified. Run the self-test.` };
  }

  async function claudeCodeStatus() {
    const d = await claudeCode.detect();
    const base = {
      id: 'claude-code', name: 'Claude Code runtime', route: 'Workflow execution',
      enables: ['Review Pipeline with the Claude Code engine (longer, written analysis)'],
      setup: [
        'Install Claude Code on this computer and sign in once by running "claude" in a terminal.',
        'If it is installed somewhere unusual, set CLAUDE_CODE_PATH in bendavid-os\\.env to claude.exe.',
        'Click Run self-test here. It sends one tiny prompt and uses a small amount of your Claude plan.',
      ],
      canTest: Boolean(d.found && d.compatible),
      config: d.found ? { version: d.version, path: d.source, flags: d.flags } : null,
    };
    if (!d.found) return { ...base, state: 'not-found', detail: d.detail };
    if (!d.compatible) return { ...base, state: 'unavailable', detail: d.detail };
    const t = tests()['claude-code'];
    if (t && t.fingerprint === d.version) {
      return t.ok
        ? { ...base, state: 'verified', detail: `Self-test passed ${t.at} with Claude Code ${d.version}.`, lastTest: t }
        : { ...base, state: 'failed', detail: t.error, lastTest: t };
    }
    return { ...base, state: 'unverified', detail: `Found Claude Code ${d.version} at ${d.source}. Not verified yet: run the self-test.` };
  }

  function voiceStatus(kind) {
    const v = store.data.settings.voice;
    const provider = v[kind];
    const verifiedAt = v.verified && v.verified[kind];
    const name = kind === 'transcription' ? 'Voice input (transcription)' : 'Voice output (speech)';
    const base = {
      id: kind, name, route: 'Voice', provider, canTest: false, browserSide: true,
      enables: kind === 'transcription' ? ['Speaking commands to Jarvis'] : ['Reading results aloud'],
      setup: kind === 'transcription'
        ? ['Choose a transcription provider below. "Browser speech recognition" sends your audio to your browser vendor\'s cloud service (Google for Chrome, Microsoft for Edge).', 'Allow microphone access when the browser asks, then say a command once to verify.']
        : ['Choose "Browser voices (on this computer)". Only voices installed on this computer are used.', 'Click Test voice once to verify.'],
    };
    if (provider === 'none') return { ...base, state: 'not-configured', detail: 'Unavailable: no provider configured. Text input works fully.' };
    if (verifiedAt) return { ...base, state: 'verified', detail: `Provider: ${provider}. Worked in this browser at ${verifiedAt}.` };
    return { ...base, state: 'unverified', detail: `Provider: ${provider}. Not verified yet: try it once in the browser.` };
  }

  function schedulerStatus(runs) {
    const enabled = store.data.settings.schedules.filter((s) => s.enabled);
    const scheduledRuns = runs.filter((r) => r.trigger === 'schedule');
    const base = {
      id: 'scheduler', name: 'Scheduled workflows', route: 'Automation', canTest: false,
      enables: ['Running saved-data workflows at set times (America/New_York)'],
      setup: ['Turn a schedule on in Workflows. It only runs while this Windows computer is on, awake, and BenDavid OS is running.'],
    };
    if (!enabled.length) return { ...base, state: 'disabled', detail: 'All schedules are off. Workflows run only when you click Run.' };
    const last = scheduledRuns[0];
    return {
      ...base, state: 'enabled',
      detail: `${enabled.length} schedule(s) on. ${scheduledRuns.length ? `Unattended runs observed: ${scheduledRuns.length} (last ${last.createdAt}, ${last.status}).` : 'No unattended run has happened yet, so unattended operation is not confirmed.'}`,
    };
  }

  async function list() {
    const runs = store.data.runs;
    let vaultWritable = true;
    try { fs.accessSync(vault.dir, fs.constants.W_OK); } catch { vaultWritable = false; }
    const statuses = [
      {
        id: 'database', name: 'Client database', route: 'Saved data', state: 'available', canTest: false,
        detail: `${store.data.clients.filter((c) => !c.sample).length} client records (+${store.data.clients.filter((c) => c.sample).length} sample), schema v${store.data.schemaVersion}, file ${store.file}`,
        enables: ['All saved-data and template workflows'], setup: [],
      },
      {
        id: 'vault', name: 'Obsidian-compatible vault', route: 'Shared memory', state: vaultWritable ? 'available' : 'unavailable', canTest: false,
        detail: vaultWritable ? `Folder ${vault.dir}` : `Cannot write to ${vault.dir}`,
        enables: ['Knowledge page, daily notes, outputs'], setup: ['Optional: in Obsidian choose "Open folder as vault" and pick this folder.'],
      },
      lightModelStatus(),
      await claudeCodeStatus(),
      {
        id: 'gmail', name: 'Gmail drafts', route: 'Integration', state: 'not-implemented', canTest: false,
        detail: 'Not built yet. Follow-ups are saved as drafts in output/ for you to copy. BenDavid OS never sends email or texts.',
        enables: ['Saving reviewed drafts into Gmail as drafts (never sending)'], setup: ['Planned: a server-side adapter in server/connections/ that can only create drafts.'],
      },
      voiceStatus('transcription'),
      voiceStatus('speech'),
      {
        id: 'obsidian-plugin', name: 'Obsidian plugin', route: 'Second client', state: 'not-implemented', canTest: false,
        detail: 'No plugin exists yet. The interface it would use is documented in vault/system/obsidian-plugin-interface.md.',
        enables: ['Running the same workflows from inside Obsidian'], setup: ['Build a plugin against the documented local API (same backend, queue, and records).'],
      },
      schedulerStatus(runs),
    ];
    return statuses.map((s) => ({ ...s, label: LABELS[s.state] || s.state }));
  }

  async function get(id) {
    const all = await list();
    const s = all.find((x) => x.id === id);
    if (!s) throw Object.assign(new Error('Unknown connection'), { status: 404 });
    return s;
  }

  // Workflows may only use a connection whose latest self-test passed for the
  // current configuration.
  async function requireUsable(id) {
    const s = await get(id);
    if (s.state !== 'verified') {
      throw new ConnectionError('not-connected', `${s.name} is not connected (${s.label}). ${s.detail} Set it up on the Connections page, or choose the saved-data/template engine.`);
    }
    return s;
  }

  async function runSelfTest(id, { signal } = {}) {
    const at = new Date().toISOString();
    if (id === 'light-model') {
      const fp = anthropic.fingerprint();
      try {
        const info = await anthropic.selfTest({ signal });
        saveTest(id, { ok: true, at, fingerprint: fp, info });
      } catch (err) {
        saveTest(id, { ok: false, at, fingerprint: fp, error: err.message, code: err.code || 'error' });
      }
      return get(id);
    }
    if (id === 'claude-code') {
      const d = await claudeCode.detect({ force: true });
      if (!d.found || !d.compatible) return get(id);
      try {
        const info = await claudeCode.selfTest({ cwd: path.join(dataDir, 'runs', '_selftest'), signal });
        saveTest(id, { ok: true, at, fingerprint: d.version, info });
      } catch (err) {
        saveTest(id, { ok: false, at, fingerprint: d.version, error: `${err.message}${err.detail ? ` ${String(err.detail).slice(0, 400)}` : ''}`, code: err.code || 'error' });
      }
      return get(id);
    }
    throw Object.assign(new Error('This connection has no server-side self-test'), { status: 400 });
  }

  // When a real run fails because the service rejected us, reflect that.
  function recordFailure(id, err) {
    const authCodes = new Set(['auth', 'permission', 'model-not-found', 'not-found', 'incompatible']);
    if (!authCodes.has(err.code)) return;
    const fp = id === 'light-model' ? anthropic.fingerprint() : (tests()[id] || {}).fingerprint;
    saveTest(id, { ok: false, at: new Date().toISOString(), fingerprint: fp, error: err.message, code: err.code });
  }

  function lightModelOptions() {
    const t = tests()['light-model'];
    return { effort: t && t.ok && t.info.effortSupported ? 'low' : null };
  }

  return {
    list, get, requireUsable, runSelfTest, recordFailure, lightModelOptions,
    anthropic, claudeCode,
    setVoice(kind, provider) {
      const allowed = kind === 'transcription' ? ['none', 'browser'] : ['none', 'browser'];
      if (!['transcription', 'speech'].includes(kind) || !allowed.includes(provider)) throw Object.assign(new Error('Unknown voice provider'), { status: 400 });
      store.updateSettings((s) => {
        s.voice[kind] = provider;
        delete s.voice.verified[kind];
      }, `Voice ${kind} provider set to ${provider}`);
    },
    markVoiceVerified(kind) {
      if (!['transcription', 'speech'].includes(kind)) throw Object.assign(new Error('Unknown voice kind'), { status: 400 });
      if (store.data.settings.voice[kind] === 'none') throw Object.assign(new Error('No provider configured'), { status: 409 });
      store.updateSettings((s) => { s.voice.verified[kind] = new Date().toISOString(); });
    },
  };
}

module.exports = { createConnections, LABELS };
