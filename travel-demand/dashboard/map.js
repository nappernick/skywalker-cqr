// Intent map: co-occurrence constellation (3D), groupings, matrix, zoomable density pack and 3D landscape.
const T = window.tsd;
// Links between intents, by basis: 'time' = weekly shares rise and fall together (with lead/lag),
// 'person' = same requester's next ticket within 30 days, 'ticket' = raised in the same ticket.
const mapState = { basis: 'time', cut: { time: 0.4, person: 0.05, ticket: 0.05 }, color: 'cluster', metric: 'cosine', land: 'tickets', selected: null };
const CUT_RANGE = { time: [0.1, 0.9], person: [0.01, 0.25], ticket: [0.01, 0.25] };
const WEEK_FROM = '2026-01-05';
const WEEK_TO = '2026-09-21'; // last full week in the export
const MIN_TICKETS_TIME = 20;
const MAP_DRAWS = ['c-constellation', 'map-selected', 't-groups', 'c-matrix', 'c-pack', 'c-landscape', 'map-tau-value', 'c-timepair'];
const PIN_DRAWS = ['c-constellation', 'map-selected', 'c-matrix', 'c-landscape', 'c-timepair'];
const redrawMap = () => MAP_DRAWS.forEach((n) => dash.draw(n));
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
for (const b of document.querySelectorAll('[data-land]')) {
  b.addEventListener('click', () => {
    mapState.land = b.dataset.land;
    for (const o of document.querySelectorAll('[data-land]')) o.setAttribute('aria-pressed', String(o === b));
    dash.draw('c-landscape');
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

// ---------- tiny orbit-camera 3D renderer on canvas ----------
const views = new Map();
function orbit(el, viewKey, h, render, handlers = {}) {
  const w = Math.max(300, el.clientWidth);
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  Object.assign(canvas.style, { width: '100%', height: `${h}px`, display: 'block', touchAction: 'none', cursor: 'grab' });
  canvas.tabIndex = 0;
  el.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const home = { yaw: 0.7, pitch: 0.38, zoom: 1, px: 0, py: 0, touched: false };
  const v = views.get(viewKey) ?? { ...home };
  views.set(viewKey, v);
  const F = 3.2;
  const project = (x, y, z) => {
    const cy = Math.cos(v.yaw); const sy = Math.sin(v.yaw);
    const cp = Math.cos(v.pitch); const sp = Math.sin(v.pitch);
    const x1 = x * cy - z * sy; const z1 = x * sy + z * cy;
    const y2 = y * cp - z1 * sp; const z2 = y * sp + z1 * cp;
    const depth = z2 + F;
    const s = (Math.min(w, h) * 0.42 * v.zoom * F) / Math.max(0.3, depth);
    return { x: w / 2 + v.px + x1 * s, y: h / 2 + v.py - y2 * s, depth, s: s / (Math.min(w, h) * 0.42 * v.zoom) };
  };
  const api = { ctx, w, h, project, view: v, canvas };
  const paint = () => { ctx.clearRect(0, 0, w, h); render(api); };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    v.touched = true;
    drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.shiftKey || e.button === 2 };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { handlers.hover?.(e, api); return; }
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) { v.px += dx; v.py += dy; } else { v.yaw += dx * 0.008; v.pitch = Math.max(-1.45, Math.min(1.45, v.pitch + dy * 0.008)); }
    handlers.leave?.();
    paint();
  });
  const end = (e) => {
    if (drag && drag.moved < 4) handlers.click?.(e, api);
    drag = null;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => handlers.leave?.());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    v.touched = true;
    v.zoom = Math.max(0.4, Math.min(8, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    paint();
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { Object.assign(v, home, { touched: true }); paint(); });
  canvas.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key];
    if (step) { e.preventDefault(); v.touched = true; v.yaw += step[0]; v.pitch = Math.max(-1.45, Math.min(1.45, v.pitch + step[1])); paint(); }
    if (e.key === '+' || e.key === '=') { v.zoom = Math.min(8, v.zoom * 1.15); paint(); }
    if (e.key === '-') { v.zoom = Math.max(0.4, v.zoom / 1.15); paint(); }
  });
  paint();
  if (!reduceMotion && !v.touched) {
    const spin = () => {
      if (!canvas.isConnected || v.touched) return;
      if (!document.hidden && canvas.offsetParent !== null) { v.yaw += 0.0025; paint(); }
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  }
  api.paint = paint;
  return api;
}

