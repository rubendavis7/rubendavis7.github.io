// BenDavid OS pages: Workflows, Run History, Knowledge, Connections.
(function () {
  'use strict';
  const B = window.BDOS;
  const { esc, api, toast } = B;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ACTIVE = new Set(['queued', 'running']);
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const statusChip = (s, label) => `<span class="status ${esc(s)}">${esc(label || s.replace('_', ' '))}</span>`;
  const duration = (ms) => (ms === null || ms === undefined ? '—' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
  const fileLink = (p, label) => `<a href="#/knowledge?path=${encodeURIComponent(p)}">${esc(label || p)}</a>`;

  // ======================= WORKFLOWS =======================
  let WF = [];
  let wfSignature = '';
  const wfRuns = new Map(); // workflowId -> latest run started from its card

  function inputHtml(w, i) {
    const id = `wf-${w.id}-${i.name}`;
    if (i.type === 'client') {
      return `<label for="${id}">${esc(i.label)}${i.required ? ' *' : ''}
        <select id="${id}" name="${esc(i.name)}"><option value="">${i.required ? '— choose a client —' : 'All open deals'}</option>${B.clientOptions()}</select>
        ${i.help ? `<span class="small muted">${esc(i.help)}</span>` : ''}</label>`;
    }
    if (i.type === 'boolean') {
      return `<label class="check"><input type="checkbox" name="${esc(i.name)}" ${i.default ? 'checked' : ''}> ${esc(i.label)}${i.help ? ` <span class="small muted">(${esc(i.help)})</span>` : ''}</label>`;
    }
    if (i.type === 'date') {
      return `<label for="${id}">${esc(i.label)}<input id="${id}" type="date" name="${esc(i.name)}" value="${esc(B.state().today)}">${i.help ? `<span class="small muted">${esc(i.help)}</span>` : ''}</label>`;
    }
    return '';
  }

  function scheduleHtml(w) {
    const s = w.schedule;
    if (!w.schedulable || !s) return '<div class="schedule-row">Not schedulable: needs a choice from you each time.</div>';
    return `<form class="schedule-row" data-schedule="${esc(w.id)}">
      <span><b>Schedule</b> (${esc(B.state().timezone)}): ${s.enabled ? statusChip('enabled', 'On') : statusChip('disabled', 'Off')}</span>
      <label class="sr-only" for="sch-${w.id}">Time</label><input id="sch-${w.id}" type="time" name="time" value="${esc(s.time)}">
      <span class="days">${DAYS.map((d) => `<label><input type="checkbox" name="day" value="${d}" ${s.days.includes(d) ? 'checked' : ''}>${d.slice(0, 2)}</label>`).join('')}</span>
      <button class="btn small" type="submit" name="op" value="${s.enabled ? 'off' : 'on'}">${s.enabled ? 'Turn off' : 'Turn on'}</button>
      <button class="btn small ghost" type="submit" name="op" value="save">Save time</button>
      <span class="small muted">Saved-data engine only. Runs only while this computer is on and BenDavid OS is open.${s.lastFiredAt ? ` Last fired ${esc(B.fmtTime(s.lastFiredAt))}: ${esc(s.lastResult || '')}.` : ' Has never run unattended.'}</span>
    </form>`;
  }

  function wfCard(w) {
    const uses = [...new Set(w.engines.map((e) => e.uses))];
    return `<article class="panel wf-card" id="wf-${esc(w.id)}">
      <header><h3>${esc(w.name)}</h3><span>${uses.map((u) => `<span class="route-tag ${esc(u)}">${esc(w.engines.find((e) => e.uses === u).usesLabel)}</span>`).join(' ')}</span></header>
      <p class="desc">${esc(w.description)}</p>
      <form class="wf-form" data-workflow="${esc(w.id)}">
        ${w.inputs.map((i) => inputHtml(w, i)).join('')}
        <fieldset class="engine-list"><legend>Engine</legend>
          ${w.engines.map((e) => `<label class="engine-opt${e.available ? '' : ' unavailable'}">
            <input type="radio" name="engine" value="${esc(e.id)}" ${e.id === w.defaultEngine ? 'checked' : ''} ${e.available ? '' : 'disabled'}>
            <span><span class="route-tag ${esc(e.uses)}">${esc(e.usesLabel)}</span> <b>${esc(e.label)}</b>
              <span class="why">${esc(e.routeLabel)} · limit ${e.timeoutSec}s${e.note ? ` · ${esc(e.note)}` : ''}</span>
              ${e.available ? '' : `<span class="why">Unavailable: ${esc(e.unavailableReason)}. <a href="#/connections">Set up on Connections</a></span>`}</span>
          </label>`).join('')}
        </fieldset>
        <div class="wf-run-row"><button class="btn primary" type="submit">Run</button><span class="small muted">${esc(w.outputFormat)}</span></div>
      </form>
      <div class="wf-status" id="wf-status-${esc(w.id)}" aria-live="polite"></div>
      <details class="wf-details"><summary>Inputs, connections, allowed actions, output, and errors</summary>
        <dl>
          <dt>Inputs</dt><dd>${w.inputs.length ? `<ul>${w.inputs.map((i) => `<li>${esc(i.label)} (${esc(i.type)}${i.required ? ', required' : ', optional'})${i.help ? `: ${esc(i.help)}` : ''}</li>`).join('')}</ul>` : 'None'}</dd>
          <dt>Connections</dt><dd><ul>${w.engines.map((e) => `<li>${esc(e.label)}: ${e.requires.length ? e.requires.map((r) => `${esc(r.name)} (${esc(r.label)})`).join(', ') : 'none needed'}</li>`).join('')}</ul></dd>
          <dt>Allowed actions</dt><dd><ul>${w.allowedActions.map((a) => `<li>${esc(a.label)}</li>`).join('')}</ul></dd>
          <dt>Output</dt><dd>${esc(w.outputFormat)}</dd>
          <dt>If it fails</dt><dd><ul>${w.errorBehavior.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></dd>
        </dl>
      </details>
      ${scheduleHtml(w)}
    </article>`;
  }

  function wfStatusHtml(r) {
    if (!r) return '';
    if (ACTIVE.has(r.status)) {
      return `<div class="wf-progress">${statusChip(r.status)} <code>${esc(r.id)}</code> ${r.status === 'running' ? `<button class="btn small ghost" data-action="cancel-run" data-id="${esc(r.id)}">Cancel</button>` : ''}
        <ol>${r.progress.slice(-5).map((p) => `<li>${esc(p.message)}</li>`).join('')}</ol></div>`;
    }
    if (r.status === 'succeeded') {
      return `<div class="wf-progress">${statusChip('succeeded')} ${esc(r.result ? r.result.summary : '')} · <a href="#/runs?id=${esc(r.id)}">details</a>
        ${r.workflowId === 'prepare-follow-up' ? ` · <button class="linkish small" data-action="show-draft-run" data-id="${esc(r.id)}">Show draft</button>` : ''}${B.outputsHtml(r)}</div>`;
    }
    return B.runFailureHtml(r);
  }

  function collectForm(form) {
    const inputs = {};
    for (const el of form.elements) {
      if (!el.name || el.type === 'submit') continue;
      if (el.type === 'radio') { if (el.checked) inputs[el.name] = el.value; continue; }
      if (el.type === 'checkbox') { inputs[el.name] = el.checked; continue; }
      if (el.value !== '') inputs[el.name] = el.value;
    }
    return inputs;
  }

  async function renderWorkflows(force = false) {
    const fresh = await api('GET', '/api/workflows', undefined, { quiet: true });
    const sig = JSON.stringify(fresh) + JSON.stringify(B.state().clients.map((c) => [c.id, c.businessName]));
    if (!force && sig === wfSignature) return;
    // Keep what the user already picked in each form.
    const saved = {};
    for (const f of $$('.wf-form')) saved[f.dataset.workflow] = collectForm(f);
    WF = fresh;
    wfSignature = sig;
    $('#wf-grid').innerHTML = WF.map(wfCard).join('');
    for (const [id, inputs] of Object.entries(saved)) {
      const f = $(`.wf-form[data-workflow="${CSS.escape(id)}"]`);
      if (!f) continue;
      for (const [k, v] of Object.entries(inputs)) {
        const els = f.querySelectorAll(`[name="${CSS.escape(k)}"]`);
        for (const el of els) {
          if (el.type === 'radio') { if (el.value === v && !el.disabled) el.checked = true; } else if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = v;
        }
      }
    }
    for (const [id, r] of wfRuns) { const box = $(`#wf-status-${CSS.escape(id)}`); if (box) box.innerHTML = wfStatusHtml(r); }
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('.wf-form');
    if (form) {
      e.preventDefault();
      const w = WF.find((x) => x.id === form.dataset.workflow);
      const inputs = collectForm(form);
      const missing = w.inputs.find((i) => i.required && !inputs[i.name]);
      if (missing) return toast(`${missing.label} is required for ${w.name}`, true);
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const box = $(`#wf-status-${CSS.escape(w.id)}`);
      try {
        await B.runWorkflow(w.id, inputs, {
          onUpdate: (r) => { wfRuns.set(w.id, r); box.innerHTML = wfStatusHtml(r); },
          onDone: (r) => {
            wfRuns.set(w.id, r);
            box.innerHTML = wfStatusHtml(r);
            btn.disabled = false;
            if (r.status === 'succeeded' && r.workflowId === 'prepare-follow-up') B.openDraftFromRun(r);
          },
        });
      } catch (err) {
        btn.disabled = false;
        box.innerHTML = `<div class="error-box">${esc(err.message)}${err.data && err.data.code === 'connection-required' ? ' <a href="#/connections">Open Connections</a>' : ''}</div>`;
      }
      return undefined;
    }
    const sch = e.target.closest('form[data-schedule]');
    if (sch) {
      e.preventDefault();
      const id = sch.dataset.schedule;
      const op = e.submitter ? e.submitter.value : 'save';
      const days = [...sch.querySelectorAll('input[name="day"]:checked')].map((x) => x.value);
      const body = { time: sch.elements.time.value, days };
      if (op === 'on') {
        const w = WF.find((x) => x.id === id);
        if (!confirm(`Turn on the schedule for ${w.name} at ${body.time} (${B.state().timezone}) on ${days.join(', ')}?\n\nIt runs with saved data only, and only while this computer is on and BenDavid OS is running. Unattended operation stays unconfirmed until a scheduled run actually happens.`)) return undefined;
        body.enabled = true;
      }
      if (op === 'off') body.enabled = false;
      try {
        await api('PUT', `/api/schedules/${encodeURIComponent(id)}`, body);
        toast(op === 'on' ? 'Schedule on' : op === 'off' ? 'Schedule off' : 'Schedule saved');
        await renderWorkflows(true);
        B.refresh();
      } catch (err) { toast(err.message, true); }
    }
    return undefined;
  });

  // ======================= RUN HISTORY =======================
  let runsTimer = null;
  let selectedRun = null;

  async function renderRuns() {
    const status = $('#run-filter-status').value;
    const wf = $('#run-filter-workflow').value;
    const runs = await api('GET', `/api/runs?limit=200${status ? `&status=${encodeURIComponent(status)}` : ''}${wf ? `&workflow=${encodeURIComponent(wf)}` : ''}`, undefined, { quiet: true });
    const sel = $('#run-filter-workflow');
    if (sel.options.length === 1) {
      const wfs = WF.length ? WF : await api('GET', '/api/workflows', undefined, { quiet: true });
      sel.insertAdjacentHTML('beforeend', wfs.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join(''));
    }
    $('#run-rows').innerHTML = runs.length ? runs.map((r) => `
      <tr data-run="${esc(r.id)}" class="${r.id === selectedRun ? 'selected' : ''}" tabindex="0">
        <td>${esc(B.fmtTime(r.startedAt || r.createdAt))}<div class="sub"><code>${esc(r.id)}</code></div></td>
        <td>${esc(r.workflowName)}${B.sampleBadge(r)}</td>
        <td><span class="route-tag ${esc(r.uses)}">${esc(r.engineLabel)}</span></td>
        <td>${esc(r.trigger)}<div class="sub">${esc(r.client)}</div></td>
        <td>${statusChip(r.status)}</td>
        <td>${duration(r.durationMs)}</td>
        <td>${r.outputs.length ? r.outputs.map((o) => fileLink(o.path, o.path.split('/').pop())).join('<br>') : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="muted">No runs yet. Start one from Workflows or the Jarvis buttons.</td></tr>';
    clearTimeout(runsTimer);
    if (runs.some((r) => ACTIVE.has(r.status)) && !$('#view-runs').hidden) runsTimer = setTimeout(() => { renderRuns(); if (selectedRun) showRun(selectedRun); }, 1500);
  }

  async function showRun(id) {
    selectedRun = id;
    let r;
    try { r = await api('GET', `/api/runs/${encodeURIComponent(id)}`, undefined, { quiet: true }); } catch (err) { toast(err.message, true); return; }
    for (const tr of $$('#run-rows tr')) tr.classList.toggle('selected', tr.dataset.run === id);
    const panel = $('#run-detail');
    const inputs = Object.entries(r.inputs).map(([k, v]) => {
      if (k === 'clientId' && v) { const c = B.state().clients.find((x) => x.id === v); return `client: ${c ? c.businessName : v}`; }
      return `${k}: ${v}`;
    });
    const rep = r.reported;
    panel.innerHTML = `
      <header><h2>${esc(r.workflowName)} · <code>${esc(r.id)}</code></h2>
        <div class="page-actions">${ACTIVE.has(r.status) ? `<button class="btn small danger" data-action="cancel-run" data-id="${esc(r.id)}">Cancel run</button>` : `<button class="btn small" data-action="rerun" data-id="${esc(r.id)}">Run again</button>`}</div></header>
      <dl>
        <dt>Status</dt><dd>${statusChip(r.status)}${r.containsSamples ? ' <span class="badge sample">SAMPLE</span>' : ''}</dd>
        <dt>Workflow</dt><dd>${esc(r.workflowName)} (<code>${esc(r.workflowId)}</code>) · workspace ${esc(r.workspaceId)}</dd>
        <dt>Engine</dt><dd><span class="route-tag ${esc(r.uses)}">${esc(r.engineLabel)}</span> · route: ${esc(r.route)}</dd>
        <dt>Inputs</dt><dd>${esc(inputs.join(' · ') || 'none')}</dd>
        <dt>Started by</dt><dd>${esc(r.trigger)} from ${esc(r.client)}</dd>
        <dt>Queued</dt><dd>${esc(B.fmtTime(r.createdAt))}</dd>
        <dt>Started</dt><dd>${esc(B.fmtTime(r.startedAt))}</dd>
        <dt>Finished</dt><dd>${esc(B.fmtTime(r.finishedAt))} · ${duration(r.durationMs)} (limit ${Math.round(r.timeoutMs / 1000)}s)</dd>
        <dt>Sources</dt><dd>${r.sources.length ? `<ul>${r.sources.map((s) => `<li>${s.path ? fileLink(s.path, s.label) : esc(s.label)} <code>${esc(s.ref)}</code></li>`).join('')}</ul>` : '—'}</dd>
        <dt>Output</dt><dd>${r.outputs.length ? `<ul>${r.outputs.map((o) => `<li>${fileLink(o.path)}${o.note ? ` (${esc(o.note)})` : ''}</li>`).join('')}</ul>` : '—'}</dd>
        ${r.workDir ? `<dt>Run folder</dt><dd><code>data/${esc(r.workDir)}</code></dd>` : ''}
        ${rep ? `<dt>Reported by ${esc(rep.provider)}</dt><dd>${esc([
          rep.servedBy && `model: ${rep.servedBy}`, rep.version && `version ${rep.version}`,
          rep.usage && rep.usage.input_tokens !== undefined && `${rep.usage.input_tokens} input / ${rep.usage.output_tokens} output tokens`,
          rep.num_turns !== undefined && `${rep.num_turns} turn(s)`, rep.total_cost_usd !== undefined && `cost reported: $${Number(rep.total_cost_usd).toFixed(4)}`,
          rep.permission_denials ? `${rep.permission_denials} permission denial(s)` : null,
        ].filter(Boolean).join(' · ') || 'nothing reported')}</dd>` : '<dt>AI usage</dt><dd>None (no AI service was called)</dd>'}
        <dt>Progress</dt><dd><ol>${r.progress.map((p) => `<li><span class="muted small">${esc(B.fmtTime(p.at))}</span> ${esc(p.message)}</li>`).join('')}</ol></dd>
        ${r.warnings && r.warnings.length ? `<dt>Warnings</dt><dd><ul class="warn">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></dd>` : ''}
      </dl>
      ${r.error ? `<div class="error-box"><b>${esc(r.error.code)}</b>: ${esc(r.error.message)}${r.error.detail ? `<pre>${esc(r.error.detail)}</pre>` : ''}</div>` : ''}`;
    panel.hidden = false;
  }

  $('#run-rows').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-run]');
    if (tr) B.go('runs', `id=${encodeURIComponent(tr.dataset.run)}`);
  });
  $('#run-rows').addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-run]');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); B.go('runs', `id=${encodeURIComponent(tr.dataset.run)}`); }
  });
  $('#run-filter-status').addEventListener('change', renderRuns);
  $('#run-filter-workflow').addEventListener('change', renderRuns);

  // ======================= KNOWLEDGE =======================
  let KN = { files: [] };
  let currentFile = null;
  const SECTION_TITLES = { raw: 'Raw inputs', wiki: 'Wiki', output: 'Output', 'daily-notes': 'Daily notes', projects: 'Projects', system: 'System', root: 'Vault root' };
  const openSections = new Set(['system']);

  function resolver() {
    const byPath = new Map();
    const byBase = new Map();
    for (const f of KN.files) {
      const noExt = f.path.replace(/\.md$/, '');
      byPath.set(noExt.toLowerCase(), f.path);
      byPath.set(f.path.toLowerCase(), f.path);
      const base = noExt.split('/').pop().toLowerCase();
      if (!byBase.has(base)) byBase.set(base, f.path);
    }
    return (target) => {
      const t = String(target).split('#')[0].trim().replace(/^\.?\//, '').replace(/\.md$/, '').toLowerCase();
      return byPath.get(t) || byPath.get(`${t}.md`) || byBase.get(t.split('/').pop()) || null;
    };
  }

  function renderTree() {
    const q = $('#kn-filter').value.trim().toLowerCase();
    const files = KN.files.filter((f) => !q || f.path.toLowerCase().includes(q) || String(f.title || '').toLowerCase().includes(q));
    const order = ['system', 'projects', 'daily-notes', 'raw', 'wiki', 'output', 'root'];
    const html = [`<div class="kn-section"><ul class="kn-files"><li><button data-open="index.md" ${currentFile === 'index.md' ? 'aria-current="true"' : ''}>★ Master index</button></li></ul></div>`];
    for (const sec of order) {
      const list = files.filter((f) => f.section === sec && f.path !== 'index.md');
      if (!list.length) continue;
      const open = q || openSections.has(sec) || (currentFile && currentFile.startsWith(`${sec}/`));
      const groups = {};
      for (const f of list) {
        const dir = f.path.split('/').slice(1, -1).join('/');
        (groups[dir] ||= []).push(f);
      }
      html.push(`<div class="kn-section"><button data-toggle-section="${sec}" aria-expanded="${open ? 'true' : 'false'}">${esc(SECTION_TITLES[sec] || sec)} <span class="n">${list.length}</span></button>
        ${open ? `<ul class="kn-files">${Object.keys(groups).sort().map((g) => `${g ? `<li class="folder">${esc(g)}</li>` : ''}${groups[g].sort((a, b) => (a.name === 'index.md' ? -1 : b.name === 'index.md' ? 1 : b.name.localeCompare(a.name))).map((f) => `<li><button data-open="${esc(f.path)}" ${f.path === currentFile ? 'aria-current="true"' : ''} title="${esc(f.path)}">${f.name === 'index.md' ? '☰ Topic index' : esc(f.title || f.name)}${f.sample ? ' · SAMPLE' : ''}</button></li>`).join('')}`).join('')}</ul>` : ''}</div>`);
    }
    $('#kn-tree').innerHTML = html.join('');
  }

  async function loadKnowledge() {
    KN = await api('GET', '/api/knowledge', undefined, { quiet: true });
    $('#vault-path').textContent = `Vault folder: ${KN.dir} · ${KN.files.length} files · open it in Obsidian with "Open folder as vault".`;
    renderTree();
  }

  function provenanceHtml(fm, file) {
    const rows = [];
    const add = (k, v) => { if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) rows.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`); };
    add('Type', esc(fm.type || ''));
    add('Generated', fm.generated_at ? `${esc(B.fmtTime(fm.generated_at))} by ${esc(fm.generated_by || 'BenDavid OS')} with ${esc(fm.generated_with || '?')}` : '');
    add('Run', fm.run_id ? `<a href="#/runs?id=${esc(fm.run_id)}">${esc(fm.run_id)}</a>` : '');
    add('Record', fm.record_id ? `<code>${esc(fm.record_id)}</code> rev ${esc(fm.record_rev)}${fm.record_updated_at ? `, updated ${esc(B.fmtTime(fm.record_updated_at))}` : ''}` : '');
    add('Sources', Array.isArray(fm.sources) ? `<ul>${fm.sources.map((s) => `<li><code>${esc(s)}</code></li>`).join('')}</ul>` : '');
    add('Uncertainties', Array.isArray(fm.uncertainties) ? `<ul>${fm.uncertainties.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : '');
    add('Imported', fm.imported_at ? `${esc(B.fmtTime(fm.imported_at))} via ${esc(fm.imported_via || '?')}` : '');
    add('Content hash', fm.content_sha256 ? `<code>${esc(String(fm.content_sha256).slice(0, 16))}…</code>` : '');
    add('Treat as', esc(fm.treat_as || ''));
    add('Draft status', esc(fm.draft_status || ''));
    if (file.readOnly) add('File', 'Read-only original');
    return rows.length ? `<div class="provenance"><dl>${rows.join('')}</dl></div>` : '';
  }

  async function openFile(rel) {
    currentFile = rel;
    renderTree();
    const view = $('#kn-view');
    let f;
    try { f = await api('GET', `/api/knowledge/file?path=${encodeURIComponent(rel)}`, undefined, { quiet: true }); } catch (err) {
      view.innerHTML = `<div class="error-box">${esc(err.message)}: <code>${esc(rel)}</code></div>`;
      return;
    }
    const fm = f.frontmatter || {};
    const sep = KN.dir.includes('\\') ? '\\' : '/';
    const abs = `${KN.dir}${sep}${rel.split('/').join(sep)}`;
    const badges = [];
    if (fm.contains_sample_records === true) badges.push('<span class="badge sample">SAMPLE</span>');
    if (f.generatedState === 'pristine') badges.push('<span class="badge neutral">Generated by BenDavid OS</span>');
    if (f.generatedState === 'edited') badges.push('<span class="badge p2">Edited by hand: not overwritten</span>');
    if (fm.type === 'raw-input' || f.readOnly) badges.push('<span class="badge neutral">Original input · data only</span>');
    if (/template/i.test(fm.generated_with || '') && fm.type === 'follow-up-draft') badges.push('<span class="badge template">TEMPLATE DRAFT</span>');
    if (/Anthropic API/.test(fm.generated_with || '')) badges.push('<span class="badge ai">AI-GENERATED</span>');
    view.innerHTML = `
      <div class="kn-head"><div><code>${esc(rel)}</code> ${badges.join(' ')}</div>
        <div class="page-actions"><a class="btn small ghost" href="obsidian://open?path=${encodeURIComponent(abs)}">Open in Obsidian</a>
        ${f.binary ? `<a class="btn small" href="/api/knowledge/download?path=${encodeURIComponent(rel)}">Download original</a>` : ''}</div></div>
      ${provenanceHtml(fm, f)}
      ${f.binary ? `<p class="muted">This file is not shown here (${Math.round(f.size / 1024)} KB, ${esc(f.ext)}). It is stored unchanged.</p>`
        : f.ext === '.md' ? `<div class="md">${window.BDOSMarkdown.render(f.body, { resolve: resolver() })}</div>` : `<pre class="md">${esc(f.body)}</pre>`}`;
  }

  $('#kn-tree').addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle-section]');
    if (t) { const s = t.dataset.toggleSection; if (openSections.has(s)) openSections.delete(s); else openSections.add(s); renderTree(); return; }
    const o = e.target.closest('[data-open]');
    if (o) B.go('knowledge', `path=${encodeURIComponent(o.dataset.open)}`);
  });
  $('#kn-view').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-open]');
    if (a) { e.preventDefault(); B.go('knowledge', `path=${encodeURIComponent(a.dataset.open)}`); }
  });
  $('#kn-filter').addEventListener('input', renderTree);

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'open-import') {
      const f = $('#import-form');
      f.reset();
      $('#import-error').hidden = true;
      $('#import-client').innerHTML = `<option value="">None</option>${B.clientOptions()}`;
      $('#import-dialog').showModal();
    } else if (a === 'close-import') {
      $('#import-dialog').close();
    } else if (a === 'reindex') {
      try { await api('POST', '/api/knowledge/reindex'); toast('Indexes rebuilt'); await loadKnowledge(); if (currentFile) openFile(currentFile); } catch (err) { toast(err.message, true); }
    } else if (a === 'cancel-run') {
      try { await api('POST', `/api/runs/${encodeURIComponent(el.dataset.id)}/cancel`); toast('Cancel requested'); } catch (err) { toast(err.message, true); }
      if (!$('#view-runs').hidden) { renderRuns(); showRun(el.dataset.id); }
    } else if (a === 'rerun') {
      try {
        const r = await api('GET', `/api/runs/${encodeURIComponent(el.dataset.id)}`, undefined, { quiet: true });
        const run = await B.runWorkflow(r.workflowId, r.inputs, { onDone: () => renderRuns() });
        if (run) B.go('runs', `id=${encodeURIComponent(run.id)}`);
      } catch (err) { toast(err.message, true); }
    } else if (a === 'self-test') {
      const msg = el.dataset.id === 'light-model'
        ? 'Run the AI service self-test?\n\nIt checks that your model is available to your key and makes one small API call billed to your Anthropic account.'
        : 'Run the Claude Code self-test?\n\nIt starts Claude Code once with a tiny prompt and uses a small amount of your Claude plan.';
      if (!confirm(msg)) return;
      el.disabled = true;
      el.textContent = 'Testing…';
      try {
        const s = await api('POST', `/api/connections/${encodeURIComponent(el.dataset.id)}/test`);
        toast(`${s.name}: ${s.label}`, s.state !== 'verified');
      } catch (err) { toast(err.message, true); }
      await renderConnections();
      B.refresh();
    } else if (a === 'voice-test') {
      const kind = el.dataset.kind;
      if (kind === 'speech') {
        if (await B.speak('BenDavid OS voice check. This is a local voice on your computer.')) toast('Voice output worked and is now verified.');
      } else {
        toast('Say "plan my day" after you allow the microphone.');
        B.go('jarvis');
        document.getElementById('mic-btn').click();
      }
      setTimeout(() => { renderConnections(); B.refresh(); }, 800);
    }
  });

  $('#import-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = $('#import-error');
    err.hidden = true;
    const file = f.elements.file.files[0];
    try {
      let res;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.');
        const r = await fetch('/api/knowledge/raw-file', {
          method: 'POST',
          headers: { 'X-BenDavid-OS': '1', 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name), 'X-Kind': f.elements.kind.value, ...(f.elements.clientId.value ? { 'X-Client-Id': f.elements.clientId.value } : {}) },
          body: file,
        });
        res = await r.json();
        if (!r.ok) throw new Error(res.error || 'Upload failed');
      } else {
        if (!f.elements.content.value.trim()) throw new Error('Paste some text or choose a file.');
        res = await api('POST', '/api/knowledge/raw', { title: f.elements.title.value, kind: f.elements.kind.value, clientId: f.elements.clientId.value || null, content: f.elements.content.value });
      }
      $('#import-dialog').close();
      toast(`Saved to ${res.source.path}`);
      await loadKnowledge();
      B.go('knowledge', `path=${encodeURIComponent(file ? res.source.sidecar : res.source.path)}`);
      B.refresh();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  // ======================= CONNECTIONS =======================
  async function renderConnections() {
    const list = await api('GET', '/api/connections', undefined, { quiet: true });
    const S = B.state();
    const V = window.BDOSVoice;
    $('#cx-grid').innerHTML = list.map((c) => {
      let extra = '';
      if (c.id === 'light-model' && c.config) {
        extra = `<h4>Configuration (no secrets shown)</h4><ul><li>Anthropic SDK installed: ${c.config.sdkInstalled ? 'yes' : 'no'}</li><li>API key present in .env: ${c.config.keyPresent ? 'yes' : 'no'}</li><li>Model: ${esc(c.config.model || 'not set')}</li></ul>`;
      }
      if (c.id === 'claude-code' && c.config) {
        extra = `<h4>Detected</h4><ul><li>Version: ${esc(c.config.version)}</li><li>Program: <code>${esc(c.config.path)}</code></li><li>Headless options found: ${esc(Object.entries(c.config.flags).filter(([, v]) => v).map(([k]) => k).join(', '))}</li></ul>`;
      }
      if (c.lastTest) {
        const t = c.lastTest;
        const u = t.info && (t.info.usage || (t.info.reported && t.info.reported.usage));
        extra += `<h4>Last self-test</h4><ul><li>${t.ok ? 'Passed' : 'Failed'} ${esc(B.fmtTime(t.at))}</li>${t.ok && t.info.checks ? t.info.checks.map((x) => `<li>${esc(x)}</li>`).join('') : ''}${!t.ok ? `<li>${esc(t.error)}</li>` : ''}${u ? `<li>Reported usage: ${esc(u.input_tokens)} input / ${esc(u.output_tokens)} output tokens</li>` : ''}</ul>`;
      }
      let actions = '';
      if (c.canTest) actions += `<button class="btn small" data-action="self-test" data-id="${esc(c.id)}">Run self-test</button>`;
      if (c.id === 'transcription' || c.id === 'speech') {
        const kind = c.id;
        const prov = S.voice[kind];
        const supported = V.get(kind, 'browser') && V.get(kind, 'browser').supported();
        actions += `<label class="sr-only" for="vp-${kind}">Provider</label>
          <select id="vp-${kind}" data-voice-kind="${kind}"><option value="none" ${prov === 'none' ? 'selected' : ''}>None (voice off)</option><option value="browser" ${prov === 'browser' ? 'selected' : ''}>${esc(V.get(kind, 'browser').label)}</option></select>
          <span class="small muted">This browser: ${supported ? 'supports it' : 'does not support it'}</span>
          ${prov !== 'none' && supported ? `<button class="btn small" data-action="voice-test" data-kind="${kind}">${kind === 'speech' ? 'Test voice' : 'Test microphone'}</button>` : ''}`;
      }
      if (c.id === 'obsidian-plugin') actions += `<a class="btn small ghost" href="#/knowledge?path=${encodeURIComponent('system/obsidian-plugin-interface.md')}">Read the interface</a><span class="small muted">Token file: <code>${esc(S.paths.token)}</code></span>`;
      if (c.id === 'scheduler') actions += '<a class="btn small ghost" href="#/workflows">Manage schedules</a>';
      if (c.id === 'vault') actions += '<a class="btn small ghost" href="#/knowledge">Open Knowledge</a>';
      return `<article class="panel cx-card" id="cx-${esc(c.id)}">
        <header><h3>${esc(c.name)}</h3>${statusChip(c.state, c.label)}</header>
        <p class="detail">${esc(c.detail)}</p>
        <div><span class="route-tag ${c.route === 'Lightweight reasoning' ? 'light' : c.route === 'Workflow execution' ? 'workflow' : 'deterministic'}">${esc(c.route)}</span></div>
        ${c.enables && c.enables.length ? `<h4>Enables</h4><ul>${c.enables.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${c.setup && c.setup.length && c.state !== 'verified' && c.state !== 'available' ? `<h4>Set up</h4><ol>${c.setup.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
        ${extra}
        ${actions ? `<div class="actions">${actions}</div>` : ''}
      </article>`;
    }).join('');
  }
  document.addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-voice-kind]');
    if (!sel) return;
    const kind = sel.dataset.voiceKind;
    if (sel.value === 'browser' && kind === 'transcription' && !confirm('Browser speech recognition sends your voice audio to your browser vendor (Google for Chrome, Microsoft for Edge) to turn it into text. Turn it on?')) {
      sel.value = 'none';
      return;
    }
    try {
      await api('PUT', '/api/connections/voice', { [kind]: sel.value });
      toast(sel.value === 'none' ? 'Voice turned off' : 'Provider saved. Test it once to verify.');
      await B.refresh();
      await renderConnections();
    } catch (err) { toast(err.message, true); }
  });

  // ======================= registration =======================
  B.pages.workflows = { show: () => renderWorkflows(true).catch((err) => toast(err.message, true)), refresh: () => renderWorkflows(false).catch(() => {}) };
  B.pages.runs = {
    show: (params) => {
      renderRuns().catch((err) => toast(err.message, true));
      const id = params.get('id');
      if (id) showRun(id); else { selectedRun = null; $('#run-detail').hidden = true; }
    },
    refresh: () => renderRuns().catch(() => {}),
  };
  B.pages.knowledge = {
    show: async (params) => {
      try {
        await loadKnowledge();
        await openFile(params.get('path') || currentFile || 'index.md');
      } catch (err) { toast(err.message, true); }
    },
  };
  B.pages.connections = { show: () => renderConnections().catch((err) => toast(err.message, true)) };
})();
