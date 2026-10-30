// Intent map: 3D columns sized by how often each intent is asked (share of all needs), coloured by category,
// standing where the intent sits in semantic space (scripts/intent_space.py: sentence embeddings of titles and
// definitions). Zoom moves between categories -> intents -> the parts of one intent.
const T3 = window.tsd;
const MAPS = window.tsdMap;
const TS = { level: 0, group: null, intent: null, height: 'all', color: 'group', scale: 'linear', part: 'topic', month: 0, play: null };
const TERRAIN_SIDE = ['terrain-panel', 'terrain-crumbs', 'terrain-month-value'];
const reduceMotion3 = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const HEIGHT_LABEL = { all: 'of all needs', answerable: 'of answerable needs', gap: 'of uncovered documentation demand' };
const LEVEL_ZOOM = { 0: 1, 1: 1.35, 2: 3.4 };
const PART_TOP = 11;
const FIRST3 = ['2026-01', '2026-02', '2026-03'];
const LAST3 = ['2026-07', '2026-08', '2026-09'];

// ---------- controls ----------
const pressGroup = (attr, key) => {
  for (const b of document.querySelectorAll(`[${attr}]`)) {
    b.addEventListener('click', () => {
      TS[key] = b.getAttribute(attr);
      for (const o of document.querySelectorAll(`[${attr}]`)) o.setAttribute('aria-pressed', String(o === b));
      redrawTerrain();
    });
  }
};
pressGroup('data-th', 'height');
pressGroup('data-tc', 'color');
pressGroup('data-tsc', 'scale');
pressGroup('data-tp', 'part');
for (const r of document.querySelectorAll('#terr-month')) r.addEventListener('input', () => { TS.month = +r.value; redrawTerrain(); });
for (const b of document.querySelectorAll('#terr-play')) {
  b.addEventListener('click', () => {
    if (TS.play) { clearInterval(TS.play); TS.play = null; b.setAttribute('aria-pressed', 'false'); return; }
    b.setAttribute('aria-pressed', 'true');
    const step = () => {
      const n = monthList().length;
      TS.month = TS.month >= n ? 1 : TS.month + 1;
      for (const r of document.querySelectorAll('#terr-month')) r.value = String(TS.month);
      redrawTerrain();
      if (TS.month >= n) { clearInterval(TS.play); TS.play = null; b.setAttribute('aria-pressed', 'false'); }
    };
    step();
    TS.play = setInterval(step, reduceMotion3 ? 1600 : 1100);
  });
}
for (const b of document.querySelectorAll('#terr-up')) b.addEventListener('click', () => goUp());
for (const b of document.querySelectorAll('#terr-home')) b.addEventListener('click', () => go(0, null, null));

function redrawTerrain() { ['c-terrain', ...TERRAIN_SIDE].forEach((n) => dash.draw(n)); }
function monthList() { const m = T3.model(); return m && !m.failed ? m.months : []; }

