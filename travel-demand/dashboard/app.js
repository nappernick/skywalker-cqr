// Travel support demand: client-side filtering over de-identified ticket rows, drawn with d3.
const CH = ['answer', 'agent_action', 'intake_and_route', 'agent_prep_human_decision', 'human_investigation', 'engineering_fix'];
const CH_LABEL = {
  answer: 'Answer from docs', agent_action: 'Agent action', intake_and_route: 'Agent intake & route',
  agent_prep_human_decision: 'Agent preps, human decides', human_investigation: 'Human investigation', engineering_fix: 'Engineering fix',
};
const NO_HUMAN = new Set(['answer', 'agent_action', 'intake_and_route']);
const RES = ['knowledge', 'account_fix', 'defect', 'fulfilment', 'approval', 'routing', 'feedback', 'other', 'out_of_scope'];
const RES_LABEL = {
  knowledge: 'Knowledge', account_fix: 'Account fix', defect: 'Tool defect', fulfilment: 'Fulfilment', approval: 'Approval',
  routing: 'Transfer', feedback: 'Feedback', other: 'Other', out_of_scope: 'Out of scope',
};
const ORIGIN_LABEL = { River: 'River help menu', 'SIM-T': 'Direct in SIM', Other: 'Email, Slack, templates' };
// Events seen in the analysis (FINDINGS.md); fixed annotations, not data.
const EVENTS = [
  { month: '2026-01', label: 'Tool migration wave' },
  { month: '2026-07', label: 'CTI tree reorganised' },
  { month: '2026-08', label: 'V-Pay jump' },
];
const COV = ['full', 'partial', 'none'];
const COV_LABEL = { full: 'Fully answered', partial: 'Partly answered', none: 'Not covered' };
const covColor = (c) => ({ full: 'var(--color-ok)', partial: 'var(--color-warn)', none: 'var(--color-bad)' })[c] ?? 'var(--cds-chart-muted)';
const CERTIFIED_MONTH = '2026-05'; // most FAQs first certified (FINDINGS.md section 9)
const PARAMS = ['region', 'origin', 'from', 'to', 'domain', 'channel', 'intent'];

const fmtInt = d3.format(',');
const pct = d3.format('.0%');
const pct1 = d3.format('.1%');
const chColor = (c) => dash.colors[CH.indexOf(c)] ?? 'var(--cds-chart-muted)';
const monthDate = d3.utcParse('%Y-%m');
const monthFmt = d3.utcFormat('%b %y');

// ---------- model ----------
let indexCache = { src: null, idx: null };
let modelCache = { key: null, val: null };

function sources(ids) {
  const ds = ids.map((id) => dash.data(id));
  if (ds.some((d) => d.status === 'error' || d.status === 'missing')) return { failed: true };
  if (ds.some((d) => d.status !== 'ok')) return null;
  return { ds };
}

function index() {
  const s = sources(['tickets', 'ticket_intents', 'intents']);
  if (!s || s.failed) return s;
  const [tk, ti, it] = s.ds.map((d) => d.data);
  if (indexCache.src === tk && indexCache.ti === ti && indexCache.it === it) return indexCache.idx;
  const meta = new Map(it.map((r) => [r.intent, r]));
  const tickets = tk.map((r) => ({ ...r, k: +r.k, days: +r.days, rows: [] }));
  const byK = new Map(tickets.map((t) => [t.k, t]));
  for (const r of ti) {
    const t = byK.get(+r.k);
    if (t && meta.has(r.intent)) t.rows.push({ intent: r.intent, channel: r.channel, basis: r.basis, t });
  }
  for (const t of tickets) t.anyAnswer = t.rows.some((r) => r.channel === 'answer');
  const months = [...new Set(tickets.map((t) => t.month))].sort();
  const idx = { tickets, meta, months };
  indexCache = { src: tk, ti, it, idx };
  return idx;
}

function model() {
  const idx = index();
  if (!idx || idx.failed) return idx;
  const p = dash.params();
  const key = PARAMS.map((n) => p[n] ?? '').join('|');
  if (modelCache.key === key && modelCache.idx === idx) return modelCache.val;
  const rowOk = (r) => (!p.domain || idx.meta.get(r.intent).domain === p.domain)
    && (!p.channel || r.channel === p.channel) && (!p.intent || r.intent === p.intent);
  const rowFilter = p.domain || p.channel || p.intent;
  const tickets = [];
  const rows = [];
  for (const t of idx.tickets) {
    if (p.region && t.region !== p.region) continue;
    if (p.origin && t.origin !== p.origin) continue;
    if (p.from && t.month < p.from) continue;
    if (p.to && t.month > p.to) continue;
    const keep = rowFilter ? t.rows.filter(rowOk) : t.rows;
    if (!keep.length) continue;
    tickets.push(t);
    rows.push(...keep);
  }
  const val = { ...idx, tickets, rows, p };
  modelCache = { key, idx, val };
  return val;
}
window.tsdModel = model;

// ---------- drawing helpers ----------
function begin(el, { chart = true, ids } = {}) {
  const m = ids ? sources(ids) : model();
  if (!m || m.failed) {
    el.replaceChildren();
    if (m && m.failed) {
      const f = document.createElement('div');
      f.className = 'tsd-fail';
      f.textContent = 'Failed to load';
      el.append(f);
      el.classList.remove('dash-skeleton');
    } else if (chart) el.classList.add('dash-skeleton');
    else el.textContent = '—';
    return null;
  }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  return m;
}

function emptyNote(el, text) {
  const f = document.createElement('div');
  f.className = 'tsd-fail';
  f.textContent = text;
  el.append(f);
}

function tooltip(el) {
  const tip = d3.select(el).append('div').attr('class', 'tsd-tip').style('display', 'none');
  return {
    show(event, title, lines) {
      tip.html(null);
      tip.append('div').attr('class', 't').text(title);
      for (const l of lines) tip.append('div').text(l);
      tip.style('display', null);
      const [x, y] = d3.pointer(event, el);
      const w = tip.node().offsetWidth;
      const left = Math.max(0, Math.min(el.clientWidth - w, x + 12));
      tip.style('left', `${left}px`).style('top', `${y + 14}px`);
    },
    hide() { tip.style('display', 'none'); },
  };
}

