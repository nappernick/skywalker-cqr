// Intent map relationships: time co-movement, same-person sequences, same-ticket co-occurrence; groupings, matrix, time chart.
const T = window.tsd;
// Links between intents, by basis: 'time' = weekly shares rise and fall together (with lead/lag),
// 'person' = same requester's next ticket within 30 days, 'ticket' = raised in the same ticket.
const mapState = { basis: 'time', cut: { time: 0.4, person: 0.05, ticket: 0.05 }, color: 'cluster', metric: 'cosine', land: 'tickets', selected: null };
const CUT_RANGE = { time: [0.1, 0.9], person: [0.01, 0.25], ticket: [0.01, 0.25] };
const WEEK_FROM = '2026-01-05';
const WEEK_TO = '2026-09-21'; // last full week in the export
const MIN_TICKETS_TIME = 20;
const MAP_DRAWS = ['t-groups', 'c-matrix', 'map-tau-value', 'c-timepair'];
const PIN_DRAWS = ['c-matrix', 'c-timepair', 'c-terrain', 'terrain-panel'];
const redrawMap = () => MAP_DRAWS.forEach((n) => dash.draw(n));

// ---------- controls (static in the HTML; scripts only listen and set state) ----------
for (const b of document.querySelectorAll('[data-mapcolor]')) {
  b.addEventListener('click', () => {
    mapState.color = b.dataset.mapcolor;
    for (const o of document.querySelectorAll('[data-mapcolor]')) o.setAttribute('aria-pressed', String(o === b));
    redrawMap();
  });
}
for (const b of document.querySelectorAll('[data-matrix]')) {
  b.addEventListener('click', () => {
    mapState.metric = b.dataset.matrix;
    for (const o of document.querySelectorAll('[data-matrix]')) o.setAttribute('aria-pressed', String(o === b));
    dash.draw('c-matrix');
  });
}
const sliderPos = () => { const [lo, hi] = CUT_RANGE[mapState.basis]; return (mapState.cut[mapState.basis] - lo) / (hi - lo); };
for (const b of document.querySelectorAll('[data-mapbasis]')) {
  b.addEventListener('click', () => {
    mapState.basis = b.dataset.mapbasis;
    for (const o of document.querySelectorAll('[data-mapbasis]')) o.setAttribute('aria-pressed', String(o === b));
    for (const r of document.querySelectorAll('#map-tau')) r.value = String(sliderPos());
    redrawMap();
  });
}
for (const r of document.querySelectorAll('#map-tau')) {
  r.value = String(sliderPos());
  r.addEventListener('input', () => { const [lo, hi] = CUT_RANGE[mapState.basis]; mapState.cut[mapState.basis] = lo + (+r.value) * (hi - lo); redrawMap(); });
}
for (const b of document.querySelectorAll('#map-clear')) b.addEventListener('click', () => { mapState.selected = null; redrawMap(); });

dash.draw('map-tau-value', (el) => { el.textContent = `${mapState.basis === 'time' ? 'r ≥ ' : 'strength ≥ '}${mapState.cut[mapState.basis].toFixed(2)}`; });

// ---------- co-occurrence graph + clustering (cached per filtered model and settings) ----------
let graphCache = { key: null };
const pearson = (x, y) => {
  const n = x.length;
  if (n < 6) return 0;
  const mx = d3.mean(x); const my = d3.mean(y);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) { const a = x[i] - mx; const b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};