// ---------- data ----------
let tdCache = {};
function terrainData(m) {
  const sp = dash.data('intent_space');
  if (sp.status !== 'ok') return null;
  const key = [TS.height, TS.month, sp.data.length].join('|');
  if (tdCache.m === m && tdCache.key === key) return tdCache.val;
  const space = new Map(sp.data.map((r) => [r.intent, { ...r, x: +r.x, y: +r.y }]));
  const month = TS.month ? m.months[TS.month - 1] : null;
  const keep = (r) => {
    if (month && r.t.month !== month) return false;
    if (TS.height === 'answerable') return r.channel === 'answer';
    if (TS.height === 'gap') {
      const meta = m.meta.get(r.intent);
      const doc = r.channel === 'answer' || (meta.answer_class || '').startsWith('doc_then');
      return doc && meta.coverage !== 'full';
    }
    return true;
  };
  const rows = m.rows.filter((r) => space.has(r.intent) && keep(r));
  const denom = rows.length || 1;
  const byIntent = d3.group(rows, (r) => r.intent);
  // Trend: share of all needs in the last three full months vs the first three.
  const shareIn = (ms) => {
    const rs = m.rows.filter((r) => ms.includes(r.t.month));
    const n = rs.length || 1;
    return d3.rollup(rs, (v) => v.length / n, (r) => r.intent);
  };
  const s0 = shareIn(FIRST3); const s1 = shareIn(LAST3);
  const intents = [...byIntent].map(([id, rs]) => {
    const sp1 = space.get(id);
    const ch = d3.greatest(d3.rollups(rs, (v) => v.length, (r) => r.channel), (x) => x[1])?.[0];
    const a = s0.get(id) ?? 0; const b = s1.get(id) ?? 0;
    return {
      id, kind: 'intent', label: m.meta.get(id).name, meta: m.meta.get(id), rows: rs, n: rs.length, share: rs.length / denom,
      x: sp1.x, z: sp1.y, group: m.meta.get(id).domain, terms: sp1.terms, nearest: sp1.nearest,
      channel: ch, trend: a || b ? Math.log2((b + 1e-4) / (a + 1e-4)) : 0, shareFirst: a, shareLast: b,
      tickets: new Set(rs.map((r) => r.t.k)).size,
    };
  }).sort((p, q) => q.share - p.share);
  intents.forEach((d, i) => { d.rank = i + 1; });
  const groups = d3.groups(intents, (d) => d.group).map(([g, ds]) => {
    const share = d3.sum(ds, (d) => d.share);
    const cx = d3.sum(ds, (d) => d.x * d.share) / (share || 1);
    const cz = d3.sum(ds, (d) => d.z * d.share) / (share || 1);
    const rad = d3.max(ds, (d) => Math.hypot(d.x - cx, d.z - cz)) + 0.09;
    return { id: g, kind: 'group', label: g, full: g, members: ds, share, n: d3.sum(ds, (d) => d.n), x: cx, z: cz, rad: Math.min(0.75, rad) };
  }).sort((p, q) => q.share - p.share);
  // Stable colour per category regardless of filters.
  const cats = [...new Set([...m.meta.values()].map((x) => x.domain).filter((x) => x !== 'Excluded'))].sort();
  groups.forEach((g, i) => { g.rank = i + 1; g.ci = cats.indexOf(g.id); });
  const gIndex = new Map(groups.map((g) => [g.id, g]));
  for (const d of intents) d.g = gIndex.get(d.group);
  const val = { intents, groups, denom, month, byId: new Map(intents.map((d) => [d.id, d])), gIndex };
  tdCache = { m, key, val };
  return val;
}

function parts(m, d) {
  const keyOf = {
    topic: (r) => r.t.topic || 'Free-text titles',
    channel: (r) => T3.CH_LABEL[r.channel] ?? r.channel,
    region: (r) => r.t.region,
    month: (r) => T3.monthFmt(T3.monthDate(r.t.month)),
  }[TS.part];
  let ps = d3.rollups(d.rows, (v) => v.length, keyOf).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  if (TS.part === 'month') ps.sort((a, b) => d3.ascending(T3.monthDate(d.rows.find((r) => keyOf(r) === a.label).t.month), T3.monthDate(d.rows.find((r) => keyOf(r) === b.label).t.month)));
  if (ps.length > PART_TOP && TS.part !== 'month') ps = [...ps.slice(0, PART_TOP), { label: `${ps.length - PART_TOP} other`, n: d3.sum(ps.slice(PART_TOP), (p) => p.n), other: true }];
  return ps;
}