// dash.colors and theme tokens are CSS variables: resolve to rgb() where d3 needs real colors.
function resolveColor(el, c) {
  const s = document.createElement('span');
  s.style.color = c;
  el.append(s);
  const v = getComputedStyle(s).color;
  s.remove();
  return v;
}

function textWidth(svg, s) {
  const t = svg.append('text').text(s);
  const w = t.node().getComputedTextLength();
  t.remove();
  return w;
}

function fitText(sel, maxW) {
  const node = sel.node();
  let s = node.textContent;
  if (node.getComputedTextLength() <= maxW) return;
  while (s.length > 1 && node.getComputedTextLength() > maxW) {
    s = s.slice(0, -1);
    node.textContent = `${s.trimEnd()}…`;
  }
}

// Horizontal bars, optionally stacked by channel. items: [{id, label, segs: [{key, v}], total, title?, lines?}]
function hbars(el, items, opts = {}) {
  const { rowH = 24, keys = CH, color = chColor, onClick, value = (d) => fmtInt(d.total), max, pickedId, labelShare = 0.42 } = opts;
  const w = Math.max(280, el.clientWidth);
  const h = items.length * rowH + 4;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);
  const longest = d3.max(items, (d) => textWidth(svg, d.label)) ?? 0;
  const L = Math.min(longest, w * labelShare) + 10;
  const valW = d3.max(items, (d) => textWidth(svg, value(d))) ?? 0;
  const x = d3.scaleLinear([0, max ?? d3.max(items, (d) => d.total) ?? 1], [L, w - valW - 10]);
  const tip = tooltip(el);
  const g = svg.selectAll('g.row').data(items).join('g').attr('class', 'row').attr('transform', (d, i) => `translate(0,${i * rowH})`);
  g.append('text').attr('x', L - 10).attr('y', rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
    .attr('font-weight', (d) => (d.id === pickedId ? 600 : null))
    .text((d) => d.label).each(function () { fitText(d3.select(this), L - 10); });
  g.each(function (d) {
    let acc = 0;
    const row = d3.select(this);
    for (const k of keys) {
      const seg = d.segs.find((s) => s.key === k);
      if (!seg || !seg.v) continue;
      row.append('rect').attr('x', x(acc)).attr('y', 4).attr('height', rowH - 8)
        .attr('width', Math.max(0, x(acc + seg.v) - x(acc))).style('fill', color(k));
      acc += seg.v;
    }
  });
  g.append('text').attr('class', 'muted').attr('x', (d) => x(d.total) + 6).attr('y', rowH / 2).attr('dy', '0.35em').text(value);
  g.append('rect').attr('class', 'row-hit').attr('x', 0).attr('y', 0).attr('width', w).attr('height', rowH)
    .style('cursor', onClick ? 'pointer' : 'default')
    .on('mousemove', (event, d) => tip.show(event, d.title ?? d.label, d.lines ?? d.segs.filter((s) => s.v).map((s) => `${opts.keyLabel ? opts.keyLabel(s.key) : CH_LABEL[s.key] ?? s.key}: ${fmtInt(s.v)} (${pct(s.v / d.total)})`)))
    .on('mouseleave', () => tip.hide())
    .on('click', (event, d) => onClick && onClick(d));
  el.style.minHeight = `${h}px`;
}

function channelSegs(rows) {
  const c = d3.rollup(rows, (v) => v.length, (r) => r.channel);
  return CH.map((k) => ({ key: k, v: c.get(k) ?? 0 }));
}

function byIntent(m) {
  return d3.groups(m.rows, (r) => r.intent).map(([intent, rs]) => {
    const meta = m.meta.get(intent);
    return { id: intent, label: meta.name, meta, rows: rs, total: new Set(rs.map((r) => r.t.k)).size };
  }).sort((a, b) => b.total - a.total);
}

function toggleParam(name, value) {
  dash.setParams({ [name]: dash.params()[name] === value ? null : value });
}

// ---------- filters ----------
function fillSelect(sel, allLabel, options, param) {
  sel.replaceChildren(new Option(allLabel, ''), ...options.map(([v, l]) => new Option(l, v)));
  sel.value = dash.params()[param] ?? '';
  sel.onchange = () => dash.setParams({ [param]: sel.value || null });
}

dash.draw('f-region', (sel) => {
  const idx = index();
  const regions = idx && !idx.failed ? [...new Set(idx.tickets.map((t) => t.region))].sort() : [];
  fillSelect(sel, 'All regions', regions.map((r) => [r, r]), 'region');
});
dash.draw('f-origin', (sel) => fillSelect(sel, 'All routes', Object.entries(ORIGIN_LABEL), 'origin'));
dash.draw('f-from', (sel) => {
  const idx = index();
  const ms = idx && !idx.failed ? idx.months : [];
  fillSelect(sel, 'Earliest', ms.map((x) => [x, monthFmt(monthDate(x))]), 'from');
});
dash.draw('f-to', (sel) => {
  const idx = index();
  const ms = idx && !idx.failed ? idx.months : [];
  fillSelect(sel, 'Latest', ms.map((x) => [x, monthFmt(monthDate(x))]), 'to');
});
dash.draw('f-domain', (sel) => {
  const idx = index();
  const ds = idx && !idx.failed ? [...new Set([...idx.meta.values()].map((r) => r.domain))].sort() : [];
  fillSelect(sel, 'All domains', ds.map((d) => [d, d]), 'domain');
});
dash.draw('f-channel', (sel) => fillSelect(sel, 'All channels', CH.map((c) => [c, CH_LABEL[c]]), 'channel'));
dash.draw('f-intent', (sel) => {
  const idx = index();
  const opts = idx && !idx.failed ? [...idx.meta.values()].sort((a, b) => d3.ascending(a.name, b.name)).map((r) => [r.intent, r.name]) : [];
  fillSelect(sel, 'All intents', opts, 'intent');
});
for (const b of document.querySelectorAll('#f-reset')) b.addEventListener('click', () => dash.resetParams());

// ---------- tabs ----------
function showTab(name) {
  let found = false;
  for (const s of document.querySelectorAll('[data-page]')) { s.hidden = s.dataset.page !== name; found ||= s.dataset.page === name; }
  if (!found) return;
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  dash.setLink(name);
}
for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));
if (location.hash.length > 1) showTab(location.hash.slice(1));
for (const sw of document.querySelectorAll('.tsd-legend .sw[data-ch]')) sw.style.background = chColor(sw.dataset.ch);
for (const sw of document.querySelectorAll('.tsd-legend .sw[data-cov]')) sw.style.background = covColor(sw.dataset.cov);
for (const inp of document.querySelectorAll('#ans-search')) inp.addEventListener('input', () => dash.draw('t-answerable'));

