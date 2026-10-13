'use strict';
// Rule-based planning and TEMPLATE drafts. No AI involved: everything here is
// deterministic, so it works offline and never invents facts. Drafts only use
// offer numbers that are marked "confirmed" on the client record.

const { STAGES, todayISO } = require('./store');

const STATEMENT_RE = /statement/i;
const BANNED_TERMS = /\b(loans?|interest|lend(ing|er)?|borrow(ing|ed)?|apr)\b/i;

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function firstName(contact) {
  return String(contact || '').replace(/\(sample\)/i, '').trim().split(/\s+/)[0] || 'there';
}

function usd(n) {
  return n === null || n === undefined ? '' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function missingDocs(client) {
  return (client.requestedDocs || []).filter((d) => !d.received);
}

function missingStatements(state) {
  return state.clients
    .filter((c) => c.stage !== 'Funded')
    .map((c) => ({ client: c, missing: missingDocs(c).filter((d) => STATEMENT_RE.test(d.name)) }))
    .filter((x) => x.missing.length)
    .map(({ client, missing }) => ({
      clientId: client.id, sample: client.sample, businessName: client.businessName, contactName: client.contactName,
      stage: client.stage, missing: missing.map((d) => d.name),
      oldestRequest: missing.map((d) => d.requestedAt).sort()[0] || '',
      daysWaiting: missing[0] && missing[0].requestedAt ? daysBetween(missing.map((d) => d.requestedAt).sort()[0], todayISO()) : null,
    }))
    .sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));
}

// Priority 1 = do first. Each item explains why it's on the list.
function planDay(state, today = todayISO()) {
  const items = [];
  const push = (it) => items.push({ sample: false, ...it });

  for (const c of state.clients) {
    if (c.stage === 'Funded') {
      if (c.followUpDate && c.followUpDate <= today) {
        push({ priority: 3, kind: 'follow-up', clientId: c.id, sample: c.sample, title: `Check in with ${c.businessName}`, why: 'Funded client follow-up date reached' });
      }
      continue;
    }
    const late = c.followUpDate && c.followUpDate < today;
    const due = c.followUpDate === today;
    const nearClose = ['Contract', 'Bank Verification', 'Funding Call'].includes(c.stage);
    if (late || due) {
      push({
        priority: late || nearClose ? 1 : 2, kind: 'follow-up', clientId: c.id, sample: c.sample,
        title: `Follow up: ${c.businessName}`,
        why: late ? `Follow-up was due ${c.followUpDate} (${daysBetween(c.followUpDate, today)} day(s) overdue)` : 'Follow-up due today',
        next: c.nextAction,
      });
    } else if (nearClose) {
      push({ priority: 2, kind: 'close', clientId: c.id, sample: c.sample, title: `Keep ${c.businessName} moving (${c.stage})`, why: 'Close to funding', next: c.nextAction });
    }
    const stale = c.lastContact ? daysBetween(c.lastContact, today) : null;
    if (!late && !due && stale !== null && stale >= 5) {
      push({ priority: 2, kind: 'stale', clientId: c.id, sample: c.sample, title: `Reconnect with ${c.businessName}`, why: `No contact in ${stale} days` });
    }
    if (!c.followUpDate) {
      push({ priority: 3, kind: 'hygiene', clientId: c.id, sample: c.sample, title: `Set a follow-up date for ${c.businessName}`, why: 'No follow-up date on file' });
    }
  }
  for (const m of missingStatements(state)) {
    push({ priority: 2, kind: 'documents', clientId: m.clientId, sample: m.sample, title: `Collect statements: ${m.businessName}`, why: `Missing: ${m.missing.join(', ')}` });
  }
  for (const t of state.tasks) {
    if (t.done || !t.due || t.due > today) continue;
    push({ priority: t.due < today ? 1 : 2, kind: 'task', taskId: t.id, clientId: t.clientId, sample: t.sample, title: t.title, why: t.due < today ? `Task overdue since ${t.due}` : 'Task due today' });
  }
  items.sort((a, b) => a.priority - b.priority || Number(a.sample) - Number(b.sample));
  return { date: today, items };
}

// ---------- TEMPLATE follow-up drafts ----------
function offerLine(o) {
  const parts = [];
  if (o.advanceAmount !== null) parts.push(`${usd(o.advanceAmount)} in funding`);
  if (o.paybackAmount !== null) parts.push(`${usd(o.paybackAmount)} total payback`);
  if (o.paymentAmount !== null && o.paymentFrequency) parts.push(`${usd(o.paymentAmount)} ${o.paymentFrequency.toLowerCase()} remittance`);
  return parts.join(', ');
}

