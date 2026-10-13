'use strict';
// Writes generated Markdown into the project's Obsidian-compatible vault folder.
//
// Rules:
// - The JSON data store is authoritative. Client notes in vault/Clients are
//   read-only mirrors; edits made in Obsidian are NOT imported back.
// - Every generated file records a hash of its own body in its frontmatter.
//   If the file on disk no longer matches that hash (you edited it), or it
//   isn't a BenDavid OS file at all, it is never overwritten. The new version
//   is written alongside as "<name>.generated.md" and the skip is reported.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function safeFileName(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
}

function splitFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return { meta, body: m[2] };
}

function yamlValue(v) {
  return /^[\w .@/-]*$/.test(String(v)) ? String(v) : JSON.stringify(String(v));
}

class Vault {
  constructor(dir) {
    this.dir = dir;
    this.clientsDir = path.join(dir, 'Clients');
    this.reportsDir = path.join(dir, 'Daily Reports');
    fs.mkdirSync(this.clientsDir, { recursive: true });
    fs.mkdirSync(this.reportsDir, { recursive: true });
  }

  // Returns true if the file is ours and unchanged since we generated it.
  isPristine(file) {
    const { meta, body } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    return meta.bendavid_generated === 'true' && meta.content_hash === hash(body);
  }

  writeGenerated(file, meta, body) {
    const front = Object.entries({ ...meta, bendavid_generated: true, content_hash: hash(body) })
      .map(([k, v]) => `${k}: ${yamlValue(v)}`).join('\n');
    const text = `---\n${front}\n---\n${body}`;
    if (fs.existsSync(file)) {
      if (fs.readFileSync(file, 'utf8') === text) return { status: 'unchanged', file };
      if (!this.isPristine(file)) {
        const alt = file.replace(/\.md$/, '.generated.md');
        fs.writeFileSync(alt, text);
        return { status: 'protected', file, wroteInstead: alt, message: `${path.basename(file)} was edited outside BenDavid OS, so it was not overwritten. New version saved as ${path.basename(alt)}.` };
      }
    }
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
    return { status: 'written', file };
  }

  clientFileFor(client) {
    return path.join(this.clientsDir, `${safeFileName(client.businessName)} (${client.id.slice(-6)}).md`);
  }

  // Remove an older mirror of the same client (e.g. after a rename) if untouched.
  removeStale(client, keep) {
    const suffix = `(${client.id.slice(-6)}).md`;
    for (const f of fs.readdirSync(this.clientsDir)) {
      const full = path.join(this.clientsDir, f);
      if (f.endsWith(suffix) && full !== keep && this.isPristine(full)) fs.unlinkSync(full);
    }
  }

  writeClient(client) {
    if (client.sample) return { status: 'skipped-sample' };
    const file = this.clientFileFor(client);
    this.removeStale(client, file);
    const o = client.offer || {};
    const money = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString('en-US')}`);
    const body = [
      `# ${client.businessName}`,
      '',
      '> [!info] Read-only mirror',
      '> Generated from the BenDavid OS data store. Edit this client in the app; changes made here are not imported and will stop future updates to this note.',
      '',
      `- **Contact:** ${client.contactName}`,
      `- **Email:** ${client.email || '—'}`,
      `- **Phone:** ${client.phone || '—'}`,
      `- **Stage:** ${client.stage}`,
      `- **Last contact:** ${client.lastContact || '—'}`,
      `- **Next follow-up:** ${client.followUpDate || '—'}`,
      `- **Next action:** ${client.nextAction || '—'}`,
      '',
      '## Requested documents',
      ...(client.requestedDocs.length ? client.requestedDocs.map((d) => `- [${d.received ? 'x' : ' '}] ${d.name}${d.received ? ` (received ${d.receivedAt})` : ` (requested ${d.requestedAt})`}`) : ['- None']),
      '',
      `## Offer ${o.confirmed ? '(confirmed)' : '(not confirmed)'}`,
      `- Funder: ${o.funder || '—'}`,
      `- Funding amount: ${money(o.advanceAmount)}`,
      `- Total payback: ${money(o.paybackAmount)}`,
      `- Factor rate: ${o.factorRate ?? '—'}`,
      `- Remittance: ${o.paymentAmount !== null && o.paymentAmount !== undefined ? `${money(o.paymentAmount)} ${o.paymentFrequency}`.trim() : '—'}`,
      `- Estimated term: ${o.estimatedTerm || '—'}`,
      '',
      '## Notes',
      ...(client.notes.length ? client.notes.map((n) => `- ${n.at.slice(0, 10)}: ${n.text.replace(/\n/g, ' ')}`) : ['- None']),
      '',
    ].join('\n');
    return this.writeGenerated(file, { type: 'client', client_id: client.id, record_rev: client.rev, stage: client.stage, updated: client.updatedAt }, body);
  }

  removeClient(client) {
    if (client.sample) return;
    const file = this.clientFileFor(client);
    if (fs.existsSync(file) && this.isPristine(file)) fs.unlinkSync(file);
  }

  writeDailyReport(dateStr, markdown) {
    const file = path.join(this.reportsDir, `${dateStr}.md`);
    return this.writeGenerated(file, { type: 'daily-report', date: dateStr }, markdown);
  }
}

module.exports = { Vault, splitFrontmatter, safeFileName };