// ---------- KPIs ----------
const kpi = (name, f) => dash.draw(name, (el) => {
  const m = model();
  if (!m || m.failed) { el.textContent = '—'; return; }
  el.textContent = m.tickets.length ? f(m) : '—';
});
const share = (m, test) => pct(m.tickets.filter(test).length / m.tickets.length);
kpi('k-tickets', (m) => fmtInt(m.tickets.length));
kpi('k-answer', (m) => share(m, (t) => t.channel === 'answer'));
kpi('k-anyanswer', (m) => share(m, (t) => t.anyAnswer));
kpi('k-agent', (m) => share(m, (t) => t.channel === 'agent_action'));
kpi('k-nohuman', (m) => share(m, (t) => NO_HUMAN.has(t.channel)));
kpi('k-multi', (m) => share(m, (t) => t.n_intents > 1));

// ---------- overview ----------
dash.draw('c-channel', (el) => {
  const m = begin(el);
  if (!m) return;
  const c = d3.rollup(m.tickets, (v) => v.length, (t) => t.channel);
  const n = m.tickets.length;
  const items = CH.map((k) => ({ id: k, label: CH_LABEL[k], total: c.get(k) ?? 0, segs: [{ key: k, v: c.get(k) ?? 0 }] }));
  hbars(el, items, {
    rowH: 30, value: (d) => `${fmtInt(d.total)} · ${pct(d.total / (n || 1))}`, pickedId: m.p.channel,
    onClick: (d) => toggleParam('channel', d.id),
  });
});

dash.draw('c-domain', (el) => {
  const m = begin(el);
  if (!m) return;
  const items = d3.groups(m.rows, (r) => m.meta.get(r.intent).domain)
    .map(([dom, rs]) => ({ id: dom, label: dom, total: rs.length, segs: channelSegs(rs) }))
    .sort((a, b) => b.total - a.total);
  if (!items.length) return emptyNote(el, 'No tickets match these filters');
  hbars(el, items, { rowH: 28, pickedId: m.p.domain, onClick: (d) => toggleParam('domain', d.id) });
});

dash.draw('c-monthly', (el) => {
  const m = begin(el);
  if (!m) return;
  const months = m.months.filter((x) => (!m.p.from || x >= m.p.from) && (!m.p.to || x <= m.p.to));
  const data = months.map((mo) => {
    const ts = m.tickets.filter((t) => t.month === mo);
    const c = d3.rollup(ts, (v) => v.length, (t) => t.channel);
    return { month: mo, total: ts.length, ...Object.fromEntries(CH.map((k) => [k, c.get(k) ?? 0])) };
  });
  const w = Math.max(300, el.clientWidth);
  const h = 280;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);
  const ymax = d3.max(data, (d) => d.total) || 1;
  const yAxisW = textWidth(svg, fmtInt(ymax)) + 10;
  const mt = 34;
  const x = d3.scaleBand(months, [yAxisW, w - 4]).padding(0.25);
  const y = d3.scaleLinear([0, ymax], [h - 24, mt]).nice();
  svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', yAxisW).attr('x2', w).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('class', 'muted').attr('x', yAxisW - 6).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').text(fmtInt);
  const stack = d3.stack().keys(CH)(data);
  svg.append('g').selectAll('g').data(stack).join('g').style('fill', (s) => chColor(s.key))
    .selectAll('rect').data((s) => s).join('rect')
    .attr('x', (d) => x(d.data.month)).attr('width', x.bandwidth())
    .attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])));
  const every = Math.ceil(months.length / Math.max(1, Math.floor(w / 64)));
  svg.append('g').selectAll('text').data(months.filter((_, i) => i % every === 0)).join('text').attr('class', 'muted')
    .attr('x', (d) => x(d) + x.bandwidth() / 2).attr('y', h - 6).attr('text-anchor', 'middle').text((d) => monthFmt(monthDate(d)));
  const ev = EVENTS.filter((e) => months.includes(e.month));
  const placed = [];
  for (const e of ev) {
    const cx = x(e.month) + x.bandwidth() / 2;
    svg.append('line').attr('x1', cx).attr('x2', cx).attr('y1', mt - 6).attr('y2', h - 24).style('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
    const t = svg.append('text').attr('class', 'muted').attr('y', 12).text(e.label);
    const tw = t.node().getComputedTextLength();
    let tx = Math.max(0, Math.min(w - tw, cx - tw / 2));
    let row = 0;
    while (placed.some((pl) => pl.row === row && tx < pl.x2 + 8 && tx + tw > pl.x1 - 8)) row += 1;
    t.attr('x', tx).attr('y', 12 + row * 14);
    placed.push({ x1: tx, x2: tx + tw, row });
  }
  const tip = tooltip(el);
  svg.append('g').selectAll('rect').data(data).join('rect').attr('class', 'row-hit')
    .attr('x', (d) => x(d.month)).attr('width', x.bandwidth()).attr('y', mt).attr('height', h - 24 - mt)
    .on('mousemove', (event, d) => tip.show(event, `${monthFmt(monthDate(d.month))} · ${fmtInt(d.total)} tickets`,
      CH.filter((k) => d[k]).map((k) => `${CH_LABEL[k]}: ${fmtInt(d[k])}`)))
    .on('mouseleave', () => tip.hide());
  // Drag across months to set the month filter for every card.
  const brush = d3.brushX().extent([[yAxisW, mt], [w - 4, h - 24]]).on('end', (event) => {
    if (!event.sourceEvent || !event.selection) return;
    const [a, b] = event.selection;
    const picked = months.filter((mo) => x(mo) + x.bandwidth() / 2 >= a && x(mo) + x.bandwidth() / 2 <= b);
    if (picked.length) dash.setParams({ from: picked[0], to: picked[picked.length - 1] });
  });
  const bg = svg.append('g').attr('class', 'tsd-brush').call(brush);
  bg.selectAll('.selection').style('fill', 'var(--cds-chart-reference)').style('fill-opacity', 0.15).style('stroke', 'var(--cds-chart-reference)');
  bg.selectAll('.overlay').on('mousemove.tip', (event) => {
    const [px] = d3.pointer(event, svg.node());
    const d = data.find((r) => px >= x(r.month) && px <= x(r.month) + x.bandwidth());
    if (d) tip.show(event, `${monthFmt(monthDate(d.month))} · ${fmtInt(d.total)} tickets`, CH.filter((k) => d[k]).map((k) => `${CH_LABEL[k]}: ${fmtInt(d[k])}`));
    else tip.hide();
  }).on('mouseleave.tip', () => tip.hide());
  el.style.minHeight = `${h}px`;
});

