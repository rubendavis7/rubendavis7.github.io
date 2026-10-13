// BenDavid OS front end: core, Jarvis view, dashboard, client editor.
// Talks only to the local backend (/api). No keys or secrets live here.
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAGE_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'];
  const VIEWS = ['jarvis', 'dashboard', 'workflows', 'runs', 'knowledge', 'connections'];
  const ACTIVE = new Set(['queued', 'running']);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  let S = null;            // server state
  let PLAN = { items: [] };
  let editing = null;      // client editor working copy
  let currentDraft = null;
  let currentView = 'jarvis';
  let lastConsoleSpeech = '';

  // ---------- Jarvis state (reflects real app state only) ----------
  const J = { pending: 0, listening: false, speaking: false, serverDown: false, error: null };
  const tracked = new Map(); // runId -> { run, onUpdate, onDone }

  function computeState() {
    if (J.serverDown) return ['error', 'Error', "Can't reach the BenDavid OS server. Is its window still open?"];
    if (J.listening) return ['listening', 'Listening', 'Listening for a command…'];
    if (J.speaking) return ['speaking', 'Speaking', 'Reading the result aloud…'];
    const running = [...tracked.values()].map((t) => t.run).filter((r) => r && ACTIVE.has(r.status));
    if (running.length) return ['working', 'Working', `Running ${running.map((r) => r.workflowName).join(', ')}…`];
    if (J.pending > 0) return ['working', 'Working', 'Working…'];
    if (J.error) return ['error', 'Error', J.error];
    return ['idle', 'Idle', 'Ready.'];
  }
  function updateJarvis() {
    const [state, label, detail] = computeState();
    if (document.body.dataset.jarvis !== state) {
      document.body.dataset.jarvis = state;
      window.dispatchEvent(new CustomEvent('bdos:state', { detail: { state } }));
    }
    $('#state-pill-text').textContent = label;
    $('#state-tag').textContent = label;
    $('#state-detail').textContent = detail;
    $('#state-dismiss').hidden = !(state === 'error' && J.error && !J.serverDown);
  }

  // ---------- API ----------
  async function api(method, url, body, { quiet = false } = {}) {
    let timer = null;
    if (!quiet) timer = setTimeout(() => { J.pending++; timer = 'counted'; updateJarvis(); }, 250);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-BenDavid-OS': '1' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (J.serverDown) { J.serverDown = false; updateJarvis(); }
      let data = {};
      try { data = await res.json(); } catch { /* empty */ }
      if (!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err instanceof TypeError) { J.serverDown = true; updateJarvis(); }
      throw err;
    } finally {
      if (timer === 'counted') { J.pending--; updateJarvis(); } else if (timer) clearTimeout(timer);
    }
  }

  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' error' : ''}`;
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), isError ? 8000 : 4000);
  }

  // ---------- helpers ----------
  const client = (id) => S.clients.find((c) => c.id === id);
  const sampleBadge = (r) => (r && (r.sample || r.containsSamples) ? ' <span class="badge sample">SAMPLE</span>' : '');
  const stageColor = (stage) => STAGE_COLORS[Math.max(0, S.stages.indexOf(stage))];
  const stagePill = (stage) => `<span class="stage-pill" style="color:${stageColor(stage)}">${esc(stage)}</span>`;
  function fmtDate(d) {
    if (!d) return '—';
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtTime(iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: S ? S.timezone : undefined }) : '—';
  }
  const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
  function dueClass(d) { return !d || !S ? '' : d < S.today ? 'overdue' : d === S.today ? 'due-today' : ''; }
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function visibleClients() { return S.clients.filter((c) => $('#show-samples').checked || !c.sample); }
  function matches(c, q) {
    q = q.trim().toLowerCase();
    if (!q) return true;
    return [c.contactName, c.businessName, c.email, c.phone, c.stage, c.nextAction].some((v) => String(v || '').toLowerCase().includes(q));
  }
  const missingStatementDocs = (c) => c.requestedDocs.filter((d) => !d.received && (d.kind === 'bank-statement' || /statement/i.test(d.name)));
  const docLabel = (d) => (d.month ? `Bank statement: ${monthName(d.month)}` : d.name);

  // ---------- views (hash routing) ----------
  function parseHash() {
    const m = /^#\/([\w-]+)(?:\?(.*))?$/.exec(location.hash || '');
    const view = m && VIEWS.includes(m[1]) ? m[1] : 'jarvis';
    return { view, params: new URLSearchParams(m && m[2] ? m[2] : '') };
  }
  function go(view, params = '') { location.hash = `#/${view}${params ? `?${params}` : ''}`; }
  function showView() {
    const { view, params } = parseHash();
    currentView = view;
    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
    for (const a of $$('.views a')) {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const page = window.BDOS.pages && window.BDOS.pages[view];
    if (page && S) page.show(params);
    if (view === 'dashboard' && params.get('focus') === 'pipeline') setTimeout(() => $('#pipeline-panel').scrollIntoView({ block: 'start' }), 50);
  }

  // ---------- refresh & render ----------
  async function refresh() {
    try {
      [S, PLAN] = await Promise.all([api('GET', '/api/state', undefined, { quiet: true }), api('GET', '/api/plan', undefined, { quiet: true })]);
      for (const r of S.activeRuns) if (!tracked.has(r.id)) trackRun(r);
      render();
    } catch (err) {
      if (!J.serverDown) toast(`Couldn't load data: ${err.message}`, true);
    }
  }

  const shownVaultEvents = new Set();
  function render() {
    renderTopStatus();
    $('#sample-banner').hidden = !S.hasSamples;
    $('#load-samples').hidden = S.hasSamples;
    $('#workspace-label').textContent = `${S.workspace.name} · ${S.timezone.replace('_', ' ')}`;
    renderHero();
    renderVoiceControls();
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
    const page = window.BDOS.pages && window.BDOS.pages[currentView];
    if (page && page.refresh) page.refresh();
    updateJarvis();
  }

  function renderTopStatus() {
    const pick = ['light-model', 'claude-code', 'transcription'];
    const short = { 'light-model': 'AI service', 'claude-code': 'Claude Code', transcription: 'Voice' };
    $('#integrations').innerHTML = S.connections.filter((c) => pick.includes(c.id)).map((c) => {
      const cls = c.state === 'verified' ? 'ok' : c.state === 'failed' ? 'bad' : c.state === 'unverified' ? 'warn' : '';
      const text = c.id === 'transcription' && c.state === 'not-configured' ? 'Unavailable' : c.label;
      return `<li class="${cls}"><a href="#/connections" title="${esc(c.name)}: ${esc(c.detail)}"><span class="dot"></span><span>${short[c.id]}<span class="state">: ${esc(text)}</span></span></a></li>`;
    }).join('');
  }

  function renderHero() {
    const h = S.now.hour;
    $('#greeting').textContent = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, Ruben.`;
    const [y, m, d] = S.today.split('-').map(Number);
    $('#today-label').textContent = `${new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${S.now.time} ET`;
    const active = S.clients.filter((c) => c.stage !== 'Funded');
    const fu = active.filter((c) => c.followUpDate && c.followUpDate <= S.today).length;
    const ms = active.filter((c) => missingStatementDocs(c).length).length;
    const p1 = PLAN.items.filter((i) => i.priority === 1).length;
    $('#summary').textContent = S.clients.length
      ? `${active.length} active deal${active.length === 1 ? '' : 's'}. ${fu} follow-up${fu === 1 ? '' : 's'} due, ${ms} waiting on statements, ${p1} top priorit${p1 === 1 ? 'y' : 'ies'}.`
      : 'No clients yet. Add your first client from the Dashboard.';
  }

  function voiceUsable(kind) { return S && window.BDOSVoice.usable(kind, S.voice[kind]); }
  function renderVoiceControls() {
    const mic = $('#mic-btn');
    const t = S.voice.transcription;
    const can = voiceUsable('transcription');
    mic.disabled = !can;
    mic.title = can ? 'Speak a command' : t === 'none' ? 'Voice is unavailable: not configured (see Connections)' : 'Voice is configured but this browser does not support it';
    $('#command-note').textContent = `Rule-based routing (no AI needed). Anything that would use the AI service or Claude Code asks you first. Voice: ${can ? 'available (press 🎙)' : t === 'none' ? 'unavailable (not configured)' : 'unavailable in this browser'}.`;
    $('#speak-btn').hidden = !voiceUsable('speech') || !lastConsoleSpeech;
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
  const sortTasks = (list) => list.slice().sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999'));
  function renderTasks() {
    const open = S.tasks.filter((t) => !t.done);
    const doneToday = S.tasks.filter((t) => t.done && t.doneAt && t.doneAt.slice(0, 10) === S.today);
    const jarvis = sortTasks([...open.filter((t) => !t.due || t.due <= S.today), ...doneToday]);
    $('#task-count').textContent = `${open.length} open`;
    $('#jarvis-tasks').innerHTML = jarvis.length ? jarvis.map(taskItem).join('') : '<li class="empty">No tasks due today.</li>';
    const all = sortTasks(S.tasks.filter((t) => $('#show-done').checked || !t.done).filter((t) => $('#show-samples').checked || !t.sample));
    $('#dash-tasks').innerHTML = all.length ? all.map(taskItem).join('') : '<li class="empty">No tasks.</li>';
  }

  function clientResult(c) {
    return `<li>
      <div class="grow">
        <button class="linkish" data-action="open-client" data-id="${c.id}">${esc(c.businessName)}</button>${sampleBadge(c)}
        <div class="why">${esc(c.contactName)} · ${stagePill(c.stage)}${c.followUpDate ? ` · <span class="${dueClass(c.followUpDate)}">Follow up ${fmtDate(c.followUpDate)}</span>` : ''}</div>
        <div class="why">${esc([c.email, c.phone].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="result-actions">
        <button class="btn small ghost" data-action="summarize-client" data-id="${c.id}">Summarize</button>
        <button class="btn small ghost" data-action="draft" data-id="${c.id}">Draft</button>
      </div>
    </li>`;
  }
  function renderSearch() {
    const q = $('#jarvis-search').value;
    const list = S.clients.filter((c) => matches(c, q)).sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999')).slice(0, 25);
    $('#jarvis-results').innerHTML = list.length ? list.map(clientResult).join('') : `<li class="empty">${q ? 'No matching clients.' : 'No clients yet.'}</li>`;
  }
  function renderActivity() {
    $('#activity').innerHTML = S.activity.length ? S.activity.slice(0, 30).map((a) => `
      <li><div class="grow">${esc(a.text)}${sampleBadge(a)}</div><time datetime="${esc(a.at)}" title="${esc(fmtTime(a.at))}">${ago(a.at)}</time></li>`).join('')
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
            ${missingStatementDocs(c).length ? `<div class="meta due-today">${missingStatementDocs(c).length} statement${missingStatementDocs(c).length === 1 ? '' : 's'} missing</div>` : ''}
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
    const list = visibleClients().filter((c) => matches(c, q) && (!st || c.stage === st)).sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));
    $('#client-count').textContent = `${list.length} shown`;
    $('#client-rows').innerHTML = list.length ? list.map((c) => `
      <tr>
        <td><button class="linkish" data-action="open-client" data-id="${c.id}">${esc(c.businessName)}</button>${sampleBadge(c)}<div class="sub">${esc(c.contactName)}</div></td>
        <td>${stagePill(c.stage)}</td>
        <td class="${dueClass(c.followUpDate)}">${fmtDate(c.followUpDate)}</td>
        <td>${esc(c.nextAction || '—')}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="muted">No clients match.</td></tr>';
  }
  function clientOptions(selected = '') {
    return S.clients.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.businessName)}${c.sample ? ' (SAMPLE)' : ''}</option>`).join('');
  }
  function renderTaskSelect() {
    const sel = $('#task-client');
    const cur = sel.value;
    sel.innerHTML = `<option value="">No client</option>${clientOptions(cur)}`;
  }

  // ---------- console ----------
  function showConsole(title, html, speech = '') {
    if (currentView !== 'jarvis') go('jarvis');
    $('#console-title').textContent = title;
    $('#console-body').innerHTML = html;
    $('#console').hidden = false;
    lastConsoleSpeech = speech;
    $('#speak-btn').hidden = !voiceUsable('speech') || !speech;
    $('#console').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }
  const fileLink = (p, label) => `<a href="#/knowledge?path=${encodeURIComponent(p)}">${esc(label || p)}</a>`;
  function progressHtml(run) {
    return `<div class="wf-progress"><span class="status ${run.status}">${esc(run.status.replace('_', ' '))}</span> ${esc(run.workflowName)} · <span class="muted">${esc(run.engineLabel)}</span> · <code>${esc(run.id)}</code>
      <ol>${run.progress.slice(-6).map((p) => `<li>${esc(p.message)}</li>`).join('')}</ol></div>`;
  }
  function runFailureHtml(run) {
    return `<div class="error-box"><b>${esc(run.workflowName)} ${esc(run.status.replace('_', ' '))}.</b> ${esc(run.error ? run.error.message : '')}
      ${run.error && run.error.detail ? `<pre>${esc(run.error.detail)}</pre>` : ''}
      <div class="small">Run <a href="#/runs?id=${esc(run.id)}">${esc(run.id)}</a></div></div>`;
  }
  function outputsHtml(run) {
    if (!run.outputs.length) return '';
    return `<p class="small muted">Saved: ${run.outputs.map((o) => fileLink(o.path)).join(' · ')}</p>${run.warnings && run.warnings.length ? `<ul class="warn">${run.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
  }

  function resultHtml(run) {
    const d = run.result && run.result.data;
    switch (run.workflowId) {
      case 'plan-my-day': {
        const names = { 1: 'Do first', 2: 'Then', 3: 'If time allows' };
        const groups = [1, 2, 3].map((p) => [p, d.items.filter((i) => i.priority === p)]).filter(([, l]) => l.length);
        return (groups.length ? groups.map(([p, l]) => `<div class="out-section"><h3>${names[p]}</h3><ol class="list">${l.map(prioItem).join('')}</ol></div>`).join('')
          : '<p>Nothing urgent on file. Good time to prospect or ask funded clients for referrals.</p>') + outputsHtml(run);
      }
      case 'find-missing-statements':
        return (d.length ? `<ul class="list">${d.map((m) => `
          <li><div class="grow">
            <button class="linkish" data-action="open-client" data-id="${m.clientId}">${esc(m.businessName)}</button>${sampleBadge(m)}
            <div class="why">${esc(m.contactName)} · ${stagePill(m.stage)}${m.daysWaiting !== null ? ` · waiting ${m.daysWaiting} day${m.daysWaiting === 1 ? '' : 's'}` : ''}</div>
            ${m.missingMonthLabels.length ? `<div class="why">Bank statements missing: <b>${esc(m.missingMonthLabels.join(', '))}</b></div>` : ''}
            ${m.otherMissing.length ? `<div class="why">Also missing: ${esc(m.otherMissing.join(', '))}</div>` : ''}</div>
            <div class="result-actions">
              <button class="btn small ghost" data-action="draft" data-id="${m.clientId}">Draft request</button>
              <button class="btn small ghost" data-action="mark-statements" data-id="${m.clientId}">Mark all received</button>
            </div></li>`).join('')}</ul>` : '<p>No open deals are waiting on statements.</p>') + outputsHtml(run);
      case 'summarize-client':
        return `<p><b>${esc(d.headline)}</b></p>
          <p class="small">Outstanding: ${d.outstanding.length ? esc(d.outstanding.join(', ')) : 'nothing'} · Offer: ${d.offer.confirmed ? `confirmed ${esc(d.offer.funding)}` : 'not confirmed'} · Next: ${esc(d.nextAction || '—')}</p>
          ${d.uncertainties.length ? `<ul class="warn">${d.uncertainties.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}${outputsHtml(run)}`;
      case 'review-pipeline':
        return `<p><b>${esc(run.result.summary)}</b></p>
          <table class="clients"><thead><tr><th>Stage</th><th>Deals</th><th>Confirmed funding</th></tr></thead><tbody>
          ${d.stages.map((s) => `<tr><td>${esc(s.stage)}</td><td>${s.count}</td><td>${s.confirmedFunding ? `$${s.confirmedFunding.toLocaleString()}` : '—'}</td></tr>`).join('')}</tbody></table>${outputsHtml(run)}`;
      case 'prepare-follow-up':
        return `<p>${esc(run.result.summary)}. <button class="linkish small" data-action="show-draft-run" data-id="${esc(run.id)}">Show draft</button></p>${outputsHtml(run)}`;
      default:
        return `<p>${esc(run.result ? run.result.summary : '')}</p>${outputsHtml(run)}`;
    }
  }
  function speechFor(run) {
    const d = run.result && run.result.data;
    if (run.workflowId === 'plan-my-day' && d) return d.items.length ? `You have ${d.items.length} priorities. First: ${d.items.slice(0, 3).map((i) => i.title).join('. ')}.` : 'Nothing urgent today.';
    return run.result ? run.result.summary : '';
  }

  // ---------- workflow runs ----------
  const busyWorkflows = new Set();
  function setQuickBusy() {
    const map = { plan: 'plan-my-day', missing: 'find-missing-statements', review: 'review-pipeline' };
    for (const b of $$('.quick-btn')) {
      const wf = map[b.dataset.action];
      b.disabled = Boolean(wf && busyWorkflows.has(wf));
    }
  }

  // Starts a run. A per-click requestId plus server-side de-duplication means
  // repeated clicks never start the same work twice.
  async function runWorkflow(workflowId, inputs = {}, { onUpdate, onDone, quietStart = false } = {}) {
    const key = `${workflowId}:${JSON.stringify(inputs)}`;
    if (busyWorkflows.has(key)) return null;
    busyWorkflows.add(key); busyWorkflows.add(workflowId); setQuickBusy();
    const release = () => { busyWorkflows.delete(key); busyWorkflows.delete(workflowId); setQuickBusy(); };
    try {
      const { run, duplicate } = await api('POST', `/api/workflows/${encodeURIComponent(workflowId)}/run`, { inputs, requestId: uuid() });
      if (duplicate) toast(`${run.workflowName} is already running; following that run.`);
      else if (!quietStart) toast(`${run.workflowName} started (${run.engineLabel}).`);
      trackRun(run, { onUpdate, onDone: (r) => { release(); if (onDone) onDone(r); } });
      return run;
    } catch (err) {
      release();
      throw err;
    }
  }

  let polling = false;
  function trackRun(run, { onUpdate, onDone } = {}) {
    const existing = tracked.get(run.id);
    tracked.set(run.id, { run, onUpdate: onUpdate || (existing && existing.onUpdate), onDone: onDone || (existing && existing.onDone) });
    updateJarvis();
    if (!polling) pollRuns();
  }
  async function pollRuns() {
    polling = true;
    try {
      while (tracked.size) {
        for (const [id, t] of [...tracked]) {
          let r;
          try { r = await api('GET', `/api/runs/${encodeURIComponent(id)}`, undefined, { quiet: true }); } catch { continue; }
          t.run = r;
          if (t.onUpdate) t.onUpdate(r);
          if (!ACTIVE.has(r.status)) {
            tracked.delete(id);
            runFinished(r);
            if (t.onDone) t.onDone(r);
          }
        }
        updateJarvis();
        if (tracked.size) await sleep(700);
      }
    } finally {
      polling = false;
      updateJarvis();
    }
  }
  function runFinished(r) {
    if (r.status === 'succeeded') {
      J.error = null;
      toast(`${r.workflowName}: ${r.result ? r.result.summary : 'done'}`);
    } else if (r.status !== 'cancelled') {
      J.error = `${r.workflowName} ${r.status.replace('_', ' ')}: ${r.error ? r.error.message : ''}`;
      toast(J.error, true);
    }
    refresh();
  }

  // Runs a workflow and shows progress + result in the Jarvis console.
  async function consoleRun(workflowId, inputs = {}) {
    try {
      await runWorkflow(workflowId, inputs, {
        quietStart: true,
        onUpdate: (r) => showConsole(r.workflowName, progressHtml(r)),
        onDone: (r) => {
          if (r.status === 'succeeded') {
            if (r.workflowId === 'prepare-follow-up') openDraftFromRun(r);
            showConsole(`${r.workflowName}${r.containsSamples ? ' (includes SAMPLE records)' : ''}`, resultHtml(r), speechFor(r));
          } else showConsole(r.workflowName, runFailureHtml(r));
        },
      });
    } catch (err) {
      showConsole('Could not start', `<div class="error-box">${esc(err.message)}${err.data && err.data.code === 'connection-required' ? ' <a href="#/connections">Open Connections</a>' : ''}</div>`);
    }
  }

  function pickClient(workflowId, title, engine) {
    const ranked = S.clients.slice().sort((a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'));
    showConsole(title, ranked.length ? `<p class="small muted">Pick a client.${workflowId === 'prepare-follow-up' ? ' Drafts are saved to output/ and never sent.' : ''}</p>
      <div class="picker">${ranked.map((c) => `<button class="btn" data-action="run-for-client" data-workflow="${workflowId}" data-id="${c.id}"${engine ? ` data-engine="${engine}"` : ''}>
        <span>${esc(c.businessName)}${sampleBadge(c)}<br><span class="muted small">${esc(c.stage)}${c.followUpDate ? ` · <span class="${dueClass(c.followUpDate)}">${fmtDate(c.followUpDate)}</span>` : ''}</span></span></button>`).join('')}</div>`
      : '<p>No clients yet. Add one from the Dashboard.</p>');
  }

  // ---------- draft dialog ----------
  function openDraftFromRun(run) {
    const d = run.result.data;
    currentDraft = d;
    const isAi = d.engine === 'ai';
    $('#draft-title').textContent = isAi ? 'AI Draft (not sent)' : 'Template Draft (not sent)';
    $('#draft-body').innerHTML = `
      <div class="draft-meta"><span class="badge ${isAi ? 'ai' : 'template'}">${isAi ? 'AI DRAFT' : 'TEMPLATE'}</span>${d.sample ? ' <span class="badge sample">SAMPLE</span>' : ''}<span>${esc(d.label)}</span></div>
      <div class="draft-meta"><span><b>To:</b> ${esc(d.to || '(no email on file)')}</span><span><b>Subject:</b> ${esc(d.subject)}</span><span>${d.wordCount} words</span></div>
      <div class="draft-box">${esc(d.body)}</div>
      ${d.warnings.length ? `<ul class="warn">${d.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <p class="small muted">Saved to ${fileLink(d.path)} · run <a href="#/runs?id=${esc(run.id)}">${esc(run.id)}</a></p>`;
    const dlg = $('#draft-dialog');
    if (!dlg.open) dlg.showModal();
  }
  async function copyDraft() {
    if (!currentDraft) return;
    const text = `Subject: ${currentDraft.subject}\n\n${currentDraft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Draft copied. Review it before sending from your email app.');
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('.draft-box'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      toast('Press Ctrl+C to copy the selected draft.');
    }
  }

  // ---------- routing decisions (command bar & voice) ----------
  const HELP = `<ul class="list">
    <li><code>plan my day</code> Ranked priorities, saved to today's daily note</li>
    <li><code>missing statements</code> Who still owes bank statements</li>
    <li><code>follow up derek</code> Template follow-up draft (add "with ai" to use the AI service)</li>
    <li><code>summarize maria</code> Client briefing (add "with ai" for an AI summary)</li>
    <li><code>review pipeline</code> Pipeline review (add "with claude code" for a written review)</li>
    <li><code>pipeline</code> Open the deal board · <code>find bakery</code> Search clients</li>
    <li><code>new client</code> · <code>task call Maria at 3</code> · <code>backup</code></li></ul>`;

  const decisions = new Map();
  function decisionButton(label, decision, cls = 'btn small') {
    const id = uuid();
    decisions.set(id, decision);
    return `<button class="${cls}" data-action="decision" data-decision="${id}">${esc(label)}</button>`;
  }
  async function handleDecision(d) {
    switch (d.type) {
      case 'run': {
        if (d.confirm) {
          const wf = d.workflowId.replace(/-/g, ' ');
          const who = d.inputs.clientId && client(d.inputs.clientId);
          showConsole('Confirm', `<div class="confirm-card"><p><b>${esc(wf)}</b>${who ? ` for ${esc(who.businessName)}` : ''}. ${esc(d.explanation)}</p>
            ${decisionButton('Run it', { ...d, confirm: false }, 'btn primary small')} <button class="btn small ghost" data-action="close-console">Cancel</button></div>`);
          return undefined;
        }
        return consoleRun(d.workflowId, d.inputs || {});
      }
      case 'clarify':
        return showConsole('Which one?', `<p>${esc(d.question)}</p><div class="picker">${d.options.map((o) => decisionButton(o.label, o.decision, 'btn')).join('')}</div>`);
      case 'navigate':
        go(d.view, d.focus ? `focus=${encodeURIComponent(d.focus)}` : '');
        return undefined;
      case 'search': {
        const list = d.clientIds.map(client).filter(Boolean);
        if (list.length === 1) return openClient(list[0].id);
        return showConsole(`Search: ${d.query}`, list.length ? `<ul class="list">${list.map(clientResult).join('')}</ul>` : '<p>No matching clients.</p>');
      }
      case 'action':
        if (d.action === 'help') return showConsole('Commands', HELP);
        if (d.action === 'new-client') return openClient(null);
        if (d.action === 'backup') return backup();
        if (d.action === 'add-task') {
          await api('POST', '/api/tasks', { title: d.params.title, due: S.today });
          toast('Task added for today');
          return refresh();
        }
        return undefined;
      default:
        return showConsole('Not understood', HELP);
    }
  }
  async function runCommand(text) {
    if (!text.trim()) return undefined;
    const { decision } = await api('POST', '/api/route', { text });
    return handleDecision(decision);
  }

  // ---------- voice ----------
  async function listen() {
    const p = window.BDOSVoice.get('transcription', S.voice.transcription);
    if (!p || !p.supported()) return toast('Voice is unavailable. Set it up on the Connections page.', true);
    try {
      const text = await p.listen({ onStart: () => { J.listening = true; updateJarvis(); }, onEnd: () => { J.listening = false; updateJarvis(); } });
      J.listening = false;
      updateJarvis();
      if (!text) return undefined;
      $('#command-input').value = text;
      if (!S.voice.verified || !S.voice.verified.transcription) api('POST', '/api/connections/voice/verified', { kind: 'transcription' }, { quiet: true }).catch(() => {});
      return runCommand(text);
    } catch (err) {
      J.listening = false;
      J.error = `Voice: ${err.message}`;
      updateJarvis();
      return undefined;
    }
  }
  async function speak(text) {
    const p = window.BDOSVoice.get('speech', S.voice.speech);
    if (!p || !p.supported()) return toast('Voice output is unavailable. Set it up on the Connections page.', true);
    try {
      await p.speak(text, { onStart: () => { J.speaking = true; updateJarvis(); }, onEnd: () => { J.speaking = false; updateJarvis(); } });
      if (!S.voice.verified || !S.voice.verified.speech) api('POST', '/api/connections/voice/verified', { kind: 'speech' }, { quiet: true }).catch(() => {});
      return true;
    } catch (err) {
      J.speaking = false;
      J.error = `Voice: ${err.message}`;
      updateJarvis();
      return false;
    }
  }

  // ---------- client editor ----------
  function setField(form, name, value) {
    const el = form.elements[name];
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value ?? '';
  }
  function lastMonths(n) {
    const [y, m] = S.today.split('-').map(Number);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(y, m - 1 - (n - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
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
      : { id: null, rev: null, docs: [...lastMonths(4).map((month) => ({ kind: 'bank-statement', month, received: false, requestedAt: S.today })), { name: 'Signed application', kind: 'document', received: false, requestedAt: S.today }] };
    $('#client-dialog-title').innerHTML = c ? `${esc(c.businessName)}${sampleBadge(c)}` : 'New client';
    const values = c || { stage: S.stages[0], lastContact: S.today, nextAction: 'Request bank statements', offer: {} };
    for (const k of ['contactName', 'businessName', 'email', 'phone', 'stage', 'lastContact', 'followUpDate', 'nextAction']) setField(form, k, values[k]);
    for (const [k, v] of Object.entries(values.offer || {})) setField(form, `offer.${k}`, v);
    $('#sample-check-wrap').hidden = Boolean(c);
    $('#delete-client').hidden = !c;
    $('#dialog-followup').hidden = !c;
    $('#dialog-summarize').hidden = !c;
    $('#new-month').value = '';
    renderDocs();
    renderNotes(c);
    $('#client-dialog').showModal();
    form.elements.contactName.focus();
    return undefined;
  }
  function renderDocs() {
    const sorted = editing.docs.map((d, i) => ({ d, i })).sort((a, b) => (a.d.month || 'z').localeCompare(b.d.month || 'z'));
    $('#doc-list').innerHTML = sorted.length ? sorted.map(({ d, i }) => `
      <li class="${d.received ? '' : 'missing'}">
        <label><input type="checkbox" data-action="toggle-doc" data-i="${i}" ${d.received ? 'checked' : ''}> ${esc(docLabel(d))}</label>
        <span class="state">${d.received ? `Received${d.receivedAt ? ` ${fmtDate(d.receivedAt)}` : ''}` : `Outstanding${d.requestedAt ? ` since ${fmtDate(d.requestedAt)}` : ''}`}</span>
        <button class="icon-btn" type="button" data-action="remove-doc" data-i="${i}" aria-label="Remove ${esc(docLabel(d))}">✕</button>
      </li>`).join('') : '<li class="muted small">No documents requested.</li>';
  }
  function addMonth(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return toast('Pick a month first', true);
    if (editing.docs.some((d) => d.month === month)) return toast(`${monthName(month)} is already on the list`);
    editing.docs.push({ kind: 'bank-statement', month, received: false, requestedAt: S.today });
    renderDocs();
    return undefined;
  }
  function renderNotes(c) {
    const notes = c ? c.notes : [];
    $('#note-list').innerHTML = notes.length ? notes.map((n) => `<li><time>${esc(fmtTime(n.at))}</time><p>${esc(n.text)}</p></li>`).join('')
      : `<li class="empty">${c ? 'No notes yet.' : 'A note typed above is saved when you save the client.'}</li>`;
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
    if (!isEdit && $('#client-form').elements.sample.checked) body.sample = true;
    btn.disabled = true;
    try {
      const saved = isEdit
        ? (await api('PATCH', `/api/clients/${editing.id}`, { ...body, rev: editing.rev })).client
        : (await api('POST', '/api/clients', body)).client;
      const note = $('#new-note').value.trim();
      if (note) await api('POST', `/api/clients/${saved.id}/notes`, { text: note });
      $('#client-dialog').close();
      toast(isEdit ? `Saved ${saved.businessName}` : `Added ${saved.businessName}${saved.sample ? ' (SAMPLE)' : ''}`);
      await refresh();
    } catch (err) {
      formError(err.message, err.status === 409);
    } finally {
      btn.disabled = false;
    }
    return undefined;
  }
  async function addNote() {
    const text = $('#new-note').value.trim();
    if (!text) return;
    if (!editing.id) { toast('The note will be saved when you save the client'); return; }
    try {
      const { client: c } = await api('POST', `/api/clients/${editing.id}/notes`, { text });
      editing.rev = c.rev; // notes don't touch form fields, so keep editing
      $('#new-note').value = '';
      await refresh();
      renderNotes(client(c.id));
      toast('Note saved');
    } catch (err) { formError(err.message); }
  }

  // ---------- record actions ----------
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
    const docs = c.requestedDocs.map((d) => ((d.kind === 'bank-statement' || /statement/i.test(d.name)) && !d.received ? { ...d, received: true, receivedAt: S.today } : d));
    try {
      await api('PATCH', `/api/clients/${id}`, { requestedDocs: docs, rev: c.rev });
      toast(`Statements marked received for ${c.businessName}`);
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

  const actions = {
    plan: () => consoleRun('plan-my-day'),
    missing: () => consoleRun('find-missing-statements'),
    review: () => consoleRun('review-pipeline'),
    pipeline: () => go('dashboard', 'focus=pipeline'),
    followup: () => pickClient('prepare-follow-up', 'Prepare Follow-Up'),
    summarize: () => pickClient('summarize-client', 'Summarize Client'),
    'run-for-client': (el) => consoleRun(el.dataset.workflow, { clientId: el.dataset.id, ...(el.dataset.engine ? { engine: el.dataset.engine } : {}) }),
    draft: (el) => { $('#draft-dialog').close(); return consoleRun('prepare-follow-up', { clientId: el.dataset.id }); },
    'summarize-client': (el) => consoleRun('summarize-client', { clientId: el.dataset.id }),
    'show-draft-run': async (el) => { openDraftFromRun(await api('GET', `/api/runs/${encodeURIComponent(el.dataset.id)}`)); },
    decision: (el) => { const d = decisions.get(el.dataset.decision); return d ? handleDecision(d) : undefined; },
    'close-console': () => { $('#console').hidden = true; },
    'dismiss-error': () => { J.error = null; updateJarvis(); },
    listen: () => listen(),
    'speak-console': () => speak(lastConsoleSpeech),
    'new-client': () => openClient(null),
    'open-client': (el) => { $('#draft-dialog').close(); openClient(el.dataset.id); },
    'dialog-followup': () => { const id = editing.id; $('#client-dialog').close(); return consoleRun('prepare-follow-up', { clientId: id }); },
    'dialog-summarize': () => { const id = editing.id; $('#client-dialog').close(); return consoleRun('summarize-client', { clientId: id }); },
    'close-dialog': () => $('#client-dialog').close(),
    'close-draft': () => $('#draft-dialog').close(),
    'copy-draft': copyDraft,
    'open-draft-file': () => { if (currentDraft) { $('#draft-dialog').close(); go('knowledge', `path=${encodeURIComponent(currentDraft.path)}`); } },
    move: (el) => moveClient(el.dataset.id, Number(el.dataset.dir)),
    'delete-task': async (el) => {
      const t = S.tasks.find((x) => x.id === el.dataset.id);
      if (!confirm(`Delete task "${t.title}"?`)) return;
      try { await api('DELETE', `/api/tasks/${t.id}`, { rev: t.rev }); } catch (err) { toast(err.message, true); }
      refresh();
    },
    'add-month': () => addMonth($('#new-month').value),
    'add-last-months': (el) => {
      for (const ym of lastMonths(Number(el.dataset.n))) {
        if (!editing.docs.some((x) => x.month === ym)) editing.docs.push({ kind: 'bank-statement', month: ym, received: false, requestedAt: S.today });
      }
      renderDocs();
    },
    'add-doc': () => {
      const input = $('#new-doc');
      const name = input.value.trim();
      if (!name) return;
      editing.docs.push({ name, kind: /statement/i.test(name) ? 'bank-statement' : 'document', received: false, requestedAt: S.today });
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
        toast(`Deleted ${c.businessName}`);
        refresh();
      } catch (err) { formError(err.message, err.status === 409); }
    },
    'mark-statements': (el) => markStatementsReceived(el.dataset.id),
    backup,
    'load-samples': async () => { try { await api('POST', '/api/samples'); toast('Sample records loaded'); } catch (err) { toast(err.message, true); } refresh(); },
    'remove-samples': async () => {
      if (!confirm('Remove all SAMPLE records? Real clients are not affected. Sample files already in output/ stay there, labelled SAMPLE.')) return;
      try { const r = await api('DELETE', '/api/samples'); toast(`Removed ${r.removed} sample client(s)`); } catch (err) { toast(err.message, true); }
      refresh();
    },
  };

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.matches('input[type="checkbox"]')) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); Promise.resolve(fn(el)).catch((err) => toast(err.message, true)); }
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
  $('#new-month').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); actions['add-month'](); } });
  $('#client-dialog').addEventListener('close', () => { editing = null; });
  $('#jarvis-search').addEventListener('input', renderSearch);
  $('#client-filter').addEventListener('input', renderClientTable);
  $('#stage-filter').addEventListener('change', renderClientTable);
  $('#show-samples').addEventListener('change', render);
  $('#show-done').addEventListener('change', renderTasks);
  window.addEventListener('hashchange', showView);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, select, dialog')) { e.preventDefault(); go('jarvis'); $('#command-input').focus(); }
  });
  window.addEventListener('focus', () => { if (!document.querySelector('dialog[open]')) refresh(); });

  // Shared with pages.js
  window.BDOS = {
    api, esc, toast, refresh, go, fmtDate, fmtTime, ago, uuid, sampleBadge, stagePill, clientOptions,
    runWorkflow, trackRun, handleDecision, openClient, speak, updateJarvis, runFailureHtml, outputsHtml, resultHtml, openDraftFromRun,
    state: () => S, isTracking: (id) => tracked.has(id), J, pages: {},
  };

  updateJarvis();
  refresh().then(showView);
})();