// ---------- 3D force layout ----------
let layoutCache = { key: null };
function layout3d(g) {
  const key = g.nodes.map((d) => d.id).join(',') + '|' + g.links.length + '|' + mapState.color + '|' + mapState.basis + '|' + mapState.cut[mapState.basis];
  if (layoutCache.key === key && layoutCache.g === g) return layoutCache.pos;
  const keys = [...new Set(g.nodes.map((d) => groupKey(g, d)))];
  const sphere = (i, k) => {
    const y = 1 - (2 * (i + 0.5)) / k;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  };
  const anchors = new Map(keys.map((k, i) => [k, sphere(i, keys.length).map((c) => c * 0.75)]));
  const P = g.nodes.map((d, i) => {
    const a = anchors.get(groupKey(g, d));
    const j = sphere(i, g.nodes.length);
    return { id: d.id, n: d.n, x: a[0] + j[0] * 0.15, y: a[1] + j[1] * 0.15, z: a[2] + j[2] * 0.15, vx: 0, vy: 0, vz: 0, a };
  });
  const idx = new Map(P.map((p, i) => [p.id, i]));
  const maxW = d3.max(g.links, (l) => l.w) || 1;
  for (let it = 0; it < 320; it += 1) {
    const alpha = 1 - it / 320;
    for (let i = 0; i < P.length; i += 1) for (let j = i + 1; j < P.length; j += 1) {
      const p = P[i]; const q = P[j];
      let dx = p.x - q.x; let dy = p.y - q.y; let dz = p.z - q.z;
      const d2 = dx * dx + dy * dy + dz * dz + 0.004;
      const f = (0.0016 * alpha) / d2;
      dx *= f; dy *= f; dz *= f;
      p.vx += dx; p.vy += dy; p.vz += dz; q.vx -= dx; q.vy -= dy; q.vz -= dz;
    }
    for (const l of g.links) {
      const p = P[idx.get(l.a)]; const q = P[idx.get(l.b)];
      const dx = q.x - p.x; const dy = q.y - p.y; const dz = q.z - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
      const k = 0.06 * alpha * Math.min(1, l.w / maxW + 0.15) * (d - 0.22) / d;
      p.vx += dx * k; p.vy += dy * k; p.vz += dz * k; q.vx -= dx * k; q.vy -= dy * k; q.vz -= dz * k;
    }
    for (const p of P) {
      p.vx += (p.a[0] - p.x) * 0.012 * alpha; p.vy += (p.a[1] - p.y) * 0.012 * alpha; p.vz += (p.a[2] - p.z) * 0.012 * alpha;
      p.vx *= 0.6; p.vy *= 0.6; p.vz *= 0.6;
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
    }
  }
  const r = d3.max(P, (p) => Math.hypot(p.x, p.y, p.z)) || 1;
  const pos = new Map(P.map((p) => [p.id, [p.x / r, p.y / r, p.z / r]]));
  layoutCache = { key, g, pos };
  return pos;
}

function neighbours(g, id) {
  const out = new Map();
  for (const l of g.links) {
    if (l.a === id) out.set(l.b, l);
    else if (l.b === id) out.set(l.a, l);
  }
  return out;
}

const shiftFilter = (e, id) => { if (e.shiftKey) { T.toggleParam('intent', id); return true; } return false; };

