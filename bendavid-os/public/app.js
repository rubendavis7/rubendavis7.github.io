// BenDavid OS front end. Vanilla JS; talks only to the local server's /api.
// No keys or secrets ever live here.
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGE_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'];

  let S = null;           // server state
  let PLAN = { items: [] };
  let editing = null;     // { id, rev, docs: [] } while the client dialog is open
  let currentDraft = null;

  // ---------- API ----------
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-BenDavid-OS': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function refresh() {
    try {
      [S, PLAN] = await Promise.all([api('GET', '/api/state'), api('GET', '/api/plan')]);
      render();
    } catch (err) {
      toast(`Can't reach BenDavid OS server. Is the start window still open? (${err.message})`, true);
    }
  }

  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error' : ''}`;
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), isError ? 7000 : 3500);
  }

  // ---------- helpers ----------
  const client = (id) => S.clients.find((c) => c.id === id);
  const sampleBadge = (r) => (r && r.sample ? ' <span class="badge sample">SAMPLE</span>' : '');
  const stageColor = (stage) => STAGE_COLORS[Math.max(0, S.stages.indexOf(stage))];
  const stagePill = (stage) => `<span class="stage-pill" style="color:${stageColor(stage)}">${esc(stage)}</span>`;
  function fmtDate(d) {
    if (!d) return '—';
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function dueClass(d) {
    if (!d || !S) return '';
    return d < S.today ? 'overdue' : d === S.today ? 'due-today' : '';
  }
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function visibleClients() {
    const showSamples = $('#show-samples').checked;
    return S.clients.filter((c) => showSamples || !c.sample);
  }
  function matches(c, q) {
    q = q.trim().toLowerCase();
    if (!q) return true;
    return [c.contactName, c.businessName, c.email, c.phone, c.stage, c.nextAction].some((v) => String(v || '').toLowerCase().includes(q));
  }
  function missingStatementDocs(c) {
    return c.requestedDocs.filter((d) => !d.received && /statement/i.test(d.name));
  }

  // ---------- render ----------
  function render() {
    renderIntegrations();
    $('#sample-banner').hidden = !S.hasSamples;
    $('#load-samples').hidden = S.hasSamples;
    renderHero();
    renderPriorities();
    renderTasks();
    renderSearch();
    renderActivity();
    renderKpis();
    renderPipeline();
    renderClientTable();
    renderTaskSelect();
    $('#data-path').textContent = S.paths.data;
    $('#backup-path').textContent = S.paths.backups;
    for (const ev of S.vaultEvents.slice(0, 1)) if (!shownVaultEvents.has(ev.at)) { shownVaultEvents.add(ev.at); toast(ev.message, true); }
  }
  const shownVaultEvents = new Set();

  function renderIntegrations() {
    $('#integrations').innerHTML = S.integrations.map((i) => `
      <li class="${i.connected ? 'on' : ''}" title="${esc(i.purpose)}: ${esc(i.detail)}">
        <span class="dot"></span>${esc(i.name)}<span class="state">: ${i.connected ? 'Connected' : 'Disconnected'}</span>
      </li>`).join('');
  }

  function renderHero() {
    const h = new Date().getHours();
    $('#greeting').textContent = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, Ruben.`;
    $('#today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const active = S.clients.filter((c) => c.stage !== 'Funded');
    const fu = active.filter((c) => c.followUpDate && c.followUpDate <= S.today).length;
    const ms = active.filter((c) => missingStatementDocs(c).length).length;
    const p1 = PLAN.items.filter((i) => i.priority === 1).length;
    $('#summary').textContent = S.clients.length
      ? `${active.length} active deal${active.length === 1 ? '' : 's'}. ${fu} follow-up${fu === 1 ? '' : 's'} due, ${ms} waiting on statements, ${p1} top priorit${p1 === 1 ? 'y' : 'ies'}.`
      : 'No clients yet. Add your first client from the Sales Dashboard.';
  }

  function prioItem(i) {
    const c = i.clientId && client(i.clientId);
    return `<li>
      <span class="badge p${i.priority}">P${i.priority}</span>
      <div class="grow">
        <div class="title">${esc(i.title)}${sampleBadge(i)}</div>
        <div class="why">${esc(i.why)}${i.next ? ` · Next: ${esc(i.next)}` : ''}</div>
      </div>
      ${c ? `<div class="result-actions">
        <button class="btn small ghost" data-action="open-client" data-id="${c.id}">Open</button>
        <button class="btn small ghost" data-action="draft" data-id="${c.id}">Draft</button></div>` : ''}
    </li>`;
  }

  function renderPriorities() {
    const items = PLAN.items.slice(0, 12);
    $('#prio-count').textContent = PLAN.items.length ? `${PLAN.items.length} item${PLAN.items.length === 1 ? '' : 's'}` : '';
    $('#priorities').innerHTML = items.length ? items.map(prioItem).join('') : '<li class="empty">Nothing urgent. Good time to prospect.</li>';
  }

  function taskItem(t) {
    const c = t.clientId && client(t.clientId);
    return `<li class="${t.done ? 'done' : ''}">
      <label>
        <input type="checkbox" data-action="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''}>
        <span class="grow">
          <span class="title">${esc(t.title)}</span>${sampleBadge(t)}
          <span class="why">${t.due ? ` · <span class="${t.done ? '' : dueClass(t.due)}">Due ${fmtDate(t.due)}</span>` : ''}${c ? ` · ${esc(c.businessName)}` : ''}</span>
        </span>
      </label>
      <button class="icon-btn" data-action="delete-task" data-id="${t.id}" aria-label="Delete task ${esc(t.title)}">✕</button>
    </li>`;
  }

  function sortTasks(list) {
    return list.slice().sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999'));
  }

  function renderTasks() {
    const open = S.tasks.filter((t) => !t.done);
    const doneToday = S.tasks.filter((t) => t.done && t.doneAt && t.doneAt.slice(0, 10) === S.today);
    const jarvis = sortTasks([...open.filter((t) => !t.due || t.due <= S.today), ...doneToday]);
    $('#task-count').textContent = `${open.length} open`;
    $('#jarvis-tasks').innerHTML = jarvis.length ? jarvis.map(taskItem).join('') : '<li class="empty">No tasks due today.</li>';
    const showDone = $('#show-done').checked;
    const all = sortTasks(S.tasks.filter((t) => showDone || !t.done).filter((t) => $('#show-samples').checked || !t.sample));
    $('#dash-tasks').innerHTML = all.length ? all.map(taskItem).join('') : '<li class="empty">No tasks.</li>';
  }

  function clientResult(c) {
    return `<li>
      <div class="grow">
        <button class="linkish" data-action="open-client" data-id="${c.id}">${esc(c.businessName)}</button>${sampleBadge(c)}
        <div class="why">${esc(c.contactName)} · ${stagePill(c.stage)}${c.followUpDate ? ` · <span class="${dueClass(c.followUpDate)}">Follow up ${fmtDate(c.followUpDate)}</span>` : ''}</div>
        <div class="why">${esc([c.email, c.phone].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="result-actions"><button class="btn small ghost" data-action="draft" data-id="${c.id}">Draft</button></div>
    </li>`;
  }

  function renderSearch() {
    const q = $('#jarvis-search').value;
    const list = S.clients.filter((c) => matches(c, q)).sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999')).slice(0, 25);
    $('#jarvis-results').innerHTML = list.length ? list.map(clientResult).join('') : `<li class="empty">${q ? 'No matching clients.' : 'No clients yet.'}</li>`;
  }

  function renderActivity() {
    $('#activity').innerHTML = S.activity.length ? S.activity.slice(0, 30).map((a) => `
      <li><div class="grow">${esc(a.text)}${sampleBadge(a)}</div><time datetime="${esc(a.at)}" title="${esc(new Date(a.at).toLocaleString())}">${ago(a.at)}</time></li>`).join('')
      : '<li class="empty">No activity yet.</li>';
  }

  function renderKpis() {
    const cs = visibleClients();
    const active = cs.filter((c) => c.stage !== 'Funded');
    const funded = cs.filter((c) => c.stage === 'Funded');
    const fundedTotal = funded.reduce((s, c) => s + (c.offer.confirmed && c.offer.advanceAmount ? c.offer.advanceAmount : 0), 0);
    const kpis = [
      ['Active deals', active.length, `${cs.length} total clients`],
      ['Follow-ups due', active.filter((c) => c.followUpDate && c.followUpDate <= S.today).length, 'today or overdue'],
      ['Missing statements', active.filter((c) => missingStatementDocs(c).length).length, 'clients waiting'],
      ['Near funding', cs.filter((c) => ['Contract', 'Bank Verification', 'Funding Call'].includes(c.stage)).length, 'contract → funding call'],
      ['Funded', funded.length, fundedTotal ? `$${fundedTotal.toLocaleString()} confirmed` : 'all time'],
    ];
    $('#kpis').innerHTML = kpis.map(([l, v, s]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${esc(s)}</div></div>`).join('');
  }

  function renderPipeline() {
    const cs = visibleClients();
    $('#pipeline').innerHTML = S.stages.map((stage, i) => {
      const inStage = cs.filter((c) => c.stage === stage);
      return `<section class="stage-col" aria-label="${esc(stage)}">
        <div class="bar" style="background:${STAGE_COLORS[i]}"></div>
        <h3><span>${esc(stage)}</span><span class="n">${inStage.length}</span></h3>
        ${inStage.map((c) => `
          <article class="card${c.sample ? ' is-sample' : ''}">
            <button class="linkish" data-action="open-client" data-id="${c.id}">${esc(c.businessName)}</button>${sampleBadge(c)}
            <div class="who">${esc(c.contactName)}</div>
            ${c.offer.confirmed && c.offer.advanceAmount ? `<div class="meta">$${c.offer.advanceAmount.toLocaleString()} confirmed offer</div>` : ''}
            ${c.followUpDate ? `<div class="meta ${dueClass(c.followUpDate)}">Follow up ${fmtDate(c.followUpDate)}</div>` : ''}
            ${missingStatementDocs(c).length ? '<div class="meta due-today">Statements missing</div>' : ''}
            <div class="moves">
              <button class="btn small ghost" data-action="move" data-id="${c.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(c.businessName)} back to ${esc(S.stages[i - 1] || '')}">◀</button>
              <button class="btn small ghost" data-action="move" data-id="${c.id}" data-dir="1" ${i === S.stages.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(c.businessName)} forward to ${esc(S.stages[i + 1] || '')}">▶</button>
            </div>
          </article>`).join('') || '<p class="muted small">Empty</p>'}
      </section>`;
    }).join('');
  }

  function renderClientTable() {
    const sel = $('#stage-filter');
    if (sel.options.length === 1) sel.insertAdjacentHTML('beforeend', S.stages.map((s) => `<option>${esc(s)}</option>`).join(''));
    const q = $('#client-filter').value;
    const st = sel.value;
    const list = visibleClients().filter((c) => matches(c, q) && (!st || c.stage === st))
      .sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));
    $('#client-count').textContent = `${list.length} shown`;
    $('#client-rows').innerHTML = list.length ? list.map((c) => `
      <tr>
        <td><button class="linkish" data-action="open-client" data-id="${c.id}">${esc(c.businessName)}</button>${sampleBadge(c)}<div class="sub">${esc(c.contactName)}</div></td>
        <td>${stagePill(c.stage)}</td>
        <td class="${dueClass(c.followUpDate)}">${fmtDate(c.followUpDate)}</td>
        <td>${esc(c.nextAction || '—')}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="muted">No clients match.</td></tr>';
  }

  function renderTaskSelect() {
    const sel = $('#task-client');
    const cur = sel.value;
    sel.innerHTML = '<option value="">No client</option>' + S.clients.map((c) => `<option value="${c.id}">${esc(c.businessName)}</option>`).join('');
    sel.value = S.clients.some((c) => c.id === cur) ? cur : '';
  }

  // ---------- views & console ----------
  function setView(v) {
    for (const b of $$('.views button')) b.setAttribute('aria-selected', String(b.dataset.view === v));
    $('#view-jarvis').hidden = v !== 'jarvis';
    $('#view-dashboard').hidden = v !== 'dashboard';
    try { localStorage.setItem('bdos.view', v); } catch { /* ignore */ }
  }

  function showConsole(title, html) {
    setView('jarvis');
    $('#console-title').textContent = title;
    $('#console-body').innerHTML = html;
    $('#console').hidden = false;
    $('#console').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }

  async function cmdPlan() {
    PLAN = await api('GET', '/api/plan');
    const groups = [1, 2, 3].map((p) => [p, PLAN.items.filter((i) => i.priority === p)]).filter(([, l]) => l.length);
    const names = { 1: 'Do first', 2: 'Then', 3: 'If time allows' };
    showConsole(`Plan for ${fmtDate(PLAN.date)}`, (groups.length ? groups.map(([p, l]) => `
      <div class="out-section"><h3>${names[p]}</h3><ol class="list">${l.map(prioItem).join('')}</ol></div>`).join('')
      : '<p>Nothing urgent on file. Good time to prospect or ask funded clients for referrals.</p>') +
      '<div class="out-section"><button class="btn small" data-action="daily-report">Save this as today\'s daily report in the vault</button></div>');
  }

  async function cmdMissing() {
    const list = await api('GET', '/api/missing-statements');
    showConsole('Missing Statements', list.length ? `<ul class="list">${list.map((m) => `
      <li>
        <div class="grow">
          <button class="linkish" data-action="open-client" data-id="${m.clientId}">${esc(m.businessName)}</button>${sampleBadge(m)}
          <div class="why">${esc(m.contactName)} · ${stagePill(m.stage)}${m.daysWaiting !== null ? ` · waiting ${m.daysWaiting} day${m.daysWaiting === 1 ? '' : 's'}` : ''}</div>
          <div class="why">Missing: ${esc(m.missing.join(', '))}</div>
        </div>
        <div class="result-actions">
          <button class="btn small ghost" data-action="draft" data-id="${m.clientId}">Draft request</button>
          <button class="btn small ghost" data-action="mark-statements" data-id="${m.clientId}">Mark received</button>
        </div>
      </li>`).join('')}</ul>` : '<p>No clients are waiting on statements.</p>');
  }

  function cmdPipeline() {
    setView('dashboard');
    $('#pipeline-heading').scrollIntoView({ block: 'start' });
    $('#pipeline').focus?.();
  }

  function cmdFollowUp(query = '') {
    const candidates = S.clients.filter((c) => matches(c, query));
    if (query && candidates.length === 1) return openDraft(candidates[0].id);
    const ranked = candidates.slice().sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));
    showConsole('Prepare Follow-Up', ranked.length ? `<p class="muted small">Pick a client. Drafts are templates built from the client record. Nothing is sent.</p>
      <div class="picker">${ranked.map((c) => `<button class="btn" data-action="draft" data-id="${c.id}" style="justify-content:flex-start;text-align:left">
        <span>${esc(c.businessName)}${sampleBadge(c)}<br><span class="muted small">${esc(c.stage)}${c.followUpDate ? ` · <span class="${dueClass(c.followUpDate)}">${fmtDate(c.followUpDate)}</span>` : ''}</span></span></button>`).join('')}</div>`
      : `<p>No clients match "${esc(query)}".</p>`);
  }

  async function openDraft(id) {
    try {
      const d = await api('GET', `/api/clients/${encodeURIComponent(id)}/followup`);
      currentDraft = d;
      $('#draft-body').innerHTML = `
        <div class="draft-meta"><span class="badge template">TEMPLATE</span> ${sampleBadge(d)}<span>${esc(d.label)}</span></div>
        <div class="draft-meta"><span><b>To:</b> ${esc(d.to || '(no email on file)')}</span><span><b>Subject:</b> ${esc(d.subject)}</span><span>${d.wordCount} words</span></div>
        <div class="draft-box">${esc(d.body)}</div>
        ${d.warnings.length ? `<ul class="warn">${d.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
      const dlg = $('#draft-dialog');
      if (!dlg.open) dlg.showModal();
    } catch (err) { toast(err.message, true); }
  }

  // ---------- local command parser (no AI) ----------
  const HELP = `<ul class="list">
    <li><code>plan my day</code> Ranked priorities</li>
    <li><code>missing statements</code> Who still owes documents</li>
    <li><code>pipeline</code> Open the deal pipeline</li>
    <li><code>follow up derek</code> Template follow-up for a client</li>
    <li><code>find bakery</code> Search clients</li>
    <li><code>new client</code> Add a client</li>
    <li><code>task call Maria at 3</code> Add a task due today</li>
    <li><code>daily report</code> · <code>backup</code></li></ul>`;

  async function runCommand(raw) {
    const text = raw.trim();
    const lower = text.toLowerCase();
    let m;
    if (!text) return;
    if (/^(help|\?|commands)$/.test(lower)) return showConsole('Commands', HELP);
    if (/plan|my day|priorit/.test(lower)) return cmdPlan();
    if (/missing|statements?$/.test(lower)) return cmdMissing();
    if (/^(pipeline|deals?|board|deal pipeline)$/.test(lower)) return cmdPipeline();
    if ((m = /^(?:prepare\s+)?(?:follow[\s-]?up|draft|email)\s*(?:for|with|to)?\s*(.*)$/i.exec(text))) return cmdFollowUp(m[1]);
    if (/^(new|add)\s+client/.test(lower)) return openClient(null);
    if ((m = /^(?:add\s+)?task[:\s]+(.+)$/i.exec(text))) {
      await api('POST', '/api/tasks', { title: m[1], due: S.today });
      toast('Task added for today');
      return refresh();
    }
    if (/daily report|report/.test(lower)) return dailyReport();
    if (/^backup/.test(lower)) return backup();
    if ((m = /^(?:find|search|open|show|lookup)\s+(.+)$/i.exec(text))) {
      const found = S.clients.filter((c) => matches(c, m[1]));
      if (found.length === 1) return openClient(found[0].id);
      return showConsole(`Search: ${m[1]}`, found.length ? `<ul class="list">${found.map(clientResult).join('')}</ul>` : '<p>No matching clients.</p>');
    }
    const found = S.clients.filter((c) => matches(c, text));
    if (found.length) return showConsole(`Clients matching "${text}"`, `<ul class="list">${found.map(clientResult).join('')}</ul>`);
    showConsole('Not understood', `<p>I don't know that command yet. AI execution isn't connected, so I only understand these:</p>${HELP}`);
  }

  // ---------- client dialog ----------
  function setField(form, name, value) {
    const el = form.elements[name];
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value ?? '';
  }

  function openClient(id) {
    const form = $('#client-form');
    form.reset();
    $('#client-error').hidden = true;
    $('#stage-select').innerHTML = S.stages.map((s) => `<option>${esc(s)}</option>`).join('');
    const c = id ? client(id) : null;
    if (id && !c) return toast('That client no longer exists', true);
    editing = c
      ? { id: c.id, rev: c.rev, docs: c.requestedDocs.map((d) => ({ ...d })) }
      : { id: null, rev: null, docs: [{ name: 'Business bank statements (last 4 months)', received: false }, { name: 'Signed application', received: false }] };
    $('#client-dialog-title').innerHTML = c ? `${esc(c.businessName)}${sampleBadge(c)}` : 'New client';
    const values = c || { stage: S.stages[0], lastContact: S.today, nextAction: 'Request bank statements', offer: {} };
    for (const k of ['contactName', 'businessName', 'email', 'phone', 'stage', 'lastContact', 'followUpDate', 'nextAction']) setField(form, k, values[k]);
    for (const [k, v] of Object.entries(values.offer || {})) setField(form, `offer.${k}`, v);
    $('#delete-client').hidden = !c;
    $('#dialog-followup').hidden = !c;
    renderDocs();
    renderNotes(c);
    $('#client-dialog').showModal();
    form.elements.contactName.focus();
  }

  function renderDocs() {
    $('#doc-list').innerHTML = editing.docs.length ? editing.docs.map((d, i) => `
      <li class="${d.received ? '' : 'missing'}">
        <label><input type="checkbox" data-action="toggle-doc" data-i="${i}" ${d.received ? 'checked' : ''}> ${esc(d.name)}</label>
        <span class="state">${d.received ? `Received${d.receivedAt ? ` ${fmtDate(d.receivedAt)}` : ''}` : `Requested${d.requestedAt ? ` ${fmtDate(d.requestedAt)}` : ''}`}</span>
        <button class="icon-btn" type="button" data-action="remove-doc" data-i="${i}" aria-label="Remove ${esc(d.name)}">✕</button>
      </li>`).join('') : '<li class="muted small">No documents requested.</li>';
  }

  function renderNotes(c) {
    const notes = c ? c.notes : [];
    $('#note-list').innerHTML = notes.length ? notes.map((n) => `<li><time>${esc(new Date(n.at).toLocaleString())}</time><p>${esc(n.text)}</p></li>`).join('')
      : `<li class="empty">${c ? 'No notes yet.' : 'Notes typed above are saved when you save the client.'}</li>`;
  }

  function collectForm() {
    const f = $('#client-form').elements;
    const v = (n) => f[n].value;
    return {
      contactName: v('contactName'), businessName: v('businessName'), email: v('email'), phone: v('phone'),
      stage: v('stage'), lastContact: v('lastContact'), followUpDate: v('followUpDate'), nextAction: v('nextAction'),
      requestedDocs: editing.docs,
      offer: {
        confirmed: f['offer.confirmed'].checked, funder: v('offer.funder'), advanceAmount: v('offer.advanceAmount'),
        paybackAmount: v('offer.paybackAmount'), factorRate: v('offer.factorRate'), paymentAmount: v('offer.paymentAmount'),
        paymentFrequency: v('offer.paymentFrequency'), estimatedTerm: v('offer.estimatedTerm'), notes: v('offer.notes'),
      },
    };
  }

  function formError(msg, conflict = false) {
    const el = $('#client-error');
    el.innerHTML = esc(msg) + (conflict ? ' <button class="btn small" type="button" data-action="reload-client">Load newer version</button>' : '');
    el.hidden = false;
    el.scrollIntoView({ block: 'nearest' });
  }

  async function saveClient() {
    const body = collectForm();
    if (!body.contactName.trim() || !body.businessName.trim()) return formError('Contact name and business name are required.');
    const btn = $('#save-client');
    const isEdit = Boolean(editing.id);
    btn.disabled = true;
    try {
      let saved;
      if (isEdit) saved = (await api('PATCH', `/api/clients/${editing.id}`, { ...body, rev: editing.rev })).client;
      else saved = (await api('POST', '/api/clients', body)).client;
      const note = $('#new-note').value.trim();
      if (note) await api('POST', `/api/clients/${saved.id}/notes`, { text: note });
      $('#client-dialog').close();
      toast(isEdit ? `Saved ${saved.businessName}` : `Added ${saved.businessName}`);
      await refresh();
    } catch (err) {
      formError(err.message, err.status === 409);
    } finally {
      btn.disabled = false;
    }
  }

  async function addNote() {
    const text = $('#new-note').value.trim();
    if (!text) return;
    if (!editing.id) return toast('Note will be saved when you save the client');
    try {
      const { client: c } = await api('POST', `/api/clients/${editing.id}/notes`, { text });
      editing.rev = c.rev; // notes don't touch form fields, so keep editing
      $('#new-note').value = '';
      await refresh();
      renderNotes(client(c.id));
      toast('Note saved');
    } catch (err) { formError(err.message); }
  }

  // ---------- actions ----------
  async function moveClient(id, dir) {
    const c = client(id);
    const to = S.stages[S.stages.indexOf(c.stage) + dir];
    if (!to) return;
    try {
      await api('POST', `/api/clients/${id}/stage`, { stage: to, rev: c.rev });
      toast(`${c.businessName} → ${to}`);
    } catch (err) { toast(err.message, true); }
    await refresh();
  }

  async function toggleTask(id, done) {
    const t = S.tasks.find((x) => x.id === id);
    try {
      await api('PATCH', `/api/tasks/${id}`, { done, rev: t.rev });
      if (done) toast('Task completed');
    } catch (err) { toast(err.message, true); }
    await refresh();
  }

  async function markStatementsReceived(id) {
    const c = client(id);
    const docs = c.requestedDocs.map((d) => (/statement/i.test(d.name) && !d.received ? { ...d, received: true, receivedAt: S.today } : d));
    try {
      await api('PATCH', `/api/clients/${id}`, { requestedDocs: docs, rev: c.rev });
      toast(`Statements marked received for ${c.businessName}`);
      await refresh();
      cmdMissing();
    } catch (err) { toast(err.message, true); }
  }

  async function dailyReport() {
    try {
      const r = await api('POST', '/api/reports/daily');
      toast(r.status === 'protected' ? r.message : `Daily report saved: ${r.file}`, r.status === 'protected');
      await refresh();
    } catch (err) { toast(err.message, true); }
  }

  async function backup() {
    try {
      const r = await api('POST', '/api/backup');
      toast(`Backup saved: ${r.file}`);
      await refresh();
    } catch (err) { toast(err.message, true); }
  }

  async function copyDraft() {
    if (!currentDraft) return;
    const text = `Subject: ${currentDraft.subject}\n\n${currentDraft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Template copied. Review it before sending from your email app.');
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('.draft-box'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      toast('Press Ctrl+C to copy the selected draft.');
    }
  }

  const actions = {
    'plan': cmdPlan,
    'missing': cmdMissing,
    'pipeline': cmdPipeline,
    'followup': () => cmdFollowUp(''),
    'close-console': () => { $('#console').hidden = true; },
    'new-client': () => openClient(null),
    'open-client': (el) => { $('#draft-dialog').close(); openClient(el.dataset.id); },
    'draft': (el) => openDraft(el.dataset.id),
    'dialog-followup': () => openDraft(editing.id),
    'close-dialog': () => { $('#client-dialog').close(); editing = null; },
    'close-draft': () => $('#draft-dialog').close(),
    'copy-draft': copyDraft,
    'move': (el) => moveClient(el.dataset.id, Number(el.dataset.dir)),
    'delete-task': async (el) => {
      const t = S.tasks.find((x) => x.id === el.dataset.id);
      if (!confirm(`Delete task "${t.title}"?`)) return;
      try { await api('DELETE', `/api/tasks/${t.id}`, { rev: t.rev }); } catch (err) { toast(err.message, true); }
      refresh();
    },
    'add-doc': () => {
      const input = $('#new-doc');
      const name = input.value.trim();
      if (!name) return;
      editing.docs.push({ name, received: false, requestedAt: S.today });
      input.value = '';
      renderDocs();
    },
    'remove-doc': (el) => { editing.docs.splice(Number(el.dataset.i), 1); renderDocs(); },
    'add-note': addNote,
    'reload-client': () => { const id = editing.id; $('#client-dialog').close(); refresh().then(() => openClient(id)); },
    'delete-client': async () => {
      const c = client(editing.id);
      if (!confirm(`Delete ${c.businessName} and its tasks? This cannot be undone (backups still have it).`)) return;
      try {
        await api('DELETE', `/api/clients/${c.id}`, { rev: editing.rev });
        $('#client-dialog').close();
        editing = null;
        toast(`Deleted ${c.businessName}`);
        refresh();
      } catch (err) { formError(err.message, err.status === 409); }
    },
    'mark-statements': (el) => markStatementsReceived(el.dataset.id),
    'daily-report': dailyReport,
    'backup': backup,
    'load-samples': async () => { try { await api('POST', '/api/samples'); toast('Sample records loaded'); } catch (err) { toast(err.message, true); } refresh(); },
    'remove-samples': async () => {
      if (!confirm('Remove all SAMPLE records? Your real clients are not affected.')) return;
      try { const r = await api('DELETE', '/api/samples'); toast(`Removed ${r.removed} sample client(s)`); } catch (err) { toast(err.message, true); }
      refresh();
    },
  };

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.matches('input[type="checkbox"]')) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.action === 'toggle-task') toggleTask(el.dataset.id, el.checked);
    if (el.dataset.action === 'toggle-doc') {
      const d = editing.docs[Number(el.dataset.i)];
      d.received = el.checked;
      d.receivedAt = el.checked ? S.today : '';
      renderDocs();
    }
  });
  for (const b of $$('.views button')) b.addEventListener('click', () => setView(b.dataset.view));
  $('#command-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#command-input');
    runCommand(input.value).catch((err) => toast(err.message, true));
    input.value = '';
  });
  $('#quick-task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#quick-task');
    if (!input.value.trim()) return;
    try { await api('POST', '/api/tasks', { title: input.value, due: S.today }); input.value = ''; toast('Task added'); } catch (err) { toast(err.message, true); }
    refresh();
  });
  $('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/tasks', { title: $('#task-title').value, due: $('#task-due').value, clientId: $('#task-client').value || null });
      $('#task-title').value = '';
      toast('Task added');
    } catch (err) { toast(err.message, true); }
    refresh();
  });
  $('#client-form').addEventListener('submit', (e) => { e.preventDefault(); saveClient(); });
  $('#new-doc').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); actions['add-doc'](); } });
  $('#client-dialog').addEventListener('close', () => { editing = null; });
  $('#jarvis-search').addEventListener('input', renderSearch);
  $('#client-filter').addEventListener('input', renderClientTable);
  $('#stage-filter').addEventListener('change', renderClientTable);
  $('#show-samples').addEventListener('change', render);
  $('#show-done').addEventListener('change', renderTasks);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, dialog')) { e.preventDefault(); setView('jarvis'); $('#command-input').focus(); }
  });
  window.addEventListener('focus', () => { if (!$('#client-dialog').open) refresh(); });

  let startView = 'jarvis';
  try { startView = localStorage.getItem('bdos.view') || 'jarvis'; } catch { /* ignore */ }
  setView(startView === 'dashboard' ? 'dashboard' : 'jarvis');
  refresh();
})();
