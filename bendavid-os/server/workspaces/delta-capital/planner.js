'use strict';
// Deterministic Delta Capital logic: priorities, missing statements, pipeline
// review, client summaries, and TEMPLATE follow-ups. No AI involved: it works
// offline and never invents facts. Drafts only use offer numbers that are
// marked "confirmed" on the client record.

const ws = require('./index');
const { addDays, daysBetween, monthLabel } = require('../../time');

const STATEMENT_RE = /statement/i;

function firstName(contact) {
  return String(contact || '').replace(/\(sample\)/i, '').trim().split(/\s+/)[0] || 'there';
}
function plainName(name) {
  return String(name || '').replace(/\s*\(sample\)/i, '');
}
function usd(n) {
  return n === null || n === undefined ? '' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
function isStatement(d) {
  return d.kind === 'bank-statement' || STATEMENT_RE.test(d.name);
}
function missingDocs(client) {
  return (client.requestedDocs || []).filter((d) => !d.received);
}

// "July, August and September 2026" / "December 2025 and January 2026"
function monthsPhrase(months) {
  const sorted = [...months].sort();
  const years = new Set(sorted.map((m) => m.slice(0, 4)));
  if (years.size === 1) {
    const names = sorted.map((m) => monthLabel(m).split(' ')[0]);
    return `${joinList(names)} ${[...years][0]}`;
  }
  return joinList(sorted.map(monthLabel));
}

// ---------- missing statements ----------
function missingStatements(state, { today, clientId = null, includeSamples = true } = {}) {
  return state.clients
    .filter((c) => c.stage !== ws.closedStage)
    .filter((c) => (clientId ? c.id === clientId : true))
    .filter((c) => includeSamples || !c.sample)
    .map((c) => {
      const missing = missingDocs(c).filter(isStatement);
      const months = missing.filter((d) => d.month).map((d) => d.month).sort();
      const other = missing.filter((d) => !d.month).map((d) => d.name);
      const oldest = missing.map((d) => d.requestedAt).filter(Boolean).sort()[0] || '';
      return {
        clientId: c.id, sample: c.sample, businessName: c.businessName, contactName: c.contactName, email: c.email,
        stage: c.stage, recordRev: c.rev, recordUpdatedAt: c.updatedAt,
        missingMonths: months, missingMonthLabels: months.map(monthLabel), otherMissing: other,
        missing: [...months.map((m) => `Bank statement: ${monthLabel(m)}`), ...other],
        oldestRequest: oldest, daysWaiting: oldest ? daysBetween(oldest, today) : null,
      };
    })
    .filter((x) => x.missing.length)
    .sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1));
}

