'use strict';
// Integration boundary.
//
// Every outside service (Gmail, AI execution, voice) plugs in here, on the
// server only. The browser never sees keys: it only asks /api/integrations for
// a status and calls server routes. Secrets come from environment variables or
// the git-ignored bendavid-os/.env file, never from the UI or from chat.
//
// A provider reports `connected: true` ONLY when `implemented` is true AND its
// own `selfTest()` has passed against the real service. Until then the UI shows
// it as disconnected, even if keys are present.
//
// To add one: create e.g. gmail.js exporting
//   { implemented: true, async selfTest() {...}, async createDraft({to, subject, body}) {...} }
// and register it below. Gmail must create DRAFTS only; BenDavid OS never sends.

const PROVIDERS = [
  {
    id: 'gmail',
    name: 'Gmail',
    purpose: 'Save follow-up templates as Gmail drafts for review. Never sends.',
    envKeys: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'],
    adapter: null,
  },
  {
    id: 'ai',
    name: 'AI execution',
    purpose: 'Natural-language commands and personalised drafts in your writing style.',
    envKeys: ['ANTHROPIC_API_KEY'],
    adapter: null,
  },
  {
    id: 'voice',
    name: 'Voice',
    purpose: 'Speak commands to Jarvis and hear briefings.',
    envKeys: [],
    adapter: null,
  },
];

const testResults = new Map();

async function runSelfTests() {
  for (const p of PROVIDERS) {
    if (!p.adapter || !p.adapter.implemented) continue;
    try {
      await p.adapter.selfTest();
      testResults.set(p.id, { ok: true, at: new Date().toISOString() });
    } catch (err) {
      testResults.set(p.id, { ok: false, at: new Date().toISOString(), error: err.message });
    }
  }
}

function status() {
  return PROVIDERS.map((p) => {
    const implemented = Boolean(p.adapter && p.adapter.implemented);
    const test = testResults.get(p.id);
    const keysPresent = p.envKeys.length > 0 && p.envKeys.every((k) => Boolean(process.env[k]));
    const connected = implemented && Boolean(test && test.ok);
    let detail = 'Not implemented yet';
    if (implemented && !test) detail = 'Implemented, self-test not run';
    if (implemented && test && !test.ok) detail = `Self-test failed: ${test.error}`;
    if (connected) detail = `Connected (tested ${test.at})`;
    // Only booleans leave the server; key values never do.
    return { id: p.id, name: p.name, purpose: p.purpose, implemented, keysPresent, connected, detail };
  });
}

function get(id) {
  const p = PROVIDERS.find((x) => x.id === id);
  const s = status().find((x) => x.id === id);
  if (!p || !s || !s.connected) {
    const err = new Error(`${p ? p.name : id} is not connected`);
    err.status = 503;
    throw err;
  }
  return p.adapter;
}

module.exports = { status, get, runSelfTests };