// ---------- answerable ----------
function answerable(m) {
  const all = byIntent(m);
  return all.map((d) => {
    const ans = d.rows.filter((r) => r.channel === 'answer');
    const tk = [...new Set(ans.map((r) => r.t))];
    return {
      ...d, ans, tk, n: tk.length,
      hidden: ans.filter((r) => r.basis !== 'intent_default').length,
      share: tk.length / d.total,
      transfer: tk.length ? tk.filter((t) => t.resolution === 'routing').length / tk.length : 0,
      notRiver: tk.length ? tk.filter((t) => t.not_on_river).length / tk.length : 0,
      days: d3.median(tk, (t) => t.days) ?? 0,
      tier2: tk.length ? tk.filter((t) => t.tier2plus).length / tk.length : 0,
      region: tk.length ? d3.greatest(d3.rollups(tk, (v) => v.length, (t) => t.region), (r) => r[1])[0] : '',
    };
  });
}

dash.draw('c-pareto', (el) => {
  const m = begin(el);
  if (!m) return;
  const a = answerable(m).filter((d) => d.ans.length).sort((x, y) => y.ans.length - x.ans.length);
  if (!a.length) return emptyNote(el, 'No answerable needs match these filters');
  const total = d3.sum(a, (d) => d.ans.length);
  let cum = 0;
  const items = a.slice(0, 25).map((d) => {
    cum += d.ans.length;
    return {
      id: d.id, label: d.label, total: d.ans.length, cum: cum / total,
      segs: [{ key: 'direct', v: d.ans.length - d.hidden }, { key: 'hidden', v: d.hidden }],
      lines: [`Answerable needs: ${fmtInt(d.ans.length)}`, `From action tickets resolved by explanation: ${fmtInt(d.hidden)}`, `Running share: ${pct(cum / total)}`],
    };
  });
  hbars(el, items, {
    keys: ['direct', 'hidden'], keyLabel: (k) => (k === 'hidden' ? 'Hidden in action tickets' : 'Asked as a question'),
    color: (k) => (k === 'direct' ? dash.colors[0] : 'var(--cds-chart-muted)'),
    value: (d) => `${fmtInt(d.total)} · ${pct(d.cum)}`, pickedId: m.p.intent, onClick: (d) => toggleParam('intent', d.id),
  });
});

dash.draw('c-scatter', (el) => {
  const m = begin(el);
  if (!m) return;
  const pts = answerable(m).filter((d) => d.total >= 10);
  if (!pts.length) return emptyNote(el, 'No intents with 10+ tickets match these filters');
  const w = Math.max(300, el.clientWidth);
  const h = 420;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);
  const left = textWidth(svg, '100%') + 12;
  const x = d3.scaleLog([Math.max(5, d3.min(pts, (d) => d.total) * 0.8), d3.max(pts, (d) => d.total) * 1.2], [left, w - 10]);
  const y = d3.scaleLinear([0, 1], [h - 34, 12]);
  svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('x1', left).attr('x2', w - 10).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(y.ticks(5)).join('text').attr('class', 'muted').attr('x', left - 6).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').text(pct);
  const xt = x.ticks(Math.max(2, Math.floor(w / 110))).filter((v) => [1, 2, 5].includes(+String(v)[0]));
  svg.append('g').selectAll('text').data(xt).join('text').attr('class', 'muted').attr('x', x).attr('y', h - 16).attr('text-anchor', 'middle').text(fmtInt);
  svg.append('text').attr('class', 'muted').attr('x', w - 10).attr('y', h - 2).attr('text-anchor', 'end').text('Tickets with this intent (log scale)');
  const tip = tooltip(el);
  svg.append('g').selectAll('circle').data(pts).join('circle')
    .attr('cx', (d) => x(d.total)).attr('cy', (d) => y(d.share)).attr('r', (d) => 3 + Math.sqrt(d.n) / 2)
    .style('fill', (d) => chColor(d.meta.best_channel)).attr('fill-opacity', 0.75).style('stroke', 'var(--color-panel)')
    .style('cursor', 'pointer')
    .on('mousemove', (event, d) => tip.show(event, d.label, [`${fmtInt(d.total)} tickets, ${fmtInt(d.n)} answerable (${pct(d.share)})`, `Default channel: ${CH_LABEL[d.meta.best_channel] ?? '—'}`]))
    .on('mouseleave', () => tip.hide())
    .on('click', (event, d) => toggleParam('intent', d.id));
  const boxes = [];
  for (const d of [...pts].sort((a, b) => b.n - a.n).slice(0, 12)) {
    const t = svg.append('text').attr('class', 'muted').text(d.label);
    const tw = t.node().getComputedTextLength();
    const r = 3 + Math.sqrt(d.n) / 2;
    let tx = x(d.total) + r + 3;
    if (tx + tw > w - 4) tx = x(d.total) - r - 3 - tw;
    const ty = y(d.share) + 4;
    const box = { x1: tx, x2: tx + tw, y1: ty - 11, y2: ty + 2 };
    if (tx < left || boxes.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1)) { t.remove(); continue; }
    t.attr('x', tx).attr('y', ty);
    boxes.push(box);
  }
  el.style.minHeight = `${h}px`;
});