// ---------- plan my day (priority 1 = do first) ----------
function planDay(state, today) {
  const items = [];
  const push = (it) => items.push({ sample: false, ...it });
  for (const c of state.clients) {
    if (c.stage === ws.closedStage) {
      if (c.followUpDate && c.followUpDate <= today) {
        push({ priority: 3, kind: 'follow-up', clientId: c.id, sample: c.sample, title: `Check in with ${c.businessName}`, why: 'Funded client follow-up date reached' });
      }
      continue;
    }
    const late = c.followUpDate && c.followUpDate < today;
    const due = c.followUpDate === today;
    const nearClose = ws.nearCloseStages.includes(c.stage);
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
  for (const m of missingStatements(state, { today })) {
    push({ priority: 2, kind: 'documents', clientId: m.clientId, sample: m.sample, title: `Collect statements: ${m.businessName}`, why: `Missing: ${m.missing.join(', ')}` });
  }
  for (const t of state.tasks) {
    if (t.done || !t.due || t.due > today) continue;
    push({ priority: t.due < today ? 1 : 2, kind: 'task', taskId: t.id, clientId: t.clientId, sample: t.sample, title: t.title, why: t.due < today ? `Task overdue since ${t.due}` : 'Task due today' });
  }
  items.sort((a, b) => a.priority - b.priority || Number(a.sample) - Number(b.sample));
  return { date: today, items };
}

// ---------- pipeline review ----------
function reviewPipeline(state, { today, includeSamples = true, staleDays = 7 }) {
  const clients = state.clients.filter((c) => includeSamples || !c.sample);
  const stages = ws.stages.map((stage) => {
    const list = clients.filter((c) => c.stage === stage);
    const confirmed = list.filter((c) => c.offer && c.offer.confirmed && c.offer.advanceAmount !== null);
    return {
      stage, count: list.length,
      confirmedFunding: confirmed.reduce((s, c) => s + c.offer.advanceAmount, 0),
      unconfirmedOffers: list.filter((c) => c.stage !== 'Statements' && !(c.offer && c.offer.confirmed)).length,
    };
  });
  const open = clients.filter((c) => c.stage !== ws.closedStage);
  const ageOf = (c) => (c.stageChangedAt ? daysBetween(c.stageChangedAt.slice(0, 10), today) : null);
  const row = (c, extra = {}) => ({ clientId: c.id, sample: c.sample, businessName: c.businessName, stage: c.stage, ...extra });
  const monthStart = `${today.slice(0, 7)}-01`;
  return {
    date: today,
    totals: {
      clients: clients.length, open: open.length,
      funded: clients.filter((c) => c.stage === ws.closedStage).length,
      fundedThisMonth: clients.filter((c) => c.stage === ws.closedStage && c.stageChangedAt && c.stageChangedAt.slice(0, 10) >= monthStart).length,
      samples: clients.filter((c) => c.sample).length,
    },
    stages,
    stalled: open.filter((c) => (ageOf(c) ?? 0) >= staleDays).map((c) => row(c, { daysInStage: ageOf(c) })).sort((a, b) => b.daysInStage - a.daysInStage),
    overdueFollowUps: open.filter((c) => c.followUpDate && c.followUpDate < today).map((c) => row(c, { followUpDate: c.followUpDate })),
    noFollowUpDate: open.filter((c) => !c.followUpDate).map((c) => row(c)),
    noNextAction: open.filter((c) => !String(c.nextAction || '').trim()).map((c) => row(c)),
    nearFunding: open.filter((c) => ws.nearCloseStages.includes(c.stage)).map((c) => row(c, { nextAction: c.nextAction })),
    missingStatements: missingStatements({ clients }, { today }).map((m) => row({ id: m.clientId, ...m }, { missing: m.missing })),
    missingContact: open.filter((c) => !c.lastContact).map((c) => row(c)),
  };
}

// ---------- client summary (saved data only) ----------
function summarizeClient(client, { today, activity = [], rawSources = [] }) {
  const o = client.offer || {};
  const missing = missingDocs(client);
  const stmts = missing.filter(isStatement);
  const daysInStage = client.stageChangedAt ? daysBetween(client.stageChangedAt.slice(0, 10), today) : null;
  const sinceContact = client.lastContact ? daysBetween(client.lastContact, today) : null;
  const history = activity.filter((a) => a.clientId === client.id).slice(0, 15).map((a) => ({ at: a.at, text: a.text }));
  const uncertainties = [];
  if (!client.lastContact) uncertainties.push('No last-contact date on file.');
  if (!client.followUpDate) uncertainties.push('No follow-up date on file.');
  if (client.stage !== 'Statements' && !o.confirmed) uncertainties.push('Offer details are not marked confirmed; amounts are excluded.');
  if (!client.email) uncertainties.push('No email address on file.');
  if (missing.length) uncertainties.push('Document status reflects the checkboxes in BenDavid OS, not the documents themselves.');
  return {
    headline: `${client.businessName} is in ${client.stage}${daysInStage !== null ? ` (${daysInStage} day${daysInStage === 1 ? '' : 's'} in stage)` : ''}.`,
    contact: { name: client.contactName, email: client.email, phone: client.phone },
    stage: client.stage, daysInStage, sinceContact,
    followUp: client.followUpDate ? { date: client.followUpDate, status: client.followUpDate < today ? 'overdue' : client.followUpDate === today ? 'due today' : 'scheduled' } : null,
    nextAction: client.nextAction || '',
    outstanding: missing.map((d) => (d.month ? `Bank statement: ${monthLabel(d.month)}` : d.name)),
    missingStatementMonths: stmts.filter((d) => d.month).map((d) => monthLabel(d.month)),
    offer: o.confirmed
      ? { confirmed: true, funder: o.funder, funding: usd(o.advanceAmount), payback: usd(o.paybackAmount), factorRate: o.factorRate, remittance: o.paymentAmount !== null && o.paymentFrequency ? `${usd(o.paymentAmount)} ${o.paymentFrequency.toLowerCase()}` : '', estimatedTerm: o.estimatedTerm }
      : { confirmed: false },
    notes: client.notes.slice(0, 10).map((n) => ({ at: n.at, text: n.text })),
    history,
    relatedRaw: rawSources.filter((r) => r.clientId === client.id).map((r) => ({ path: r.path, title: r.title, kind: r.kind })),
    uncertainties,
  };
}

// ---------- TEMPLATE follow-up drafts ----------
function offerLine(o) {
  const parts = [];
  if (o.advanceAmount !== null && o.advanceAmount !== undefined) parts.push(`${usd(o.advanceAmount)} in funding`);
  if (o.paybackAmount !== null && o.paybackAmount !== undefined) parts.push(`${usd(o.paybackAmount)} total payback`);
  if (o.paymentAmount !== null && o.paymentAmount !== undefined && o.paymentFrequency) parts.push(`${usd(o.paymentAmount)} ${o.paymentFrequency.toLowerCase()} remittance`);
  return parts.join(', ');
}

function wordCount(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

function checkDraft({ subject, body, client }) {
  const warnings = [];
  const count = wordCount(body);
  if (count > 80) warnings.push(`Draft is ${count} words (target is under 80).`);
  if (ws.bannedTerms.test(`${subject} ${body}`)) warnings.push('Draft uses loan/interest wording. Revenue-based funding is not a loan.');
  if (/\b(I've sent|I have sent|was sent|has been sent|I sent|approved|guaranteed)\b/i.test(body)) warnings.push('Draft claims something was sent or approved. Check before using.');
  const amounts = String(body).match(/\$[\d,]+(\.\d+)?/g) || [];
  const o = client.offer || {};
  const allowed = o.confirmed ? [o.advanceAmount, o.paybackAmount, o.paymentAmount].filter((n) => n !== null && n !== undefined).map(usd) : [];
  for (const a of amounts) if (!allowed.includes(a)) warnings.push(`Amount ${a} is not a confirmed offer figure on the record.`);
  if (!client.email) warnings.push('No email on file for this client.');
  return { wordCount: count, warnings };
}

function followUpDraft(client) {
  const name = firstName(client.contactName);
  const biz = plainName(client.businessName);
  const missing = missingDocs(client);
  const months = missing.filter((d) => d.month).map((d) => d.month);
  const others = missing.filter((d) => !d.month).map((d) => {
    const n = d.name.charAt(0).toLowerCase() + d.name.slice(1);
    return /^(your|the|a|an)\s/.test(n) ? n : `the ${n}`;
  });
  const o = client.offer || {};
  const confirmedOffer = o.confirmed && offerLine(o);
  let subject;
  let body;
  switch (client.stage) {
    case 'Statements': {
      const monthsPart = months.length ? `your business bank statements for ${monthsPhrase(months)}` : '';
      const needs = monthsPart && others.length ? `${monthsPart}, plus ${joinList(others)}` : monthsPart || joinList(others);
      subject = `${biz}: documents to finish your file`;
      body = needs
        ? `Hi ${name},\n\nTo move ${biz} forward I still need ${needs}.\n\nCan you reply with those attached? Once I have them, I'll get your file in front of funders.\n\nRuben`
        : `Hi ${name},\n\nI have what I need for ${biz} and I'm working on your file now.\n\nIs this still the best number to reach you when I have an update?\n\nRuben`;
      break;
    }
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
  const { wordCount: count, warnings } = checkDraft({ subject, body, client });
  if (client.stage === 'Offer' && !confirmedOffer) warnings.push('No confirmed offer on file, so no amounts were included.');
  return {
    kind: 'template', engine: 'template', label: 'TEMPLATE DRAFT. Not sent. Review before using.',
    clientId: client.id, sample: client.sample, to: client.email, subject, body, wordCount: count, warnings,
  };
}

module.exports = {
  missingDocs, missingStatements, planDay, reviewPipeline, summarizeClient, followUpDraft, checkDraft,
  monthsPhrase, usd, wordCount, firstName, plainName, addDays,
};