function followUpDraft(client) {
  const name = firstName(client.contactName);
  const biz = client.businessName.replace(/\s*\(sample\)/i, '');
  const missing = missingDocs(client).map((d) => d.name);
  const o = client.offer || {};
  const confirmedOffer = o.confirmed && offerLine(o);
  let subject;
  let body;

  switch (client.stage) {
    case 'Statements':
      subject = `${biz}: documents to finish your file`;
      body = missing.length
        ? `Hi ${name},\n\nTo move ${biz} forward I still need: ${missing.join('; ')}.\n\nCan you reply with those attached? Once I have them, I'll get your file in front of funders.\n\nRuben`
        : `Hi ${name},\n\nI have what I need for ${biz}. I'm working on your file now.\n\nIs this still the best number to reach you when I have an update?\n\nRuben`;
      break;
    case 'Offer':
      subject = `${biz}: your funding offer`;
      body = confirmedOffer
        ? `Hi ${name},\n\nFollowing up on the offer for ${biz}: ${confirmedOffer}.\n\nWant to move forward? Reply yes and I'll prepare the next step.\n\nRuben`
        : `Hi ${name},\n\nI'm working on offers for ${biz} and will share details once they're confirmed.\n\nAny changes to your revenue or funding needs I should know about?\n\nRuben`;
      break;
    case 'Accepted':
      subject = `${biz}: next step is the contract`;
      body = `Hi ${name},\n\nGlad you're moving forward with ${biz}. Next step is the contract.\n\nCan you confirm the best email for e-signature?\n\nRuben`;
      break;
    case 'Contract':
      subject = `${biz}: contract review`;
      body = `Hi ${name},\n\nChecking in on the contract for ${biz}.\n\nDo you have any questions before signing? Happy to walk through it on a quick call.\n\nRuben`;
      break;
    case 'Bank Verification':
      subject = `${biz}: bank verification`;
      body = `Hi ${name},\n\nWe're at bank verification for ${biz}, the last check before the funding call.\n\nCan you let me know once you've completed it, or if you haven't seen the request?\n\nRuben`;
      break;
    case 'Funding Call':
      subject = `${biz}: funding call`;
      body = `Hi ${name},\n\nWe're ready for the funding call for ${biz}.\n\nWhat time works best for you to take a short call?\n\nRuben`;
      break;
    case 'Funded':
    default:
      subject = `Checking in on ${biz}`;
      body = `Hi ${name},\n\nHope the funding is putting ${biz} to good use.\n\nIf you know another owner who could use working capital, would you introduce us?\n\nRuben`;
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const warnings = [];
  if (wordCount > 80) warnings.push(`Draft is ${wordCount} words (target is under 80).`);
  if (BANNED_TERMS.test(`${subject} ${body}`)) warnings.push('Draft contains loan/interest wording. Revenue-based funding is not a loan.');
  if (client.stage === 'Offer' && !confirmedOffer) warnings.push('No confirmed offer on file, so no amounts were included.');
  if (!client.email) warnings.push('No email on file for this client.');

  return {
    kind: 'template', label: 'TEMPLATE DRAFT. Not sent. Review before using.',
    clientId: client.id, sample: client.sample, to: client.email, subject, body, wordCount, warnings,
  };
}

// ---------- daily report (Markdown, for the Obsidian vault) ----------
function dailyReport(state, today = todayISO()) {
  const real = { clients: state.clients.filter((c) => !c.sample), tasks: state.tasks.filter((t) => !t.sample) };
  const plan = planDay(real, today);
  const byStage = STAGES.map((s) => `| ${s} | ${real.clients.filter((c) => c.stage === s).length} |`).join('\n');
  const done = real.tasks.filter((t) => t.done && t.doneAt && t.doneAt.slice(0, 10) === today);
  const ms = missingStatements(real);
  const lines = [
    `# Daily Report: ${today}`,
    '',
    '> Generated by BenDavid OS from the data store. Sample records are excluded.',
    '',
    '## Priorities',
    plan.items.length ? plan.items.map((i) => `- [ ] **P${i.priority}** ${i.title} (${i.why})`).join('\n') : '- Nothing urgent on file.',
    '',
    '## Missing statements',
    ms.length ? ms.map((m) => `- ${m.businessName} (${m.contactName}): ${m.missing.join(', ')}`).join('\n') : '- None outstanding.',
    '',
    '## Pipeline',
    '| Stage | Clients |',
    '| --- | --- |',
    byStage,
    '',
    '## Completed today',
    done.length ? done.map((t) => `- [x] ${t.title}`).join('\n') : '- None yet.',
    '',
    '## Notes',
    '',
  ];
  return lines.join('\n');
}

module.exports = { planDay, missingStatements, followUpDraft, dailyReport, BANNED_TERMS };