// ---------- navigation ----------
let cur = null; // live 3D view
function go(level, group, intent, fly = true) {
  TS.level = level; TS.group = group; TS.intent = intent;
  if (intent) MAPS.mapState.selected = intent;
  if (cur && fly) cur.flyTo(targetView());
  else if (cur) cur.paint();
  [...TERRAIN_SIDE, 'c-matrix', 'c-timepair'].forEach((n) => dash.draw(n));
}
function goUp() {
  if (TS.level === 2) go(1, TS.group, null);
  else if (TS.level === 1 && TS.group != null) go(1, null, null);
  else go(0, null, null);
}
function targetView() {
  const m = T3.model();
  const td = m && !m.failed ? terrainData(m) : null;
  if (!td) return { tx: 0, tz: 0, zoom: 1 };
  if (TS.level === 2 && td.byId.get(TS.intent)) { const d = td.byId.get(TS.intent); return { tx: d.x, tz: d.z, zoom: LEVEL_ZOOM[2] }; }
  if (TS.level === 1 && TS.group != null && td.gIndex.get(TS.group)) { const g = td.gIndex.get(TS.group); return { tx: g.x, tz: g.z, zoom: Math.max(1.6, Math.min(3, 0.9 / g.rad)) }; }
  return { tx: 0, tz: 0, zoom: LEVEL_ZOOM[TS.level] };
}

// ---------- 3D view with orbit camera, pan target and fly-to ----------
const tViews = new Map();
function orbit3(el, key, h, render, handlers) {
  const w = Math.max(300, el.clientWidth);
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  Object.assign(canvas.style, { width: '100%', height: `${h}px`, display: 'block', touchAction: 'none', cursor: 'grab' });
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Demand landscape. Arrow keys rotate, plus and minus zoom, Escape zooms out a level.');
  el.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const home = { yaw: 0.65, pitch: 0.62, zoom: 1, tx: 0, tz: 0 };
  const v = tViews.get(key) ?? { ...home };
  tViews.set(key, v);
  const F = 3.4;
  const base = Math.min(w, h * 1.25) * 0.4;
  const project = (x, y, z) => {
    const X = x - v.tx; const Z = z - v.tz;
    const cy = Math.cos(v.yaw); const sy = Math.sin(v.yaw);
    const cp = Math.cos(v.pitch); const sp = Math.sin(v.pitch);
    const x1 = X * cy - Z * sy; const z1 = X * sy + Z * cy;
    const y2 = y * cp - z1 * sp; const z2 = y * sp + z1 * cp;
    const depth = z2 * v.zoom + F;
    const s = (base * v.zoom * F) / Math.max(0.4, depth);
    return { x: w / 2 + x1 * s, y: h * 0.56 - y2 * s, depth, s };
  };
  let anim = null;
  const api = { ctx, w, h, project, view: v, canvas };
  api.paint = () => { ctx.clearRect(0, 0, w, h); render(api); };
  api.flyTo = (t) => {
    const from = { ...v };
    const t0 = performance.now();
    const dur = reduceMotion3 ? 0 : 650;
    cancelAnimationFrame(anim);
    const stepF = (now) => {
      if (!canvas.isConnected) return;
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      for (const p of ['tx', 'tz', 'zoom']) if (t[p] !== undefined) v[p] = from[p] + (t[p] - from[p]) * e;
      api.grow = Math.min(1, k * 1.4);
      api.paint();
      if (k < 1) anim = requestAnimationFrame(stepF);
    };
    anim = requestAnimationFrame(stepF);
  };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.shiftKey || e.button === 2 }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { handlers.hover?.(e, api); return; }
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      const k = 1 / (base * v.zoom);
      v.tx -= (dx * Math.cos(v.yaw) + dy * Math.sin(v.yaw)) * k;
      v.tz -= (-dx * Math.sin(v.yaw) + dy * Math.cos(v.yaw)) * k;
    } else { v.yaw += dx * 0.008; v.pitch = Math.max(0.12, Math.min(1.5, v.pitch + dy * 0.006)); }
    handlers.leave?.();
    api.paint();
  });
  canvas.addEventListener('pointerup', (e) => { if (drag && drag.moved < 4) handlers.click?.(e, api); drag = null; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => handlers.leave?.());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    v.zoom = Math.max(0.6, Math.min(9, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    api.paint();
    handlers.zoomed?.(e, api);
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => handlers.dbl?.(e, api));
  canvas.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (step) { e.preventDefault(); v.yaw += step[0]; v.pitch = Math.max(0.12, Math.min(1.5, v.pitch + step[1])); api.paint(); }
    if (e.key === '+' || e.key === '=') { v.zoom = Math.min(9, v.zoom * 1.2); api.paint(); handlers.zoomed?.(e, api); }
    if (e.key === '-') { v.zoom = Math.max(0.6, v.zoom / 1.2); api.paint(); handlers.zoomed?.(e, api); }
    if (e.key === 'Escape') goUp();
  });
  api.grow = 1;
  api.paint();
  return api;
}