// ---------- constellation ----------
dash.draw('c-constellation', (el) => {
  const m = T.begin(el);
  if (!m) return;
  const g = graph(m);
  if (!g.nodes.length) return T.emptyNote(el, 'No intents match these filters');
  const pos = layout3d(g);
  const pal = palette(el, g);
  const tip = T.tooltip(el);
  const maxN = d3.max(g.nodes, (d) => d.n);
  const rad = d3.scaleSqrt([0, maxN], [2.5, 26]);
  const labelled = new Set(g.nodes.slice(0, 10).map((d) => d.id));
  let hover = null;
  let screen = [];
  const sel = mapState.selected && pos.has(mapState.selected) ? mapState.selected : null;
  const near = sel ? neighbours(g, sel) : null;
  const render = ({ ctx, project }) => {
    const pts = new Map(g.nodes.map((d) => [d.id, project(...pos.get(d.id))]));
    ctx.lineCap = 'round';
    for (const l of g.links) {
      const a = pts.get(l.a); const b = pts.get(l.b);
      const on = sel && (l.a === sel || l.b === sel);
      const alpha = sel ? (on ? 0.85 : 0.04) : Math.min(0.55, 0.08 + l.w * 1.6);
      ctx.strokeStyle = d3.color(on ? pal.color(g.nodes.find((d) => d.id === sel)) : pal.fgMuted).copy({ opacity: alpha }).formatRgb();
      ctx.lineWidth = Math.max(0.6, (l.kind === 'time' ? 1 + l.w * 4 : Math.log2(1 + l.support) * 0.9) * Math.min(a.s, b.s));
      ctx.setLineDash(l.kind === 'time' && l.lag ? [6, 3] : l.kind === 'person' ? [2, 3] : []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);
    const order = [...g.nodes].sort((p, q) => pts.get(q.id).depth - pts.get(p.id).depth);
    screen = [];
    for (const d of order) {
      const p = pts.get(d.id);
      const r = rad(d.n) * p.s;
      const dim = sel && d.id !== sel && !near.has(d.id);
      const c = d3.color(pal.color(d));
      const grad = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
      grad.addColorStop(0, c.brighter(0.9).copy({ opacity: dim ? 0.15 : 0.95 }).formatRgb());
      grad.addColorStop(1, c.darker(0.4).copy({ opacity: dim ? 0.12 : 0.9 }).formatRgb());
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      if (d.id === sel || d.id === hover) { ctx.lineWidth = 2; ctx.strokeStyle = pal.fg; ctx.stroke(); }
      screen.push({ d, x: p.x, y: p.y, r });
    }
    ctx.font = `12px ${pal.font}`;
    ctx.textBaseline = 'middle';
    for (const s of screen) {
      const show = s.d.id === hover || s.d.id === sel || (sel ? near.has(s.d.id) : labelled.has(s.d.id));
      if (!show) continue;
      ctx.fillStyle = pal.fg;
      ctx.globalAlpha = 0.95;
      ctx.fillText(s.d.meta.name, s.x + s.r + 4, s.y);
      ctx.globalAlpha = 1;
    }
  };
  const pick = (e, api) => {
    const r = api.canvas.getBoundingClientRect();
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    let best = null;
    for (const s of screen) { const dd = Math.hypot(s.x - x, s.y - y); if (dd <= s.r + 4 && (!best || dd < best.dd)) best = { ...s, dd }; }
    return best;
  };
  orbit(el, 'constellation', 520, render, {
    hover: (e, api) => {
      const p = pick(e, api);
      const id = p ? p.d.id : null;
      if (id !== hover) { hover = id; api.paint(); }
      if (p) {
        const nb = neighbours(g, p.d.id);
        const top = [...nb].sort((a, b) => b[1].w - a[1].w).slice(0, 3).map(([k, l]) => `↔ ${m.meta.get(k).name} (${l.kind === 'time' ? `r ${d3.format('.2f')(l.r)}` : T.fmtInt(l.support)})`);
        tip.show(e, p.d.meta.name, [`${T.fmtInt(p.d.n)} tickets · ${nb.size} linked intents`, ...top]);
      } else tip.hide();
    },
    leave: () => tip.hide(),
    click: (e, api) => {
      const p = pick(e, api);
      if (p && shiftFilter(e, p.d.id)) return;
      mapState.selected = p ? (mapState.selected === p.d.id ? null : p.d.id) : null;
      PIN_DRAWS.forEach((n) => dash.draw(n));
    },
  });
  el.style.minHeight = '520px';
});

dash.draw('map-selected', (el) => {
  const m = T.model();
  el.replaceChildren();
  if (!m || m.failed || !mapState.selected) return;
  const g = graph(m);
  const d = g.nodes.find((x) => x.id === mapState.selected);
  if (!d) return;
  const box = d3.select(el);
  box.append('h3').attr('class', 'tsd-sel-name').text(d.meta.name);
  const gi = g.groupOf.get(d.id);
  box.append('p').attr('class', 'sub').text(`${T.fmtInt(d.n)} tickets in view · ${d.meta.domain} · ${gi >= 0 ? `group: ${groupName(g, gi)}` : 'no group at this threshold'}`);
  if (d.meta.coverage) box.append('span').attr('class', `tsd-pill ${d.meta.coverage}`).text(T.COV_LABEL[d.meta.coverage]);
  const nb = [...neighbours(g, d.id)].sort((a, b) => b[1].w - a[1].w).slice(0, 8);
  if (!nb.length) { box.append('p').attr('class', 'sub').text(mapState.basis === 'time' ? `No intent's weekly volume tracks this one at r ≥ ${mapState.cut.time.toFixed(2)}${d.n < MIN_TICKETS_TIME ? ` (needs ${MIN_TICKETS_TIME}+ tickets to compare)` : ''}.` : 'No links to this intent at this threshold.'); return; }
  const ul = box.append('ul').attr('class', 'tsd-links');
  const li = ul.selectAll('li').data(nb).join('li');
  li.append('b').text(([k]) => m.meta.get(k).name);
  li.append('span').attr('class', 'q').text(([, l]) => linkText(m, l).join(' · '));
});

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

// ---------- zoomable circle pack: group -> intent -> channel ----------
dash.draw('c-pack', (el) => {
  const m = T.begin(el);
  if (!m) return;
  const g = graph(m);
  const intents = T.byIntent(m);
  if (!intents.length) return T.emptyNote(el, 'No tickets match these filters');
  const pal = palette(el, g);
  const byGroup = d3.groups(intents, (d) => (mapState.color === 'domain' || mapState.color === 'channel' || mapState.color === 'coverage'
    ? d.meta.domain : (g.groupOf.get(d.id) >= 0 ? groupName(g, g.groupOf.get(d.id)) : 'Ungrouped intents')));
  const data = {
    name: 'All needs',
    children: byGroup.map(([name, ds]) => ({
      name,
      children: ds.map((d) => ({
        name: d.label, id: d.id, node: g.nodes.find((x) => x.id === d.id),
        children: d3.rollups(d.rows, (v) => v.length, (r) => r.channel).map(([c, v]) => ({ name: T.CH_LABEL[c], channel: c, value: v })),
      })),
    })),
  };
  const size = Math.max(300, Math.min(el.clientWidth, 640));
  const root = d3.pack().size([size, size]).padding((d) => (d.depth === 0 ? 6 : d.depth === 1 ? 4 : 1.5))(
    d3.hierarchy(data).sum((d) => d.value ?? 0).sort((a, b) => b.value - a.value));
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`)
    .attr('height', size).style('cursor', 'zoom-out');
  const tip = T.tooltip(el);
  const nodes = root.descendants().slice(1);
  const fillOf = (d) => {
    if (d.depth === 3) return T.chColor(d.data.channel);
    if (d.depth === 2) return pal.color(d.data.node ?? { id: d.data.id, meta: m.meta.get(d.data.id) });
    return 'var(--cds-chart-grid)';
  };
  const circle = svg.append('g').selectAll('circle').data(nodes).join('circle')
    .style('fill', fillOf)
    .attr('fill-opacity', (d) => (d.depth === 1 ? 0.5 : d.depth === 2 ? 0.28 : 0.9))
    .style('stroke', (d) => (d.depth === 2 ? fillOf(d) : 'none')).attr('stroke-width', 1)
    .style('cursor', (d) => (d.children ? 'zoom-in' : 'pointer'))
    .on('mousemove', (e, d) => {
      const lines = d.depth === 3 ? [`${T.fmtInt(d.value)} needs (${T.pct(d.value / d.parent.value)} of this intent)`]
        : [`${T.fmtInt(d.value)} needs · ${T.pct(d.value / root.value)} of all in view`, ...(d.depth === 1 ? [`${d.children.length} intents`] : [])];
      tip.show(e, d.depth === 3 ? `${d.parent.data.name} · ${d.data.name}` : d.data.name, lines);
    })
    .on('mouseleave', () => tip.hide())
    .on('click', (e, d) => {
      e.stopPropagation();
      const target = d.depth === 3 ? d.parent : d;
      if (target.depth === 2 && shiftFilter(e, target.data.id)) return;
      if (target.depth === 2) { mapState.selected = target.data.id; PIN_DRAWS.forEach((n) => dash.draw(n)); }
      zoomTo(focus === target ? target.parent ?? root : target);
    });
  const label = svg.append('g').attr('pointer-events', 'none').attr('text-anchor', 'middle').selectAll('text').data(nodes).join('text')
    .style('font-size', (d) => (d.depth === 1 ? '13px' : '11px')).attr('font-weight', (d) => (d.depth === 1 ? 600 : null))
    .text((d) => d.data.name);
  let focus = root;
  let view;
  const zoomView = (v) => {
    const k = size / v[2];
    view = v;
    label.attr('transform', (d) => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
    circle.attr('transform', (d) => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`).attr('r', (d) => d.r * k);
    label.style('display', (d) => {
      if (d.parent !== focus) return 'none';
      return d.r * k * 2 > Math.min(160, d.data.name.length * 6.2) ? null : 'none';
    });
  };
  function zoomTo(d) {
    focus = d;
    const tr = svg.transition().duration(reduceMotion ? 0 : 650).tween('zoom', () => {
      const i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2]);
      return (t) => zoomView(i(t));
    });
    tr.on('end', () => zoomView([focus.x, focus.y, focus.r * 2]));
  }
  svg.on('click', () => zoomTo(focus.parent ?? root));
  zoomView([root.x, root.y, root.r * 2]);
  el.style.minHeight = `${size}px`;
});

