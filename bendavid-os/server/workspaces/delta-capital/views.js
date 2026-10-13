'use strict';
// Wiki client views: Markdown summaries derived from one database record.
// They carry the record ID, revision, and update timestamp, list their
// sources and uncertainties, and are never read back into the database.

const ws = require('./index');
const { safeFileName } = require('../../vault');
const { monthLabel } = require('../../time');
const P = require('./planner');

function clientViewPath(c) {
  return `${ws.vault.wiki}/clients/${safeFileName(c.businessName)} (${c.id.slice(-6)}).md`;
}

function renderClientView(c, { rawSources = [], today }) {
  const o = c.offer || {};
  const money = (n) => (n === null || n === undefined ? '—' : P.usd(n));
  const s = P.summarizeClient(c, { today, rawSources });
  const related = rawSources.filter((r) => r.clientId === c.id);
  const docLine = (d) => `- [${d.received ? 'x' : ' '}] ${d.month ? `Bank statement: ${monthLabel(d.month)}` : d.name}${d.received ? ` (received ${d.receivedAt})` : ` (requested ${d.requestedAt})`}`;
  const body = [
    `> [!info] Derived view of database record \`${c.id}\` (rev ${c.rev}, updated ${c.updatedAt}).`,
    '> Edit this client in BenDavid OS. Changes made in this note are not imported, and editing it stops automatic updates.',
    '',
    `- **Contact:** ${c.contactName}`,
    `- **Email:** ${c.email || '—'}`,
    `- **Phone:** ${c.phone || '—'}`,
    `- **Stage:** ${c.stage} (since ${String(c.stageChangedAt || '').slice(0, 10) || 'unknown'})`,
    `- **Last contact:** ${c.lastContact || '—'}`,
    `- **Next follow-up:** ${c.followUpDate || '—'}`,
    `- **Next action:** ${c.nextAction || '—'}`,
    '', '## Statements and documents',
    ...(c.requestedDocs.length ? c.requestedDocs.map(docLine) : ['- None requested.']),
    '', `## Offer (${o.confirmed ? 'confirmed' : 'not confirmed'})`,
    `- Funder: ${o.funder || '—'}`,
    `- Funding amount: ${money(o.advanceAmount)}`,
    `- Total payback: ${money(o.paybackAmount)}`,
    `- Factor rate: ${o.factorRate ?? '—'}`,
    `- Remittance: ${o.paymentAmount !== null && o.paymentAmount !== undefined ? `${money(o.paymentAmount)} ${o.paymentFrequency || ''}`.trim() : '—'}`,
    `- Estimated term: ${o.estimatedTerm || '—'}`,
    '', '## Notes',
    ...(c.notes.length ? c.notes.map((n) => `- ${n.at.slice(0, 10)}: ${n.text.replace(/\n/g, ' ')}`) : ['- None.']),
    '', '## Related imports',
    ...(related.length ? related.map((r) => `- [[${r.path.replace(/\.md$/, '')}|${String(r.title).replace(/[|\]]/g, '-')}]] (${r.kind || 'source'}, imported ${String(r.importedAt).slice(0, 10)})`) : ['- None linked.']),
  ].join('\n');
  return {
    title: c.businessName,
    type: 'client-summary',
    generatedWith: 'database record (no AI)',
    sources: [
      { ref: `bendavid-db://clients/${c.id}@rev${c.rev}`, label: `Client record, rev ${c.rev}, updated ${c.updatedAt}` },
      ...related.map((r) => ({ ref: `vault://${r.path}`, label: `Imported ${r.kind || 'source'}: ${r.title}`, path: r.path })),
    ],
    uncertainties: s.uncertainties,
    extraMeta: { workspace: ws.id, record_id: c.id, record_rev: c.rev, record_updated_at: c.updatedAt, stage: c.stage },
    body,
  };
}

module.exports = { clientViewPath, renderClientView };