function weeklyShares(m) {
  const weeks = [...new Set(m.tickets.map((t) => t.week))].filter((wk) => wk >= WEEK_FROM && wk <= WEEK_TO).sort();
  const wi = new Map(weeks.map((wk, i) => [wk, i]));
  const total = new Array(weeks.length).fill(0);
  const per = new Map();
  for (const t of m.tickets) {
    const i = wi.get(t.week);
    if (i === undefined) continue;
    total[i] += 1;
    for (const id of new Set(t.rows.map((r) => r.intent))) {
      if (!per.has(id)) per.set(id, new Array(weeks.length).fill(0));
      per.get(id)[i] += 1;
    }
  }
  const share = new Map([...per].map(([id, v]) => [id, v.map((c, i) => (total[i] ? c / total[i] : 0))]));
  return { weeks, total, counts: per, share };
}
function graph(m) {
  const tr = dash.data('transitions');
  const cut = mapState.cut[mapState.basis];
  const key = [mapState.basis, cut, tr.status].join('|');
  if (graphCache.m === m && graphCache.key === key) return graphCache.val;
  const n = new Map();
  const pair = new Map();
  for (const t of m.tickets) {
    const s = [...new Set(t.rows.map((r) => r.intent))].sort();
    for (const a of s) n.set(a, (n.get(a) ?? 0) + 1);
    if (mapState.basis !== 'ticket') continue;
    for (let i = 0; i < s.length; i += 1) for (let j = i + 1; j < s.length; j += 1) {
      const k = `${s[i]}|${s[j]}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }
  }
  const N = m.tickets.length || 1;
  let links = [];
  let ws = null;
  if (mapState.basis === 'ticket') {
    links = [...pair].map(([k, v]) => {
      const [a, b] = k.split('|');
      return { a, b, kind: 'ticket', support: v, w: v / Math.sqrt(n.get(a) * n.get(b)), lift: (v * N) / (n.get(a) * n.get(b)), pab: v / n.get(a), pba: v / n.get(b) };
    });
  } else if (mapState.basis === 'person' && tr.status === 'ok') {
    for (const r of tr.data) {
      const a = r.from_intent; const b = r.next_intent_30d;
      const same = String(r.same_intent) === 'true' || r.same_intent === true;
      if (same || !n.has(a) || !n.has(b)) continue;
      const v = +r.transitions;
      links.push({ a, b, kind: 'person', support: v, w: v / Math.sqrt(n.get(a) * n.get(b)), dir: true });
    }
  } else if (mapState.basis === 'time') {
    ws = weeklyShares(m);
    const ids = [...ws.share.keys()].filter((id) => (n.get(id) ?? 0) >= MIN_TICKETS_TIME);
    for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
      const x = ws.share.get(ids[i]); const y = ws.share.get(ids[j]);
      const r0 = pearson(x, y);
      // lead/lag: does one intent's share predict the other's 1-4 weeks later?
      let lag = 0; let rl = r0;
      for (let L = 1; L <= 4; L += 1) {
        const ab = pearson(x.slice(0, -L), y.slice(L));
        const ba = pearson(y.slice(0, -L), x.slice(L));
        if (ab > rl + 0.1) { rl = ab; lag = L; }
        if (ba > rl + 0.1) { rl = ba; lag = -L; }
      }
      const w = Math.max(r0, rl);
      if (w < cut) continue;
      const [lead, follow] = lag >= 0 ? [ids[i], ids[j]] : [ids[j], ids[i]];
      links.push({ a: ids[i], b: ids[j], kind: 'time', w, r: r0, rl, lag: Math.abs(lag), lead: lag ? lead : null, follow: lag ? follow : null });
    }
  }
  if (mapState.basis !== 'time') links = links.filter((l) => l.w >= cut * 0.2);
  const nodes = [...n].map(([id, c]) => ({ id, n: c, meta: m.meta.get(id) })).sort((x, y) => y.n - x.n);
  const val = { nodes, links, N, ws, ...cluster(nodes, links, cut) };
  graphCache = { m, key, val };
  return val;
}

const linkText = (m, l) => {
  const A = m.meta.get(l.a).name; const B = m.meta.get(l.b).name;
  if (l.kind === 'time') {
    return [`Weekly shares move together: r = ${d3.format('.2f')(l.r)}`,
      ...(l.lag ? [`${m.meta.get(l.lead).name} tends to lead ${m.meta.get(l.follow).name} by ${l.lag} week${l.lag > 1 ? 's' : ''} (r = ${d3.format('.2f')(l.rl)})`] : [])];
  }
  if (l.kind === 'person') return [`${T.fmtInt(l.support)} people raised ${B} within 30 days after ${A}`];
  return [`${T.fmtInt(l.support)} shared tickets · lift ${d3.format('.1f')(l.lift)}`, `P(${B} | ${A}) = ${T.pct(l.pab)}`];
};

// Average-linkage agglomerative clustering on co-occurrence strength (cosine), cut at tau.
function cluster(nodes, links, tau) {
  const w = new Map();
  const wk = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const l of links) w.set(wk(l.a, l.b), (w.get(wk(l.a, l.b)) ?? 0) + l.w);
  const sim = (A, B) => {
    let s = 0;
    for (const a of A) for (const b of B) s += w.get(wk(a, b)) ?? 0;
    return s / (A.length * B.length);
  };
  let groups = nodes.map((d) => [d.id]);
  for (;;) {
    let best = null;
    for (let i = 0; i < groups.length; i += 1) for (let j = i + 1; j < groups.length; j += 1) {
      const s = sim(groups[i], groups[j]);
      if (s >= tau && (!best || s > best.s)) best = { i, j, s };
    }
    if (!best) break;
    groups[best.i] = groups[best.i].concat(groups[best.j]);
    groups.splice(best.j, 1);
  }
  const size = new Map(nodes.map((d) => [d.id, d.n]));
  // Order members so neighbours sit together: greedy chain from the largest by strongest tie.
  groups = groups.map((g) => {
    const rest = new Set(g);
    const start = g.reduce((a, b) => (size.get(b) > size.get(a) ? b : a));
    const out = [start];
    rest.delete(start);
    while (rest.size) {
      const last = out[out.length - 1];
      let nxt = null;
      for (const c of rest) if (!nxt || (w.get(wk(last, c)) ?? 0) > (w.get(wk(last, nxt)) ?? 0) || ((w.get(wk(last, c)) ?? 0) === (w.get(wk(last, nxt)) ?? 0) && size.get(c) > size.get(nxt))) nxt = c;
      out.push(nxt);
      rest.delete(nxt);
    }
    return out;
  }).sort((a, b) => (b.length > 1) - (a.length > 1) || d3.sum(b, (x) => size.get(x)) - d3.sum(a, (x) => size.get(x)));
  const groupOf = new Map();
  groups.forEach((g, i) => g.forEach((id) => groupOf.set(id, g.length > 1 ? i : -1)));
  return { groups, groupOf, order: groups.flat(), weight: (a, b) => w.get(wk(a, b)) ?? 0 };
}

// Canvas needs concrete colors: resolve theme tokens, falling back to neutral greys if a token can't be read.
const rc = (el, c, fb) => {
  const v = T.resolveColor(el, c);
  return d3.color(v) ? d3.color(v).formatRgb() : fb;
};
const FALLBACK_SERIES = ['#3b7dd8', '#d9822b', '#3a9e6f', '#b04aa0', '#c9a227', '#5b6bbf', '#c0504d', '#4aa3a2'];
function palette(el, g) {
  const fg = rc(el, 'var(--color-fg)', '#222');
  const muted = rc(el, 'var(--cds-chart-muted)', '#9a9a9a');
  const series = dash.colors.map((c, i) => rc(el, c, FALLBACK_SERIES[i % FALLBACK_SERIES.length]));
  const chan = Object.fromEntries(T.CH.map((c, i) => [c, rc(el, T.chColor(c), FALLBACK_SERIES[i])]));
  const cov = Object.fromEntries(T.COV.map((c, i) => [c, rc(el, T.covColor(c), ['#3a9e6f', '#c9a227', '#c0504d'][i])]));
  const domains = [...new Set(g.nodes.map((d) => d.meta.domain))].sort();
  const color = (d) => {
    if (mapState.color === 'domain') return series[domains.indexOf(d.meta.domain) % series.length];
    if (mapState.color === 'channel') return chan[d.meta.best_channel] ?? muted;
    if (mapState.color === 'coverage') return cov[d.meta.coverage] ?? muted;
    const gi = g.groupOf.get(d.id);
    return gi >= 0 ? series[gi % series.length] : muted;
  };
  return { fg, muted, color, fgMuted: rc(el, 'var(--color-fg-muted)', '#6b6b6b'), font: getComputedStyle(el).fontFamily || 'sans-serif' };
}

const groupKey = (g, d) => (mapState.color === 'domain' ? d.meta.domain : `g${g.groupOf.get(d.id)}:${g.groupOf.get(d.id) < 0 ? d.id : ''}`);
const groupName = (g, gi) => {
  const ms = g.groups[gi];
  const lead = g.nodes.find((d) => d.id === ms[0]);
  return ms.length > 1 ? `${lead.meta.name} +${ms.length - 1}` : lead.meta.name;
};

function neighbours(g, id) {
  const out = new Map();
  for (const l of g.links) {
    if (l.a === id) out.set(l.b, l);
    else if (l.b === id) out.set(l.a, l);
  }
  return out;
}

const shiftFilter = (e, id) => { if (e.shiftKey) { T.toggleParam('intent', id); return true; } return false; };

// ---------- groupings ----------
dash.draw('t-groups', (el) => {
  const m = T.begin(el, { chart: false });
  if (!m) return;
  const g = graph(m);
  const multi = g.groups.map((ms, i) => ({ ms, i })).filter((x) => x.ms.length > 1);
  if (!multi.length) return T.emptyNote(el, 'No groupings at this threshold; lower it to merge more intents');
  const pal = palette(el, g);
  const rows = multi.map(({ ms, i }) => {
    const set = new Set(ms);
    const tk = m.tickets.filter((t) => t.rows.some((r) => set.has(r.intent)));
    const ans = tk.filter((t) => t.rows.some((r) => set.has(r.intent) && r.channel === 'answer')).length;
    const internal = g.links.filter((l) => set.has(l.a) && set.has(l.b));
    return { i, ms, tickets: tk.length, ans, tie: d3.mean(internal, (l) => l.w) ?? 0 };
  });
  const tbl = d3.select(el).append('table').attr('class', 'tsd-table');
  tbl.append('thead').append('tr').selectAll('th').data(['Group', 'Intents in it', 'Tickets', 'Answerable', 'Mean tie']).join('th')
    .attr('class', (x, i) => (i >= 2 ? 'num' : null)).text((x) => x);
  const tr = tbl.append('tbody').selectAll('tr').data(rows).join('tr').style('cursor', 'pointer')
    .on('click', (e, d) => { mapState.selected = d.ms[0]; PIN_DRAWS.forEach((n) => dash.draw(n)); });
  const first = tr.append('td');
  first.append('span').attr('class', 'sw').style('background', (d) => pal.color(g.nodes.find((x) => x.id === d.ms[0]))).style('margin-right', '6px');
  first.append('span').text((d) => groupName(g, d.i));
  tr.append('td').append('span').attr('class', 'q').text((d) => d.ms.map((id) => m.meta.get(id).name).join(' · '));
  tr.append('td').attr('class', 'num').text((d) => T.fmtInt(d.tickets));
  tr.append('td').attr('class', 'num').text((d) => T.pct(d.ans / (d.tickets || 1)));
  tr.append('td').attr('class', 'num').text((d) => d3.format('.2f')(d.tie));
});

// ---------- co-occurrence matrix (zoom + pan) ----------
dash.draw('c-matrix', (el) => {
  const m = T.begin(el);
  if (!m) return;
  const g = graph(m);
  const ids = g.order.filter((id) => g.links.some((l) => l.a === id || l.b === id));
  if (ids.length < 2) return T.emptyNote(el, 'Too few co-occurring intents in view');
  const w = Math.max(320, el.clientWidth);
  const svg0 = d3.select(el).append('svg').attr('width', '100%');
  const L = Math.min(d3.max(ids, (id) => T.textWidth(svg0, m.meta.get(id).name)), w * 0.32) + 10;
  const cell = Math.max(5, Math.min(16, (w - L - 8) / ids.length));
  const h = cell * ids.length + 8;
  svg0.attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);
  const pos = new Map(ids.map((id, i) => [id, i]));
  const vals = new Map();
  for (const l of g.links) {
    if (!pos.has(l.a) || !pos.has(l.b)) continue;
    const v = l.kind !== 'ticket' || mapState.metric === 'cosine' ? l.w : mapState.metric === 'support' ? l.support : Math.log2(1 + (l.lift ?? 0));
    for (const [a, b] of [[l.a, l.b], [l.b, l.a]]) {
      const k = `${a}|${b}`;
      const prev = vals.get(k);
      vals.set(k, { v: (prev?.v ?? 0) + v, l: prev?.l ?? l });
    }
  }
  const vmax = d3.max([...vals.values()], (x) => x.v) || 1;
  const ramp = d3.interpolateRgb(rc(el, 'var(--color-panel)', '#ffffff'), rc(el, dash.colors[0], FALLBACK_SERIES[0]));
  const pal = palette(el, g);
  const z = svg0.append('g');
  const labels = z.append('g');
  ids.forEach((id, i) => {
    const t = labels.append('text').attr('x', L - 8).attr('y', i * cell + cell / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
      .style('font-size', `${Math.min(12, cell)}px`).text(m.meta.get(id).name);
    T.fitText(t, L - 10);
    if (id === mapState.selected) t.attr('font-weight', 600);
  });
  z.append('g').selectAll('rect').data(ids).join('rect')
    .attr('x', (id, i) => L + i * cell).attr('y', (id, i) => i * cell).attr('width', cell - 1).attr('height', cell - 1)
    .style('fill', (id) => pal.color(g.nodes.find((x) => x.id === id))).attr('fill-opacity', 0.55);
  // Group blocks along the diagonal.
  for (const ms of g.groups.filter((x) => x.length > 1)) {
    const inView = ms.filter((id) => pos.has(id));
    if (inView.length < 2) continue;
    const a = d3.min(inView, (id) => pos.get(id)); const b = d3.max(inView, (id) => pos.get(id));
    z.append('rect').attr('x', L + a * cell - 1).attr('y', a * cell - 1).attr('width', (b - a + 1) * cell + 1).attr('height', (b - a + 1) * cell + 1)
      .style('fill', 'none').style('stroke', 'var(--color-fg-muted)').attr('stroke-width', 1).attr('stroke-dasharray', '2 2');
  }
  const tip = T.tooltip(el);
  const cells = [...vals].map(([k, x]) => { const [a, b] = k.split('|'); return { a, b, ...x }; });
  z.append('g').selectAll('rect').data(cells).join('rect')
    .attr('x', (d) => L + pos.get(d.b) * cell).attr('y', (d) => pos.get(d.a) * cell).attr('width', cell - 1).attr('height', cell - 1)
    .attr('rx', 1).style('fill', (d) => ramp(Math.min(1, 0.15 + (d.v / vmax) * 0.85)))
    .style('stroke', (d) => (d.a === mapState.selected || d.b === mapState.selected ? 'var(--color-fg)' : 'none'))
    .style('cursor', 'pointer')
    .on('mousemove', (e, d) => {
      const l = d.l;
      tip.show(e, `${m.meta.get(d.a).name} ↔ ${m.meta.get(d.b).name}`, linkText(m, l));
    })
    .on('mouseleave', () => tip.hide())
    .on('click', (e, d) => {
      if (shiftFilter(e, d.a)) return;
      mapState.selected = d.a;
      PIN_DRAWS.forEach((n) => dash.draw(n));
    });
  svg0.call(d3.zoom().scaleExtent([1, 10]).translateExtent([[0, 0], [w, h]]).on('zoom', (e) => z.attr('transform', e.transform)));
  el.style.minHeight = `${h}px`;
});

// ---------- rising and falling together: selected intent vs its strongest time partners ----------
dash.draw('c-timepair', (el) => {
  const m = T.begin(el);
  if (!m) return;
  const saved = mapState.basis;
  mapState.basis = 'time';
  const g = graph(m);
  mapState.basis = saved;
  const ws = g.ws;
  if (!ws || ws.weeks.length < 6) return T.emptyNote(el, 'Too few weeks in view to compare');
  const deg = (id) => g.links.filter((l) => l.a === id || l.b === id).length;
  const focus = (mapState.selected && ws.share.has(mapState.selected) ? mapState.selected : null)
    ?? [...g.nodes].filter((d) => ws.share.has(d.id)).sort((a, b) => deg(b.id) - deg(a.id) || b.n - a.n)[0]?.id;
  if (!focus) return T.emptyNote(el, 'No intents to compare');
  const partners = [...neighbours(g, focus)].sort((a, b) => b[1].w - a[1].w).slice(0, 3);
  const ids = [focus, ...partners.map(([k]) => k)];
  const z = (v) => { const mu = d3.mean(v); const sd = d3.deviation(v) || 1; return v.map((x) => (x - mu) / sd); };
  const series = ids.map((id, i) => ({ id, name: m.meta.get(id).name, v: z(ws.share.get(id)), raw: ws.counts.get(id), link: i ? partners[i - 1][1] : null }));
  const w = Math.max(320, el.clientWidth);
  const h = 300;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('height', h);
  const dates = ws.weeks.map((wk) => new Date(`${wk}T00:00:00Z`));
  const right = Math.min(w * 0.38, d3.max(series, (s) => T.textWidth(svg, s.name)) + 14);
  const x = d3.scaleUtc(d3.extent(dates), [8, w - right]);
  const ext = d3.extent(series.flatMap((s) => s.v));
  const y = d3.scaleLinear([Math.min(-2, ext[0]), Math.max(2, ext[1])], [h - 24, 10]);
  svg.append('g').selectAll('line').data([-2, 0, 2]).join('line').attr('x1', 8).attr('x2', w - right).attr('y1', y).attr('y2', y)
    .style('stroke', (v) => (v ? 'var(--cds-chart-grid)' : 'var(--cds-chart-axis)'));
  svg.append('g').selectAll('text').data(x.ticks(Math.max(2, Math.floor(w / 110)))).join('text').attr('class', 'muted')
    .attr('x', x).attr('y', h - 6).attr('text-anchor', 'middle').text(d3.utcFormat('%b %-d'));
  const cols = series.map((s, i) => (i === 0 ? 'var(--color-fg)' : dash.colors[i - 1]));
  const line = d3.line().x((d, i) => x(dates[i])).y((d) => y(d));
  svg.append('g').selectAll('path').data(series).join('path').attr('d', (s) => line(s.v))
    .style('fill', 'none').style('stroke', (s, i) => cols[i]).attr('stroke-width', (s, i) => (i ? 1.6 : 2.6))
    .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('stroke-opacity', (s, i) => (i ? 0.85 : 1));
  // end labels, nudged apart
  const ends = series.map((s, i) => ({ s, i, y: y(s.v[s.v.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k += 1) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  for (const e of ends) {
    const t = svg.append('text').attr('x', w - right + 6).attr('y', e.y).attr('dy', '0.35em').style('fill', cols[e.i]).attr('font-weight', e.i ? null : 600).text(e.s.name);
    T.fitText(t, right - 8);
  }
  const tip = T.tooltip(el);
  const rule = svg.append('line').attr('y1', 10).attr('y2', h - 24).style('stroke', 'var(--cds-chart-reference)').style('display', 'none');
  svg.append('rect').attr('x', 8).attr('y', 0).attr('width', w - right - 8).attr('height', h - 24).style('fill', 'transparent')
    .on('mousemove', (e) => {
      const [px] = d3.pointer(e, svg.node());
      const i = d3.minIndex(dates, (d) => Math.abs(x(d) - px));
      rule.attr('x1', x(dates[i])).attr('x2', x(dates[i])).style('display', null);
      tip.show(e, `Week of ${d3.utcFormat('%b %-d, %Y')(dates[i])}`, series.map((s) => `${s.name}: ${T.fmtInt(s.raw[i])} tickets (${T.pct(ws.share.get(s.id)[i])} of week)`));
    })
    .on('mouseleave', () => { tip.hide(); rule.style('display', 'none'); });
  const notes = d3.select(el).append('ul').attr('class', 'tsd-links');
  notes.selectAll('li').data(series.slice(1)).join('li').text((s) => `${s.name}: ${linkText(m, s.link).join(' · ')}`);
  el.style.minHeight = `${h}px`;
});

window.tsdMap = { mapState, PIN_DRAWS };