// ---------- 3D density landscape: intent x month x tickets ----------
dash.draw('c-landscape', (el) => {
  const m = T.begin(el);
  if (!m) return;
  const g = graph(m);
  const pal = palette(el, g);
  const months = m.months.filter((x) => x >= '2026-01' && (!m.p.from || x >= m.p.from) && (!m.p.to || x <= m.p.to));
  const rank = new Map(g.order.map((id, i) => [id, i]));
  const top = T.byIntent(m).slice(0, 24).sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  if (!top.length || !months.length) return T.emptyNote(el, 'No tickets match these filters');
  const cells = [];
  for (const d of top) {
    const use = mapState.land === 'answerable' ? d.rows.filter((r) => r.channel === 'answer') : d.rows;
    const c = d3.rollup(use, (v) => new Set(v.map((r) => r.t.k)).size, (r) => r.t.month);
    for (const mo of months) cells.push({ d, mo, v: c.get(mo) ?? 0 });
  }
  const vmax = d3.max(cells, (c) => c.v) || 1;
  const nx = top.length; const nz = months.length;
  const span = 1.7;
  const gx = span / Math.max(nx, nz);
  const bw = gx * 0.72;
  const X = (i) => (i - (nx - 1) / 2) * gx;
  const Z = (j) => (j - (nz - 1) / 2) * gx;
  const H = 0.9;
  const base = -0.35;
  const tip = T.tooltip(el);
  let hover = null;
  let tops = [];
  const render = ({ ctx, project }) => {
    // floor grid
    ctx.strokeStyle = d3.color(pal.fgMuted).copy({ opacity: 0.25 }).formatRgb();
    ctx.lineWidth = 1;
    for (let j = 0; j <= nz; j += 1) {
      const a = project(X(-0.5), base, Z(j - 0.5)); const b = project(X(nx - 0.5), base, Z(j - 0.5));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let i = 0; i <= nx; i += 1) {
      const a = project(X(i - 0.5), base, Z(-0.5)); const b = project(X(i - 0.5), base, Z(nz - 0.5));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    const boxes = cells.filter((c) => c.v > 0).map((c) => {
      const i = top.indexOf(c.d); const j = months.indexOf(c.mo);
      const x0 = X(i) - bw / 2; const x1 = X(i) + bw / 2; const z0 = Z(j) - bw / 2; const z1 = Z(j) + bw / 2;
      const y1 = base + (c.v / vmax) * H;
      return { c, x0, x1, z0, z1, y1, depth: project(X(i), base + (y1 - base) / 2, Z(j)).depth };
    }).sort((a, b) => b.depth - a.depth);
    tops = [];
    for (const b of boxes) {
      const col = d3.color(pal.color(b.c.d.node ?? g.nodes.find((x) => x.id === b.c.d.id) ?? { id: b.c.d.id, meta: b.c.d.meta }));
      const sel = mapState.selected && b.c.d.id !== mapState.selected;
      const P = (x, y, z) => project(x, y, z);
      const faces = [
        { pts: [P(b.x0, b.y1, b.z0), P(b.x1, b.y1, b.z0), P(b.x1, b.y1, b.z1), P(b.x0, b.y1, b.z1)], shade: 0.5 },
        { pts: [P(b.x0, base, b.z0), P(b.x1, base, b.z0), P(b.x1, b.y1, b.z0), P(b.x0, b.y1, b.z0)], shade: -0.3 },
        { pts: [P(b.x0, base, b.z1), P(b.x1, base, b.z1), P(b.x1, b.y1, b.z1), P(b.x0, b.y1, b.z1)], shade: -0.3 },
        { pts: [P(b.x0, base, b.z0), P(b.x0, base, b.z1), P(b.x0, b.y1, b.z1), P(b.x0, b.y1, b.z0)], shade: -0.6 },
        { pts: [P(b.x1, base, b.z0), P(b.x1, base, b.z1), P(b.x1, b.y1, b.z1), P(b.x1, b.y1, b.z0)], shade: -0.6 },
      ].map((f) => ({ ...f, depth: d3.mean(f.pts, (p) => p.depth) })).sort((a, c) => c.depth - a.depth);
      const isHover = hover && hover.c === b.c;
      for (const f of faces) {
        const cc = (f.shade >= 0 ? col.brighter(f.shade) : col.darker(-f.shade)).copy({ opacity: sel ? 0.18 : 0.92 });
        ctx.fillStyle = cc.formatRgb();
        ctx.beginPath();
        f.pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath(); ctx.fill();
        if (isHover) { ctx.strokeStyle = pal.fg; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
      const tc = project((b.x0 + b.x1) / 2, b.y1, (b.z0 + b.z1) / 2);
      tops.push({ c: b.c, x: tc.x, y: tc.y });
    }
    // month labels along the front edge, intent labels along the side
    ctx.font = `11px ${pal.font}`;
    ctx.fillStyle = pal.fgMuted;
    ctx.textAlign = 'center';
    months.forEach((mo, j) => { const p = project(X(nx - 0.5) + gx * 0.9, base, Z(j)); ctx.fillText(T.monthFmt(T.monthDate(mo)), p.x, p.y); });
    ctx.textAlign = 'left';
    const lab = top.slice().sort((a, b) => b.total - a.total).slice(0, 8).map((d) => d.id);
    top.forEach((d, i) => {
      if (!lab.includes(d.id) && d.id !== mapState.selected) return;
      const p = project(X(i), base, Z(-0.5) - gx * 0.9);
      ctx.fillStyle = d.id === mapState.selected ? pal.fg : pal.fgMuted;
      ctx.fillText(d.label, p.x, p.y);
    });
  };
  const pick = (e, api) => {
    const r = api.canvas.getBoundingClientRect();
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    let best = null;
    for (const t of tops) { const dd = Math.hypot(t.x - x, t.y - y); if (dd < 14 && (!best || dd < best.dd)) best = { ...t, dd }; }
    return best;
  };
  orbit(el, 'landscape', 480, render, {
    hover: (e, api) => {
      const p = pick(e, api);
      if ((p?.c ?? null) !== (hover?.c ?? null)) { hover = p; api.paint(); }
      if (p) tip.show(e, p.c.d.label, [`${T.monthFmt(T.monthDate(p.c.mo))}: ${T.fmtInt(p.c.v)} ${mapState.land === 'answerable' ? 'answerable tickets' : 'tickets'}`]);
      else tip.hide();
    },
    leave: () => tip.hide(),
    click: (e, api) => {
      const p = pick(e, api);
      if (p && shiftFilter(e, p.c.d.id)) return;
      mapState.selected = p ? p.c.d.id : null;
      PIN_DRAWS.forEach((n) => dash.draw(n));
    },
  });
  el.style.minHeight = '480px';
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