let ansSort = { key: 'n', dir: -1 };
dash.draw('t-answerable', (el) => {
  const m = begin(el, { chart: false });
  if (!m) return;
  const q = (document.querySelector('#ans-search')?.value ?? '').trim().toLowerCase();
  let rows = answerable(m).filter((d) => d.n > 0);
  if (q) rows = rows.filter((d) => `${d.label} ${d.meta.faq_question}`.toLowerCase().includes(q));
  const cols = [
    { key: 'label', label: 'Intent', text: true },
    { key: 'n', label: 'Answerable tickets', f: fmtInt },
    { key: 'share', label: 'Share of intent', f: pct },
    { key: 'hiddenShare', label: 'Hidden in action', f: pct },
    { key: 'transfer', label: 'From expense team', f: pct },
    { key: 'notRiver', label: 'Chose “not on River”', f: pct },
    { key: 'tier2', label: 'Tier 2+', f: pct },
    { key: 'days', label: 'Median days', f: d3.format('.1f') },
    { key: 'region', label: 'Top region', text: true },
    { key: 'coverage', label: 'FAQ coverage', text: true, pill: true },
  ];
  for (const d of rows) { d.hiddenShare = d.ans.length ? d.hidden / d.ans.length : 0; d.coverage = d.meta.coverage || ''; }
  rows.sort((a, b) => ansSort.dir * (typeof a[ansSort.key] === 'string' ? d3.ascending(a[ansSort.key], b[ansSort.key]) : a[ansSort.key] - b[ansSort.key]));
  const maxN = d3.max(rows, (d) => d.n) || 1;
  const table = d3.select(el).append('table').attr('class', 'tsd-table');
  table.append('thead').append('tr').selectAll('th').data(cols).join('th')
    .attr('class', (c) => (c.text ? null : 'num'))
    .attr('aria-sort', (c) => (c.key === ansSort.key ? (ansSort.dir > 0 ? 'ascending' : 'descending') : 'none'))
    .append('button').attr('type', 'button').text((c) => c.label + (c.key === ansSort.key ? (ansSort.dir > 0 ? ' ↑' : ' ↓') : ''))
    .on('click', (event, c) => { ansSort = { key: c.key, dir: ansSort.key === c.key ? -ansSort.dir : (c.text ? 1 : -1) }; dash.draw('t-answerable'); });
  const tr = table.append('tbody').selectAll('tr').data(rows).join('tr');
  tr.each(function (d) {
    const row = d3.select(this);
    const first = row.append('td');
    first.append('span').text(d.label);
    first.append('span').attr('class', 'q').text(d.meta.faq_question);
    for (const c of cols.slice(1)) {
      const td = row.append('td').attr('class', c.text ? null : 'num');
      if (c.pill) td.append('span').attr('class', `tsd-pill ${d[c.key]}`).text(COV_LABEL[d[c.key]] ?? '—');
      else td.text(c.f ? c.f(d[c.key]) : d[c.key]);
      if (c.key === 'n') td.append('div').attr('class', 'bar').style('width', `${(d.n / maxN) * 100}%`).style('background', dash.colors[0]);
    }
  });
  if (!rows.length) emptyNote(el, 'No answerable intents match');
});

// ---------- all intents ----------
dash.draw('c-allintents', (el) => {
  const m = begin(el);
  if (!m) return;
  const items = byIntent(m).map((d) => ({ id: d.id, label: d.label, total: d.total, segs: channelSegs(d.rows) }));
  if (!items.length) return emptyNote(el, 'No tickets match these filters');
  hbars(el, items, { rowH: 22, pickedId: m.p.intent, onClick: (d) => toggleParam('intent', d.id) });
});

function heatmap(el, rowsData, colKeys, colLabel, { cellH = 22 } = {}) {
  const w = Math.max(320, el.clientWidth);
  const top = 30;
  const h = rowsData.length * cellH + top + 4;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);
  const L = Math.min(d3.max(rowsData, (d) => textWidth(svg, d.label)) ?? 0, w * 0.34) + 10;
  const x = d3.scaleBand(colKeys, [L, w]).padding(0.06);
  const ramp = d3.interpolateRgb(resolveColor(el, 'var(--color-panel)'), resolveColor(el, dash.colors[0]));
  const tip = tooltip(el);
  svg.append('g').selectAll('text').data(colKeys).join('text').attr('class', 'muted')
    .attr('x', (k) => x(k) + x.bandwidth() / 2).attr('y', top - 10).attr('text-anchor', 'middle')
    .text(colLabel).each(function () { fitText(d3.select(this), x.bandwidth() - 2); });
  const g = svg.selectAll('g.r').data(rowsData).join('g').attr('class', 'r').attr('transform', (d, i) => `translate(0,${top + i * cellH})`);
  g.append('text').attr('x', L - 10).attr('y', cellH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text((d) => d.label)
    .each(function () { fitText(d3.select(this), L - 10); });
  g.each(function (d) {
    const row = d3.select(this);
    for (const k of colKeys) {
      const v = d.values[k] ?? 0;
      row.append('rect').attr('x', x(k)).attr('y', 2).attr('width', x.bandwidth()).attr('height', cellH - 4).attr('rx', 2)
        .attr('fill', ramp(Math.min(1, v * 1.4)))
        .on('mousemove', (event) => tip.show(event, d.label, [`${colLabel(k)}: ${pct(v)} of ${fmtInt(d.n)} tickets`]))
        .on('mouseleave', () => tip.hide());
      if (v >= 0.05 && x.bandwidth() >= 30) {
        row.append('text').attr('x', x(k) + x.bandwidth() / 2).attr('y', cellH / 2).attr('dy', '0.35em').attr('text-anchor', 'middle')
          .attr('pointer-events', 'none').style('fill', v > 0.45 ? 'var(--color-bg)' : 'var(--color-fg)').text(pct(v));
      }
    }
  });
  el.style.minHeight = `${h}px`;
}

dash.draw('c-heat', (el) => {
  const m = begin(el);
  if (!m) return;
  const top = byIntent(m).slice(0, 25);
  if (!top.length) return emptyNote(el, 'No tickets match these filters');
  const cols = RES.filter((r) => top.some((d) => d.rows.some((x) => x.t.resolution === r)));
  const data = top.map((d) => {
    const tk = [...new Set(d.rows.map((r) => r.t))];
    const c = d3.rollup(tk, (v) => v.length, (t) => t.resolution);
    return { label: d.label, n: tk.length, values: Object.fromEntries(cols.map((k) => [k, (c.get(k) ?? 0) / tk.length])) };
  });
  heatmap(el, data, cols, (k) => RES_LABEL[k] ?? k);
});

