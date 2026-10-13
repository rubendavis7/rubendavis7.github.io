// Small, safe Markdown renderer for vault notes. Everything is HTML-escaped
// first; only a fixed set of Markdown constructs become markup. Links are
// limited to http(s) and in-vault notes. Managed-block HTML comments are hidden.
(function () {
  'use strict';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));

  function inline(text, resolve) {
    return String(text).split(/(`[^`]+`)/).map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
      let s = esc(part);
      s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, target, alias) => {
        const t = unesc(target).trim();
        const label = alias || esc(t.split('/').pop());
        const p = resolve(t);
        return p ? `<a href="#" class="wikilink" data-open="${esc(p)}">${label}</a>` : `<a class="wikilink missing" title="Note not found">${label}</a>`;
      });
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
        const u = unesc(url);
        if (/^https?:\/\//i.test(u)) return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        let decoded = u;
        try { decoded = decodeURIComponent(u); } catch { /* keep raw */ }
        const p = resolve(decoded);
        return p ? `<a href="#" class="wikilink" data-open="${esc(p)}">${label}</a>` : label;
      });
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
      return s;
    }).join('');
  }

  function render(md, { resolve = () => null } = {}) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n').filter((l) => !/^\s*<!--[\s\S]*-->\s*$/.test(l));
    const out = [];
    let i = 0;
    const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l || '');
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      let m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) { out.push(`<h${m[1].length}>${inline(m[2], resolve)}</h${m[1].length}>`); i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        const c = /^\[!(\w+)\]\s*(.*)$/.exec(buf[0] || '');
        if (c) {
          const type = c[1].toLowerCase();
          const body = buf.slice(1).map((l) => inline(l, resolve)).join('<br>');
          out.push(`<blockquote class="callout ${esc(type)}"><div class="callout-title">${c[2] ? inline(c[2], resolve) : esc(type)}</div>${body}</blockquote>`);
        } else {
          out.push(`<blockquote>${buf.map((l) => inline(l, resolve)).join('<br>')}</blockquote>`);
        }
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && isTableSep(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<table><thead><tr>${head.map((h) => `<th>${inline(h, resolve)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, resolve)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          const text = lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, '');
          const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
          items.push(task
            ? `<li class="task"><input type="checkbox" disabled ${task[1] !== ' ' ? 'checked' : ''}> ${inline(task[2], resolve)}</li>`
            : `<li>${inline(text, resolve)}</li>`);
        }
        out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+\.)\s+|\s*\|.*\|\s*$)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) { buf.push(lines[i++]); }
      out.push(`<p>${buf.map((l, k) => inline(l.replace(/\s{2,}$/, ''), resolve) + (/\s{2,}$/.test(l) && k < buf.length - 1 ? '<br>' : '')).join(' ')}</p>`);
    }
    return out.join('\n');
  }

  window.BDOSMarkdown = { render, esc };
})();