const rc3 = (el, c, fb) => { const v = T3.resolveColor(el, c); return d3.color(v) ? d3.color(v).formatRgb() : fb; };
const FB = ['#3b7dd8', '#d9822b', '#3a9e6f', '#b04aa0', '#c9a227', '#5b6bbf', '#c0504d', '#4aa3a2'];

// ---------- the landscape ----------
dash.draw('c-terrain', (el) => {
  const m = T3.begin(el);
  if (!m) return;
  const td = terrainData(m);
  if (!td) { el.classList.add('dash-skeleton'); return; }
  if (!td.intents.length) return T3.emptyNote(el, 'No needs match these filters');
  if (TS.level === 2 && !td.byId.get(TS.intent)) { TS.level = 1; TS.intent = null; }
  if (TS.group != null && !td.gIndex.get(TS.group)) TS.group = null;
  const fg = rc3(el, 'var(--color-fg)', '#222');
  const fgMuted = rc3(el, 'var(--color-fg-muted)', '#6b6b6b');
  const muted = rc3(el, 'var(--cds-chart-muted)', '#9a9a9a');
  const series = dash.colors.map((c, i) => rc3(el, c, FB[i % FB.length]));
  const chan = Object.fromEntries(T3.CH.map((c, i) => [c, rc3(el, T3.chColor(c), FB[i])]));
  const cov = Object.fromEntries(T3.COV.map((c, i) => [c, rc3(el, T3.covColor(c), ['#3a9e6f', '#c9a227', '#c0504d'][i])]));
  const font = getComputedStyle(el).fontFamily || 'sans-serif';
  const groupColor = (g) => series[g.ci % series.length];
  const trendRamp = d3.scaleDiverging([-1.5, 0, 1.5], (t) => (t < 0.5 ? d3.interpolateRgb(series[1], muted)(t * 2) : d3.interpolateRgb(muted, series[0])((t - 0.5) * 2))).clamp(true);
  const colorOf = (d) => {
    if (d.kind === 'group') return groupColor(d);
    if (d.kind === 'part') return TS.part === 'channel' ? (chan[d.channel] ?? muted) : d3.interpolateRgb(colorOf(d.parent), muted)(d.idx / (PART_TOP + 2));
    if (TS.color === 'coverage') return cov[d.meta.coverage] ?? muted;
    if (TS.color === 'channel') return chan[d.channel] ?? muted;
    if (TS.color === 'trend') return trendRamp(d.trend);
    return groupColor(d.g);
  };
  const tip = T3.tooltip(el);
  const H = 0.62;
  let hover = null;
  let hits = [];

  const columns = () => {
    if (TS.level === 0) {
      const mx = d3.max(td.groups, (g) => g.share);
      return td.groups.map((g) => ({ ...g, r: 0.2 * Math.sqrt(g.share / mx), hgt: height(g.share, mx) }));
    }
    if (TS.level === 1) {
      const mx = d3.max(td.intents, (d) => d.share);
      return td.intents.map((d) => ({ ...d, r: 0.075 * Math.sqrt(d.share / mx) + 0.008, hgt: height(d.share, mx), dim: TS.group != null && d.group !== TS.group }));
    }
    const d = td.byId.get(TS.intent);
    const ps = parts(m, d);
    const mx = d3.max(ps, (p) => p.n);
    const ring = 0.2;
    return ps.map((p, i) => {
      const a = (i / ps.length) * Math.PI * 2 - Math.PI / 2;
      const rr = ring * (TS.part === 'month' ? 1 : 0.55 + 0.45 * Math.sqrt(i / ps.length + 0.02));
      return {
        id: `${d.id}:${p.label}`, kind: 'part', label: p.label, parent: d, idx: i, n: p.n, share: p.n / td.denom, ofIntent: p.n / d.n, other: p.other,
        channel: TS.part === 'channel' ? T3.CH.find((c) => T3.CH_LABEL[c] === p.label) : null,
        x: d.x + Math.cos(a) * rr, z: d.z + Math.sin(a) * rr, r: 0.03 * Math.sqrt(p.n / mx) + 0.006, hgt: height(p.n, mx) * 0.55,
      };
    });
  };
  function height(v, mx) { return H * (TS.scale === 'sqrt' ? Math.sqrt(v / mx) : v / mx); }

  const prism = (ctx, project, c, colr, alpha, grow, outline) => {
    const hgt = Math.max(0.002, c.hgt * grow);
    const pts = d3.range(6).map((k) => { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; return [c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r]; });
    const bot = pts.map(([x, z]) => project(x, 0, z));
    const top = pts.map(([x, z]) => project(x, hgt, z));
    const col = d3.color(colr);
    const sides = d3.range(6).map((k) => {
      const k2 = (k + 1) % 6;
      const a = ((k + 0.5) / 6) * Math.PI * 2 + Math.PI / 6;
      const lit = 0.5 + 0.5 * Math.cos(a - 2.3);
      return { poly: [bot[k], bot[k2], top[k2], top[k]], depth: (bot[k].depth + bot[k2].depth) / 2, lit };
    }).sort((p, q) => q.depth - p.depth);
    for (const s of sides) {
      ctx.fillStyle = col.darker(1.1 - s.lit * 0.9).copy({ opacity: alpha }).formatRgb();
      ctx.beginPath(); s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = col.brighter(0.35).copy({ opacity: alpha }).formatRgb();
    ctx.beginPath(); top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
    if (outline) { ctx.strokeStyle = fg; ctx.lineWidth = 1.5; ctx.stroke(); }
    const cTop = project(c.x, hgt, c.z);
    const rs = Math.max(8, Math.abs(project(c.x + c.r, hgt, c.z).x - cTop.x));
    return { c, x: cTop.x, y: cTop.y, rs, depth: cTop.depth };
  };

  const render = ({ ctx, project, w, h, grow }) => {
    // ground grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = d3.color(fgMuted).copy({ opacity: 0.16 }).formatRgb();
    for (let k = -6; k <= 6; k += 1) {
      const t = k * 0.2;
      let a = project(t, 0, -1.2); let b = project(t, 0, 1.2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      a = project(-1.2, 0, t); b = project(1.2, 0, t);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // group territories on the ground (intent and part levels)
    if (TS.level >= 1) {
      for (const g of td.groups) {
        const on = TS.group == null || TS.group === g.id;
        const poly = d3.range(36).map((k) => project(g.x + Math.cos((k / 36) * Math.PI * 2) * g.rad, 0, g.z + Math.sin((k / 36) * Math.PI * 2) * g.rad));
        ctx.fillStyle = d3.color(groupColor(g)).copy({ opacity: on ? 0.1 : 0.04 }).formatRgb();
        ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = d3.color(groupColor(g)).copy({ opacity: on ? 0.55 : 0.2 }).formatRgb();
        ctx.stroke(); ctx.setLineDash([]);
        if (TS.level === 1 && on) {
          const lp = project(g.x, 0, g.z + g.rad + 0.03);
          ctx.font = `11px ${font}`; ctx.textAlign = 'center'; ctx.fillStyle = fgMuted;
          ctx.fillText(`${g.label} · ${T3.pct(g.share)}`, lp.x, lp.y + 10);
        }
      }
    }
    const cols = columns();
    if (TS.level === 2) {
      const d = td.byId.get(TS.intent);
      const ringPts = d3.range(48).map((k) => project(d.x + Math.cos((k / 48) * Math.PI * 2) * 0.2, 0, d.z + Math.sin((k / 48) * Math.PI * 2) * 0.2));
      ctx.strokeStyle = d3.color(fgMuted).copy({ opacity: 0.4 }).formatRgb();
      ctx.beginPath(); ringPts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
      // the intent itself as a faint ghost column at the centre for scale
      prism(ctx, project, { x: d.x, z: d.z, r: 0.05, hgt: H * 0.55 }, colorOf(d), 0.12, grow, false);
    }
    const order = cols.map((c) => ({ c, depth: project(c.x, 0, c.z).depth })).sort((a, b) => b.depth - a.depth);
    hits = [];
    for (const { c } of order) {
      const isSel = c.id === hover?.c.id || (TS.level === 1 && c.id === TS.intent);
      hits.push(prism(ctx, project, c, colorOf(c), c.dim ? 0.18 : 0.95, grow ?? 1, isSel));
    }
    // labels: biggest first, skipping overlaps
    ctx.font = `12px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const boxes = [];
    const want = TS.level === 0 ? hits.length : TS.level === 1 ? (TS.group != null ? 40 : 14) : hits.length;
    const ranked = [...hits].filter((x) => !x.c.dim).sort((a, b) => b.c.share - a.c.share);
    const show = new Set(ranked.slice(0, want).map((x) => x.c.id));
    if (hover) show.add(hover.c.id);
    for (const x of [...hits].sort((a, b) => (b.c.id === hover?.c.id) - (a.c.id === hover?.c.id) || b.c.share - a.c.share)) {
      if (!show.has(x.c.id)) continue;
      const name = x.c.label.length > 34 ? `${x.c.label.slice(0, 33)}…` : x.c.label;
      const val = TS.level === 2 ? `${T3.pct(x.c.ofIntent)} of intent` : T3.pct(x.c.share);
      const tw = Math.max(ctx.measureText(name).width, ctx.measureText(val).width);
      const box = { x1: x.x - tw / 2 - 2, x2: x.x + tw / 2 + 2, y1: x.y - 32, y2: x.y - 4 };
      if (x.c.id !== hover?.c.id && boxes.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1)) continue;
      boxes.push(box);
      ctx.fillStyle = fg; ctx.font = `600 12px ${font}`;
      ctx.fillText(val, x.x, x.y - 20);
      ctx.fillStyle = fgMuted; ctx.font = `12px ${font}`;
      ctx.fillText(name, x.x, x.y - 7);
    }
  };

  const pick = (e, api) => {
    const r = api.canvas.getBoundingClientRect();
    const px = e.clientX - r.left; const py = e.clientY - r.top;
    let best = null;
    for (const x of hits) {
      if (x.c.dim) continue;
      const dd = Math.hypot(x.x - px, x.y - py);
      if (dd <= x.rs + 6 && (!best || x.depth < best.depth)) best = x;
    }
    return best;
  };
  const nearestToCentre = (api) => {
    let best = null;
    for (const x of hits) { if (x.c.dim || x.c.kind !== 'intent') continue; const dd = Math.hypot(x.x - api.w / 2, x.y - api.h * 0.5); if (!best || dd < best.dd) best = { x, dd }; }
    return best?.x.c;
  };
  cur = orbit3(el, 'terrain', 540, render, {
    hover: (e, api) => {
      const p = pick(e, api);
      if ((p?.c.id ?? null) !== (hover?.c.id ?? null)) { hover = p; api.paint(); }
      if (!p) { tip.hide(); return; }
      const c = p.c;
      if (c.kind === 'group') tip.show(e, c.full, [`${T3.pct(c.share)} ${HEIGHT_LABEL[TS.height]} · #${c.rank} of ${td.groups.length} categories`, `${c.members.length} intents · ${T3.fmtInt(c.n)} needs`, 'Click to zoom in']);
      else if (c.kind === 'intent') tip.show(e, c.label, [`${T3.pct(c.share)} ${HEIGHT_LABEL[TS.height]} · #${c.rank} of ${td.intents.length}`, `${T3.fmtInt(c.tickets)} tickets · category: ${c.g.label}`,
        `Trend: ${T3.pct(c.shareFirst)} in Jan–Mar → ${T3.pct(c.shareLast)} in Jul–Sep`, `FAQ coverage: ${T3.COV_LABEL[c.meta.coverage] ?? '—'}`, 'Click to zoom into its parts']);
      else tip.show(e, c.label, [`${T3.pct(c.ofIntent)} of ${c.parent.label}`, `${T3.pct(c.share)} ${HEIGHT_LABEL[TS.height]} · ${T3.fmtInt(c.n)} needs`]);
    },
    leave: () => { tip.hide(); if (hover) { hover = null; cur?.paint(); } },
    click: (e, api) => {
      const p = pick(e, api);
      if (!p) { if (TS.level === 1 && TS.group != null) go(1, null, null); return; }
      const c = p.c;
      if (c.kind === 'intent' && e.shiftKey) { T3.toggleParam('intent', c.id); return; }
      if (c.kind === 'group') go(1, c.id, null);
      else if (c.kind === 'intent') go(2, c.group, c.id);
    },
    dbl: (e, api) => { const p = pick(e, api); if (!p) goUp(); },
    zoomed: (e, api) => {
      const z = api.view.zoom;
      if (TS.level === 0 && z > 1.55) { TS.level = 1; api.paint(); TERRAIN_SIDE.forEach((n) => dash.draw(n)); }
      else if (TS.level === 1 && TS.group == null && z < 1.1) { TS.level = 0; api.paint(); TERRAIN_SIDE.forEach((n) => dash.draw(n)); }
      else if (TS.level === 1 && z > 3.2) { const c = nearestToCentre(api); if (c) { TS.level = 2; TS.group = c.group; TS.intent = c.id; MAPS.mapState.selected = c.id; api.view.tx = c.x; api.view.tz = c.z; api.paint(); [...TERRAIN_SIDE, 'c-matrix', 'c-timepair'].forEach((n) => dash.draw(n)); } }
      else if (TS.level === 2 && z < 2.2) { TS.level = 1; TS.intent = null; api.paint(); TERRAIN_SIDE.forEach((n) => dash.draw(n)); }
    },
  });
  el.style.minHeight = '540px';
});

// ---------- breadcrumb, month label, side panel ----------
dash.draw('terrain-crumbs', (el) => {
  el.replaceChildren();
  const m = T3.model();
  if (!m || m.failed) return;
  const td = terrainData(m);
  if (!td) return;
  const crumbs = [{ label: TS.level === 0 ? 'All demand · categories' : 'All demand', act: () => go(0, null, null) }];
  if (TS.level >= 1 && TS.group == null) crumbs.push({ label: 'All intents', act: () => go(1, null, null) });
  if (TS.group != null && td.gIndex.get(TS.group)) crumbs.push({ label: td.gIndex.get(TS.group).label, act: () => go(1, TS.group, null) });
  if (TS.level === 2 && td.byId.get(TS.intent)) crumbs.push({ label: td.byId.get(TS.intent).label, act: () => {} });
  crumbs.forEach((c, i) => {
    if (i) el.append(Object.assign(document.createElement('span'), { className: 'sep', textContent: '›' }));
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tsd-crumb'; b.textContent = c.label;
    if (i === crumbs.length - 1) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', c.act);
    el.append(b);
  });
});

dash.draw('terrain-month-value', (el) => {
  const ms = monthList();
  el.textContent = TS.month && ms[TS.month - 1] ? T3.monthFmt(T3.monthDate(ms[TS.month - 1])) : 'All months';
});

dash.draw('terrain-panel', (el) => {
  el.replaceChildren();
  const m = T3.model();
  if (!m || m.failed) return;
  const td = terrainData(m);
  if (!td) return;
  const box = d3.select(el);
  const list = (items, fmt, onClick) => {
    const ul = box.append('ol').attr('class', 'tsd-rank');
    const li = ul.selectAll('li').data(items).join('li');
    const btn = li.append('button').attr('type', 'button').attr('class', 'tsd-rank-btn').on('click', (e, d) => onClick(d));
    btn.append('span').attr('class', 'nm').text((d) => d.label);
    btn.append('span').attr('class', 'vl').text(fmt);
    const top = d3.max(items, (x) => x.share) || 1;
    btn.append('span').attr('class', 'bar').append('span').style('width', (d) => `${(d.share / top) * 100}%`).style('background', dash.colors[0]);
  };
  const head = (t, sub) => { box.append('h3').attr('class', 'tsd-sel-name').text(t); if (sub) box.append('p').attr('class', 'sub').text(sub); };
  const scope = `${td.month ? T3.monthFmt(T3.monthDate(td.month)) : 'all months'} · ${T3.fmtInt(td.denom)} needs`;
  if (TS.level === 0) {
    head('Categories by share', scope);
    list(td.groups, (d) => T3.pct(d.share), (d) => go(1, d.id, null));
    return;
  }
  if (TS.level === 1) {
    const g = TS.group != null ? td.gIndex.get(TS.group) : null;
    head(g ? g.full : 'Intents by share', g ? `${T3.pct(g.share)} ${HEIGHT_LABEL[TS.height]} · ${scope}` : scope);
    list((g ? g.members : td.intents).slice(0, g ? 40 : 15), (d) => `${T3.pct(d.share)}${g ? ` · ${T3.pct(d.share / g.share)} of category` : ''}`, (d) => go(2, d.group, d.id));
    return;
  }
  const d = td.byId.get(TS.intent);
  if (!d) return;
  head(d.label, `${T3.pct(d.share)} ${HEIGHT_LABEL[TS.height]} · rank ${d.rank} of ${td.intents.length} · ${T3.pct(d.share / d.g.share)} of ${d.g.label}`);
  box.append('p').attr('class', 'sub').text(`Share of all needs: ${T3.pct(d.shareFirst)} in Jan–Mar → ${T3.pct(d.shareLast)} in Jul–Sep`);
  if (d.meta.coverage) {
    const p = box.append('p').attr('class', 'sub');
    p.append('span').attr('class', `tsd-pill ${d.meta.coverage}`).text(T3.COV_LABEL[d.meta.coverage]);
    if (d.meta.gap) p.append('span').text(` ${d.meta.gap}`);
  }
  if (d.terms?.length) {
    box.append('p').attr('class', 'sub').text('Words people use');
    box.append('div').attr('class', 'tsd-chips').selectAll('span').data(d.terms).join('span').attr('class', 'tsd-chip').text((t) => t);
  }
  box.append('p').attr('class', 'sub').text('Closest in meaning');
  const near = (d.nearest || []).map((n) => td.byId.get(n.intent) ? { ...td.byId.get(n.intent), sim: n.sim } : null).filter(Boolean);
  list(near.map((x) => ({ ...x })), (x) => `${T3.pct(x.share)} · sim ${d3.format('.2f')(x.sim)}`, (x) => go(2, x.group, x.id));
});

window.tsdTerrain = { TS, go };