// ---------- time & place ----------
dash.draw('c-multiples', (el) => {
  const m = begin(el);
  if (!m) return;
  const top = byIntent(m).slice(0, 12);
  if (!top.length) return emptyNote(el, 'No tickets match these filters');
  const months = m.months.filter((x) => (!m.p.from || x >= m.p.from) && (!m.p.to || x <= m.p.to));
  const series = top.map((d) => {
    const c = d3.rollup([...new Set(d.rows.map((r) => r.t))], (v) => v.length, (t) => t.month);
    return { ...d, vals: months.map((mo) => ({ month: mo, v: c.get(mo) ?? 0 })) };
  });
  const w = Math.max(300, el.clientWidth);
  const cols = Math.max(1, Math.min(4, Math.floor(w / 230)));
  const pw = w / cols;
  const ph = 120;
  const rows = Math.ceil(series.length / cols);
  const h = rows * ph;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);
  const ymax = d3.max(series, (s) => d3.max(s.vals, (v) => v.v)) || 1;
  const tip = tooltip(el);
  series.forEach((s, i) => {
    const gx = (i % cols) * pw;
    const gy = Math.floor(i / cols) * ph;
    const g = svg.append('g').attr('transform', `translate(${gx},${gy})`);
    const x = d3.scaleBand(months, [4, pw - 16]).padding(0.2);
    const y = d3.scaleLinear([0, ymax], [ph - 22, 26]);
    g.append('text').attr('x', 4).attr('y', 14).text(s.label).each(function () { fitText(d3.select(this), pw - 60); });
    g.append('text').attr('class', 'muted').attr('x', pw - 16).attr('y', 14).attr('text-anchor', 'end').text(fmtInt(s.total));
    g.append('line').attr('x1', 4).attr('x2', pw - 16).attr('y1', ph - 22).attr('y2', ph - 22).style('stroke', 'var(--cds-chart-axis)');
    g.selectAll('rect').data(s.vals).join('rect').attr('x', (d) => x(d.month)).attr('width', x.bandwidth())
      .attr('y', (d) => y(d.v)).attr('height', (d) => ph - 22 - y(d.v)).attr('rx', 1).style('fill', dash.colors[0])
      .on('mousemove', (event, d) => tip.show(event, s.label, [`${monthFmt(monthDate(d.month))}: ${fmtInt(d.v)} tickets`]))
      .on('mouseleave', () => tip.hide());
    if (months.length) {
      g.append('text').attr('class', 'muted').attr('x', 4).attr('y', ph - 8).text(monthFmt(monthDate(months[0])));
      g.append('text').attr('class', 'muted').attr('x', pw - 16).attr('y', ph - 8).attr('text-anchor', 'end').text(monthFmt(monthDate(months[months.length - 1])));
    }
  });
  el.style.minHeight = `${h}px`;
});

dash.draw('c-region', (el) => {
  const m = begin(el);
  if (!m) return;
  const top = byIntent(m).slice(0, 20);
  if (!top.length) return emptyNote(el, 'No tickets match these filters');
  const regions = ['AMER', 'EMEA', 'APAC', 'LATAM'];
  const data = top.map((d) => {
    const tk = [...new Set(d.rows.map((r) => r.t))];
    const c = d3.rollup(tk, (v) => v.length, (t) => t.region);
    return { label: d.label, n: tk.length, values: Object.fromEntries(regions.map((k) => [k, (c.get(k) ?? 0) / tk.length])) };
  });
  heatmap(el, data, regions, (k) => k);
});

dash.draw('t-country', (el) => {
  const m = begin(el, { chart: false });
  if (!m) return;
  const rows = byIntent(m).filter((d) => d.total >= 20).map((d) => {
    const tk = [...new Set(d.rows.map((r) => r.t))];
    const [country, n] = d3.greatest(d3.rollups(tk, (v) => v.length, (t) => t.country), (r) => r[1]);
    return { label: d.label, country, n: tk.length, share: n / tk.length };
  }).sort((a, b) => b.share - a.share).slice(0, 15);
  if (!rows.length) return emptyNote(el, 'No intents with 20+ tickets match');
  const table = d3.select(el).append('table').attr('class', 'tsd-table');
  table.append('thead').append('tr').selectAll('th').data(['Intent', 'Top country', 'Share', 'Tickets']).join('th')
    .attr('class', (d, i) => (i >= 2 ? 'num' : null)).text((d) => d);
  const tr = table.append('tbody').selectAll('tr').data(rows).join('tr');
  tr.append('td').text((d) => d.label);
  tr.append('td').text((d) => d.country);
  tr.append('td').attr('class', 'num').text((d) => pct(d.share))
    .append('div').attr('class', 'bar').style('width', (d) => `${d.share * 100}%`).style('background', dash.colors[0]);
  tr.append('td').attr('class', 'num').text((d) => fmtInt(d.n));
});

