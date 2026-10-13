'use strict';
// Request guard for the local API. Protects write and execution endpoints from
// other websites (CSRF, DNS rebinding) and identifies non-browser clients.
//
// Browser (same-origin page): Host must be localhost/127.0.0.1 on our port;
//   changes require the X-BenDavid-OS header (other sites can't send custom
//   headers without a CORS preflight, which this server never approves), a
//   matching Origin when present, and Sec-Fetch-Site same-origin/none.
// Local clients (CLI, future Obsidian plugin, scheduler scripts): send
//   "Authorization: Bearer <token>" from data/api-token. Never exposed by the API.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError } = require('./store');

function loadOrCreateToken(dataDir) {
  const file = path.join(dataDir, 'api-token');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return { file, token: fs.readFileSync(file, 'utf8').trim() };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function createGuard({ token, getPort }) {
  return function guard(req) {
    const port = getPort();
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!allowedHosts.has(req.headers.host)) throw new HttpError(403, 'Forbidden host');

    const auth = req.headers.authorization;
    if (auth !== undefined) {
      const m = /^Bearer\s+(\S+)$/.exec(auth);
      if (!m || !safeEqual(m[1], token)) throw new HttpError(401, 'Invalid API token');
      const client = String(req.headers['x-bendavid-client'] || 'api').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'api';
      return { client, viaToken: true };
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers['x-bendavid-os'] !== '1') throw new HttpError(403, 'Missing app header');
      const origin = req.headers.origin;
      if (origin && !allowedHosts.has(origin.replace(/^https?:\/\//, ''))) throw new HttpError(403, 'Forbidden origin');
      const site = req.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Cross-site request blocked');
    }
    return { client: 'browser', viaToken: false };
  };
}

module.exports = { loadOrCreateToken, createGuard };
