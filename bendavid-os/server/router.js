'use strict';
// Request router. Turns a typed (or spoken) request into a *decision*; it
// never executes anything itself. Three routes:
//   deterministic -> saved data and rule-based operations (no AI call)
//   light         -> lightweight reasoning through the configured model
//   workflow      -> longer tasks through the installed Claude Code runtime
// Unsupported or ambiguous requests get a clarifying question with options.
//
// The router is replaceable: any implementation with { id, name, route(text,
// ctx) } can be plugged in via BENDAVID_ROUTER, and every decision passes
// validateDecision() before the UI sees it. Only the rule-based router exists.

const { HttpError } = require('./store');

const WORKFLOW_INTENTS = {
  plan: { workflowId: 'plan-my-day', label: 'Plan My Day' },
  missing: { workflowId: 'find-missing-statements', label: 'Find Missing Statements' },
  review: { workflowId: 'review-pipeline', label: 'Review Pipeline' },
  followUp: { workflowId: 'prepare-follow-up', label: 'Prepare Follow-Up' },
  summarize: { workflowId: 'summarize-client', label: 'Summarize Client' },
};

const PATTERNS = {
  plan: /\b(plan( my)? day|my day|today'?s (plan|priorities)|priorit(y|ies)|what should i do)\b/i,
  missing: /\b(missing|outstanding|owe[sd]?|still need)\b.*\b(statements?|docs?|documents?)\b|^(bank )?statements?$/i,
  review: /\b(review|analy[sz]e|health|report on)\b.*\bpipeline\b|\bpipeline\b.*\b(review|health|report|analysis)\b/i,
  followUp: /^(?:please\s+)?(?:prepare|draft|write)?\s*(?:a\s+)?(?:follow[\s-]?up|follow up email|email|draft)\b\s*(?:for|with|to)?\s*(.*)$/i,
  summarize: /^(?:please\s+)?(?:summari[sz]e|summary(?: of)?|brief(?: me)?(?: on)?|status of)\b\s*(.*)$/i,
};

const clean = (s) => String(s || '').replace(/\(sample\)/ig, '').trim().toLowerCase();

function matchClients(clients, query) {
  const q = clean(query).replace(/^(the|client|for|with|to|on)\s+/, '').replace(/[.?!]+$/, '').trim();
  if (!q) return [];
  return clients.filter((c) => [c.businessName, c.contactName, c.email].some((v) => clean(v).includes(q))
    || clean(c.contactName).split(/\s+/)[0] === q);
}

function clientOption(c, workflowId, engine) {
  const inputs = { clientId: c.id, ...(engine ? { engine } : {}) };
  return { label: `${c.businessName}${c.sample ? ' (SAMPLE)' : ''}`, decision: runDecision(workflowId, inputs) };
}

function runDecision(workflowId, inputs = {}, extra = {}) {
  const route = inputs.engine === 'ai' ? 'light' : inputs.engine === 'claude-code' ? 'workflow' : 'deterministic';
  return {
    type: 'run', workflowId, inputs, route,
    // AI and Claude Code routes use outside services: always ask first.
    confirm: route !== 'deterministic',
    explanation: route === 'deterministic' ? 'Uses saved data only (no AI call).' : route === 'light' ? 'Uses the configured AI service (one API call).' : 'Runs the installed Claude Code (uses your Claude plan).',
    ...extra,
  };
}

function genericClarify(question) {
  return {
    type: 'clarify', question,
    options: [
      { label: 'Plan My Day', decision: runDecision('plan-my-day') },
      { label: 'Find Missing Statements', decision: runDecision('find-missing-statements') },
      { label: 'Review Pipeline', decision: runDecision('review-pipeline') },
      { label: 'Prepare Follow-Up…', decision: { type: 'navigate', view: 'workflows', focus: 'prepare-follow-up', explanation: 'Pick a client on the Workflows page.' } },
      { label: 'Summarize Client…', decision: { type: 'navigate', view: 'workflows', focus: 'summarize-client', explanation: 'Pick a client on the Workflows page.' } },
      { label: 'Show commands', decision: { type: 'action', action: 'help', explanation: '' } },
    ],
  };
}

function clientWorkflow(intent, target, clients, engine) {
  const { workflowId, label } = WORKFLOW_INTENTS[intent];
  const found = matchClients(clients, target);
  if (found.length === 1) return runDecision(workflowId, { clientId: found[0].id, ...(engine ? { engine } : {}) });
  const pool = found.length ? found : clients
    .slice().sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999')).slice(0, 8);
  return {
    type: 'clarify',
    question: found.length > 1
      ? `More than one client matches "${target}". Which one should ${label} use?`
      : target ? `No client matches "${target}". Which client should ${label} use?` : `Which client should ${label} use?`,
    options: pool.map((c) => clientOption(c, workflowId, engine)),
  };
}

function createRuleRouter() {
  return {
    id: 'rules',
    name: 'Rule-based router v1',
    route(rawText, { clients }) {
      const text = String(rawText || '').trim().slice(0, 300);
      const lower = text.toLowerCase();
      let m;
      if (!text) return genericClarify('What would you like to do?');
      if (/^(help|\?|commands|what can you do)/i.test(text)) return { type: 'action', action: 'help', explanation: 'Show the commands I understand.' };
      if (/^(new|add|create) (a )?client\b/i.test(text)) return { type: 'action', action: 'new-client', explanation: 'Open the new client form.' };
      if ((m = /^(?:add\s+)?task[:\s]+(.+)$/i.exec(text))) return { type: 'action', action: 'add-task', params: { title: m[1].trim() }, explanation: 'Add a task due today.' };
      if (/^back ?up\b/i.test(text)) return { type: 'action', action: 'backup', explanation: 'Make a backup copy of the database now.' };
      if (/^(show |open )?(the )?(deal )?pipeline( board)?$|^(board|kanban)$/i.test(text)) return { type: 'navigate', view: 'dashboard', focus: 'pipeline', explanation: 'Open the pipeline board.' };

      const hits = Object.keys(PATTERNS).filter((k) => PATTERNS[k].test(text));
      const distinct = [...new Set(hits)];
      if (distinct.length > 1) {
        return {
          type: 'clarify',
          question: 'That could mean more than one thing. Which should I do?',
          options: distinct.map((k) => ({ label: WORKFLOW_INTENTS[k].label, decision: ['followUp', 'summarize'].includes(k) ? { type: 'navigate', view: 'workflows', focus: WORKFLOW_INTENTS[k].workflowId, explanation: '' } : runDecision(WORKFLOW_INTENTS[k].workflowId) })),
        };
      }
      const wantsAi = /\b(with ai|using ai|ai (draft|summary|version))\b/i.test(text);
      const wantsClaude = /\b(claude code|claude|deep|written)\b/i.test(text);
      const strip = (s) => s.replace(/\b(with ai|using ai|ai|with claude code|claude code|claude|deep|written)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      switch (distinct[0]) {
        case 'plan': return runDecision('plan-my-day');
        case 'missing': {
          const target = (/(?:for|from)\s+(.+)$/i.exec(text) || [])[1];
          if (target) {
            const found = matchClients(clients, target);
            if (found.length === 1) return runDecision('find-missing-statements', { clientId: found[0].id });
          }
          return runDecision('find-missing-statements');
        }
        case 'review': return runDecision('review-pipeline', wantsClaude ? { engine: 'claude-code' } : {});
        case 'followUp': return clientWorkflow('followUp', strip(PATTERNS.followUp.exec(text)[1] || ''), clients, wantsAi ? 'ai' : null);
        case 'summarize': return clientWorkflow('summarize', strip(PATTERNS.summarize.exec(text)[1] || ''), clients, wantsAi ? 'ai' : null);
        default: break;
      }
      if ((m = /^(?:find|search|open|show|look ?up)\s+(.+)$/i.exec(text))) {
        const found = matchClients(clients, m[1]);
        return { type: 'search', query: m[1], clientIds: found.map((c) => c.id), explanation: found.length ? `${found.length} matching client(s).` : 'No matching clients.' };
      }
      const found = matchClients(clients, lower);
      if (found.length === 1) {
        const c = found[0];
        return {
          type: 'clarify', question: `What would you like to do with ${c.businessName}?`,
          options: [
            { label: 'Summarize', decision: runDecision('summarize-client', { clientId: c.id }) },
            { label: 'Prepare follow-up', decision: runDecision('prepare-follow-up', { clientId: c.id }) },
            { label: 'Find missing statements', decision: runDecision('find-missing-statements', { clientId: c.id }) },
            { label: 'Open record', decision: { type: 'search', query: text, clientIds: [c.id], explanation: '' } },
          ],
        };
      }
      if (found.length > 1) return { type: 'search', query: text, clientIds: found.map((c) => c.id), explanation: `${found.length} clients match. Pick one.` };
      return genericClarify(`I'm not sure what "${text.slice(0, 80)}" should do. AI routing isn't connected, so I only follow known commands. Did you mean one of these?`);
    },
  };
}

// Every decision, from any router, is checked before use.
function validateDecision(d, registry) {
  const ok = d && typeof d === 'object';
  if (!ok) throw new HttpError(500, 'Router returned no decision');
  switch (d.type) {
    case 'run':
      registry.get(d.workflowId);
      if (d.inputs && typeof d.inputs !== 'object') throw new HttpError(500, 'Router returned invalid inputs');
      return d;
    case 'clarify':
      if (!Array.isArray(d.options)) throw new HttpError(500, 'Clarification without options');
      d.options.forEach((o) => validateDecision(o.decision, registry));
      return d;
    case 'navigate':
      if (!['jarvis', 'dashboard', 'workflows', 'runs', 'knowledge', 'connections'].includes(d.view)) throw new HttpError(500, 'Unknown view');
      return d;
    case 'action':
      if (!['help', 'new-client', 'add-task', 'backup'].includes(d.action)) throw new HttpError(500, 'Unknown action');
      return d;
    case 'search':
      return d;
    default:
      throw new HttpError(500, `Unknown decision type ${d.type}`);
  }
}

function createRouter(kind = 'rules') {
  if (kind !== 'rules') {
    console.warn(`Router "${kind}" is not available; using the rule-based router.`);
  }
  return createRuleRouter();
}

module.exports = { createRouter, validateDecision, matchClients };