// ---------- bundles & journeys ----------
dash.draw('t-pairs', (el) => {
  const m = begin(el, { chart: false });
  if (!m) return;
  const n = m.tickets.length;
  const cnt = new Map();
  const pairs = new Map();
  for (const t of m.tickets) {
    const set = [...new Set(t.rows.map((r) => r.intent))].sort();
    for (const a of set) cnt.set(a, (cnt.get(a) ?? 0) + 1);
    for (let i = 0; i < set.length; i += 1) for (let j = i + 1; j < set.length; j += 1) {
      const key = `${set[i]}|${set[j]}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
  const rows = [...pairs].filter(([, s]) => s >= 5).map(([key, s]) => {
    const [a, b] = key.split('|');
    const [hi, lo] = s / cnt.get(a) >= s / cnt.get(b) ? [a, b] : [b, a];
    return { a: m.meta.get(hi).name, b: m.meta.get(lo).name, s, pba: s / cnt.get(hi), lift: (s / cnt.get(hi)) / (cnt.get(lo) / n) };
  }).sort((x, y) => y.s - x.s).slice(0, 20);
  if (!rows.length) return emptyNote(el, 'No pairs with 5+ tickets in view');
  const maxS = d3.max(rows, (d) => d.s);
  const table = d3.select(el).append('table').attr('class', 'tsd-table');
  table.append('thead').append('tr').selectAll('th').data(['A', 'B', 'Tickets', 'P(B|A)', 'Lift']).join('th')
    .attr('class', (d, i) => (i >= 2 ? 'num' : null)).text((d) => d);
  const tr = table.append('tbody').selectAll('tr').data(rows).join('tr');
  tr.append('td').text((d) => d.a);
  tr.append('td').text((d) => d.b);
  tr.append('td').attr('class', 'num').text((d) => fmtInt(d.s))
    .append('div').attr('class', 'bar').style('width', (d) => `${(d.s / maxS) * 100}%`).style('background', dash.colors[0]);
  tr.append('td').attr('class', 'num').text((d) => pct(d.pba));
  tr.append('td').attr('class', 'num').text((d) => d3.format('.1f')(d.lift));
});

dash.draw('c-journeys', (el) => {
  const s = begin(el, { ids: ['transitions', 'intents'] });
  if (!s) return;
  const [tr, it] = s.ds.map((d) => d.data);
  const name = new Map(it.map((r) => [r.intent, r.name]));
  const items = tr.map((r) => ({ ...r, transitions: +r.transitions }))
    .filter((r) => name.has(r.from_intent) && name.has(r.next_intent_30d))
    .sort((a, b) => b.transitions - a.transitions).slice(0, 20)
    .map((r, i) => {
      const same = String(r.same_intent) === 'true' || r.same_intent === true;
      const label = same ? `${name.get(r.from_intent)} (again)` : `${name.get(r.from_intent)} → ${name.get(r.next_intent_30d)}`;
      return { id: String(i), label, total: r.transitions, segs: [{ key: same ? 'same' : 'next', v: r.transitions }] };
    });
  hbars(el, items, {
    rowH: 24, keys: ['same', 'next'], labelShare: 0.6,
    color: (k) => (k === 'next' ? dash.colors[0] : 'var(--cds-chart-muted)'),
    keyLabel: (k) => (k === 'same' ? 'Same need again' : 'A different need next'),
  });
});

// ---------- agents & routing ----------
dash.draw('c-cap', (el) => {
  const m = begin(el);
  if (!m) return;
  const items = d3.groups(m.rows.filter((r) => r.channel === 'agent_action' && m.meta.get(r.intent).agent_capability), (r) => m.meta.get(r.intent).agent_capability)
    .map(([cap, rs]) => ({ id: cap, label: cap, total: rs.length, segs: [{ key: 'agent_action', v: rs.length }],
      lines: [`${fmtInt(rs.length)} needs`, ...[...new Set(rs.map((r) => m.meta.get(r.intent).name))].slice(0, 4)] }))
    .sort((a, b) => b.total - a.total);
  if (!items.length) return emptyNote(el, 'No agent-action needs match these filters');
  hbars(el, items, { rowH: 24, labelShare: 0.55 });
});

dash.draw('c-transfer', (el) => {
  const m = begin(el);
  if (!m) return;
  const items = byIntent(m).filter((d) => d.total >= 15).map((d) => {
    const tk = [...new Set(d.rows.map((r) => r.t))];
    const n = tk.filter((t) => t.resolution === 'routing').length;
    return { id: d.id, label: d.label, total: n / tk.length, n, all: tk.length };
  }).filter((d) => d.n > 0).sort((a, b) => b.total - a.total).slice(0, 15)
    .map((d) => ({ ...d, segs: [{ key: 'answer', v: d.total }], lines: [`${fmtInt(d.n)} of ${fmtInt(d.all)} tickets transferred (${pct(d.total)})`] }));
  if (!items.length) return emptyNote(el, 'No transferred tickets match these filters');
  hbars(el, items, { rowH: 24, max: 1, value: (d) => pct(d.total), color: () => dash.colors[0], onClick: (d) => toggleParam('intent', d.id) });
});

dash.draw('c-origin', (el) => {
  const m = begin(el);
  if (!m) return;
  const items = Object.keys(ORIGIN_LABEL).map((o) => {
    const ts = m.tickets.filter((t) => t.origin === o);
    const c = d3.rollup(ts, (v) => v.length, (t) => t.channel);
    return { id: o, label: ORIGIN_LABEL[o], n: ts.length, total: ts.length ? 1 : 0, segs: CH.map((k) => ({ key: k, v: ts.length ? (c.get(k) ?? 0) / ts.length : 0 })) };
  }).filter((d) => d.n);
  if (!items.length) return emptyNote(el, 'No tickets match these filters');
  for (const d of items) d.lines = d.segs.filter((s) => s.v).map((s) => `${CH_LABEL[s.key]}: ${pct(s.v)}`);
  hbars(el, items, { rowH: 34, max: 1, value: (d) => `${fmtInt(d.n)} tickets`, pickedId: m.p.origin, onClick: (d) => toggleParam('origin', d.id) });
});

// ---------- FAQ coverage ----------
const isAnswerFirst = (m, r) => r.channel !== 'answer' && (m.meta.get(r.intent).answer_class || '').startsWith('doc_then');

dash.draw('c-covsets', (el) => {
  const m = begin(el);
  if (!m) return;
  const sets = [
    { id: 'answerable', label: 'Answerable needs', rows: m.rows.filter((r) => r.channel === 'answer') },
    { id: 'answer_first', label: 'Answer-first needs', rows: m.rows.filter((r) => isAnswerFirst(m, r)) },
  ].filter((d) => d.rows.length);
  if (!sets.length) return emptyNote(el, 'No documentation demand matches these filters');
  const items = sets.map((d) => {
    const c = d3.rollup(d.rows, (v) => v.length, (r) => m.meta.get(r.intent).coverage);
    return { id: d.id, label: d.label, total: d.rows.length, segs: COV.map((k) => ({ key: k, v: c.get(k) ?? 0 })) };
  });
  hbars(el, items, { rowH: 34, keys: COV, color: covColor, keyLabel: (k) => COV_LABEL[k], labelShare: 0.36,
    value: (d) => `${fmtInt(d.total)} needs` });
});

dash.draw('c-covmonth', (el) => {
  const m = begin(el);
  if (!m) return;
  const months = m.months.filter((x) => (!m.p.from || x >= m.p.from) && (!m.p.to || x <= m.p.to));
  const ans = m.rows.filter((r) => r.channel === 'answer');
  if (!ans.length) return emptyNote(el, 'No answerable needs match these filters');
  const data = months.map((mo) => {
    const rs = ans.filter((r) => r.t.month === mo);
    const out = { month: mo, total: 0 };
    for (const k of COV) {
      out[k] = new Set(rs.filter((r) => m.meta.get(r.intent).coverage === k).map((r) => r.t.k)).size;
      out.total += out[k];
    }
    return out;
  });
  const w = Math.max(300, el.clientWidth);
  const h = 260;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);
  const ymax = d3.max(data, (d) => d.total) || 1;
  const left = textWidth(svg, fmtInt(ymax)) + 10;
  const mt = 22;
  const x = d3.scaleBand(months, [left, w - 4]).padding(0.25);
  const y = d3.scaleLinear([0, ymax], [h - 24, mt]).nice();
  svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', left).attr('x2', w).attr('y1', y).attr('y2', y).style('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('class', 'muted').attr('x', left - 6).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').text(fmtInt);
  svg.append('g').selectAll('g').data(d3.stack().keys(COV)(data)).join('g').style('fill', (s) => covColor(s.key))
    .selectAll('rect').data((s) => s).join('rect')
    .attr('x', (d) => x(d.data.month)).attr('width', x.bandwidth())
    .attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])));
  const every = Math.ceil(months.length / Math.max(1, Math.floor(w / 64)));
  svg.append('g').selectAll('text').data(months.filter((_, i) => i % every === 0)).join('text').attr('class', 'muted')
    .attr('x', (d) => x(d) + x.bandwidth() / 2).attr('y', h - 6).attr('text-anchor', 'middle').text((d) => monthFmt(monthDate(d)));
  if (months.includes(CERTIFIED_MONTH)) {
    const cx = x(CERTIFIED_MONTH);
    svg.append('line').attr('x1', cx).attr('x2', cx).attr('y1', mt - 4).attr('y2', h - 24).style('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
    const t = svg.append('text').attr('class', 'muted').attr('y', 12).text('FAQs certified');
    const tw = t.node().getComputedTextLength();
    t.attr('x', Math.max(0, Math.min(w - tw, cx - tw / 2)));
  }
  const tip = tooltip(el);
  svg.append('g').selectAll('rect').data(data).join('rect').attr('class', 'row-hit')
    .attr('x', (d) => x(d.month)).attr('width', x.bandwidth()).attr('y', mt).attr('height', h - 24 - mt)
    .on('mousemove', (event, d) => tip.show(event, `${monthFmt(monthDate(d.month))} · ${fmtInt(d.total)} answerable tickets`,
      COV.map((k) => `${COV_LABEL[k]}: ${fmtInt(d[k])}`)))
    .on('mouseleave', () => tip.hide());
  el.style.minHeight = `${h}px`;
});

function coverageRows(m) {
  return byIntent(m).map((d) => {
    const ans = new Set(d.rows.filter((r) => r.channel === 'answer').map((r) => r.t.k)).size;
    const af = new Set(d.rows.filter((r) => isAnswerFirst(m, r)).map((r) => r.t.k)).size;
    const from = d.meta.faq_available_from;
    const after = from ? new Set(d.rows.filter((r) => r.t.month >= from.slice(0, 7)).map((r) => r.t.k)).size : 0;
    return { ...d, ans, af, demand: ans + af, after, coverage: d.meta.coverage || '' };
  });
}

dash.draw('c-backlog', (el) => {
  const m = begin(el);
  if (!m) return;
  const items = coverageRows(m).filter((d) => d.coverage !== 'full' && d.demand > 0)
    .sort((a, b) => b.demand - a.demand).slice(0, 20)
    .map((d) => ({ id: d.id, label: d.label, total: d.demand, segs: [{ key: d.coverage, v: d.demand }],
      lines: [`${COV_LABEL[d.coverage]}`, `Answerable tickets: ${fmtInt(d.ans)}`, `Answer-first tickets: ${fmtInt(d.af)}`, d.meta.gap] }));
  if (!items.length) return emptyNote(el, 'No coverage gaps match these filters');
  hbars(el, items, { rowH: 24, keys: COV, color: covColor, pickedId: m.p.intent, onClick: (d) => toggleParam('intent', d.id) });
});

let covSort = { key: 'demand', dir: -1 };
dash.draw('t-coverage', (el) => {
  const m = begin(el, { chart: false });
  if (!m) return;
  const rows = coverageRows(m);
  if (!rows.length) return emptyNote(el, 'No intents match these filters');
  const cols = [
    { key: 'label', label: 'Intent', text: true },
    { key: 'coverage', label: 'Coverage', text: true },
    { key: 'demand', label: 'Doc demand', f: fmtInt },
    { key: 'ans', label: 'Answerable', f: fmtInt },
    { key: 'af', label: 'Answer-first', f: fmtInt },
    { key: 'after', label: 'Tickets after FAQ', f: fmtInt },
    { key: 'gap', label: 'What is missing', text: true },
    { key: 'faqs', label: 'Covering FAQs', text: true },
  ];
  for (const d of rows) { d.gap = d.meta.gap || ''; d.faqs = d.meta.faq_titles || ''; }
  const order = { full: 0, partial: 1, none: 2 };
  rows.sort((a, b) => covSort.dir * (covSort.key === 'coverage' ? order[a.coverage] - order[b.coverage]
    : typeof a[covSort.key] === 'string' ? d3.ascending(a[covSort.key], b[covSort.key]) : a[covSort.key] - b[covSort.key]));
  const table = d3.select(el).append('table').attr('class', 'tsd-table');
  table.append('thead').append('tr').selectAll('th').data(cols).join('th')
    .attr('class', (c) => (c.text ? null : 'num'))
    .attr('aria-sort', (c) => (c.key === covSort.key ? (covSort.dir > 0 ? 'ascending' : 'descending') : 'none'))
    .append('button').attr('type', 'button').text((c) => c.label + (c.key === covSort.key ? (covSort.dir > 0 ? ' ↑' : ' ↓') : ''))
    .on('click', (event, c) => { covSort = { key: c.key, dir: covSort.key === c.key ? -covSort.dir : (c.text ? 1 : -1) }; dash.draw('t-coverage'); });
  const tr = table.append('tbody').selectAll('tr').data(rows).join('tr');
  tr.each(function (d) {
    const row = d3.select(this);
    for (const c of cols) {
      const td = row.append('td').attr('class', c.text ? null : 'num');
      if (c.key === 'coverage') td.append('span').attr('class', `tsd-pill ${d.coverage}`).text(COV_LABEL[d.coverage] ?? '—');
      else if (c.key === 'gap' || c.key === 'faqs') td.append('span').attr('class', 'q').text(d[c.key] || '—');
      else td.text(c.f ? c.f(d[c.key]) : d[c.key]);
    }
  });
});

// Shared with map.js (each page script runs in its own scope).
window.tsd = {
  model, begin, emptyNote, tooltip, resolveColor, textWidth, fitText, byIntent, toggleParam,
  chColor, covColor, CH, CH_LABEL, COV, COV_LABEL, fmtInt, pct, monthFmt, monthDate,
};
