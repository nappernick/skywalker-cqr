import { color as d3color, interpolateRgb, scaleDiverging } from "d3";
import { useEffect, useRef } from "react";
import { COVERAGE_LABEL, fmtInt, pct } from "../ui/format";
import { prefersReducedMotion, useWidth } from "../ui/hooks";
import { channelColor, coverageColor, FONT_FAMILY, seriesColor, useTheme, type Theme } from "../ui/theme";
import { useTooltip, type TipContent } from "../ui/Tooltip";
import { HEIGHT_LABEL, PART_TOP, parts, type Level, type TerrainData, type TerrainGroup, type TerrainIntent, type TerrainState } from "./data";
import { HOME_VIEW, Orbit, type FlyTarget, type Projected, type View } from "./orbit";

const HEIGHT = 540;
const COL_H = 0.62;
const LEVEL_ZOOM: Readonly<Record<Level, number>> = { 0: 1, 1: 1.35, 2: 3.4 };

interface PartColumn {
  readonly kind: "part";
  readonly id: string;
  readonly label: string;
  readonly parent: TerrainIntent;
  readonly idx: number;
  readonly n: number;
  readonly share: number;
  readonly ofIntent: number;
  readonly channel: TerrainIntent["channel"];
  readonly x: number;
  readonly z: number;
}

type Item = TerrainGroup | TerrainIntent | PartColumn;
interface Column {
  readonly item: Item;
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly hgt: number;
  readonly dim: boolean;
}
interface Hit {
  readonly col: Column;
  readonly x: number;
  readonly y: number;
  readonly rs: number;
  readonly depth: number;
}

export type Go = (level: Level, group: string | null, intent: string | null, fly?: boolean) => void;

interface Live {
  td: TerrainData;
  state: TerrainState;
  theme: Theme;
  hover: Hit | null;
  hits: Hit[];
  go: Go;
  goUp: () => void;
  onShiftPick: (id: string) => void;
}

const rgba = (c: string, a: number): string => {
  const col = d3color(c);
  if (!col) return c;
  col.opacity = a;
  return col.formatRgb();
};
const shade = (c: string, k: number, a: number): string => {
  const col = d3color(c);
  if (!col) return c;
  const out = k >= 0 ? col.brighter(k) : col.darker(-k);
  out.opacity = a;
  return out.formatRgb();
};

export function targetView(td: TerrainData, st: TerrainState): FlyTarget {
  const d = st.intent === null ? undefined : td.byId.get(st.intent);
  if (st.level === 2 && d) return { tx: d.x, tz: d.z, zoom: LEVEL_ZOOM[2] };
  const g = st.group === null ? undefined : td.groupById.get(st.group);
  if (st.level === 1 && g) return { tx: g.x, tz: g.z, zoom: Math.max(1.6, Math.min(3, 0.9 / g.rad)) };
  return { tx: 0, tz: 0, zoom: LEVEL_ZOOM[st.level] };
}

function columns(td: TerrainData, st: TerrainState): Column[] {
  const height = (v: number, mx: number) => COL_H * (st.scale === "sqrt" ? Math.sqrt(v / mx) : v / mx);
  if (st.level === 0) {
    const mx = Math.max(...td.groups.map((g) => g.share));
    return td.groups.map((g) => ({ item: g, x: g.x, z: g.z, r: 0.2 * Math.sqrt(g.share / mx), hgt: height(g.share, mx), dim: false }));
  }
  const d = st.intent === null ? undefined : td.byId.get(st.intent);
  if (st.level === 1 || !d) {
    const mx = Math.max(...td.intents.map((x) => x.share));
    return td.intents.map((x) => ({ item: x, x: x.x, z: x.z, r: 0.075 * Math.sqrt(x.share / mx) + 0.008, hgt: height(x.share, mx), dim: st.group !== null && x.group !== st.group }));
  }
  const ps = parts(d, st.part);
  const mx = Math.max(...ps.map((p) => p.n));
  return ps.map((p, i) => {
    const a = (i / ps.length) * Math.PI * 2 - Math.PI / 2;
    const rr = 0.2 * (st.part === "month" ? 1 : 0.55 + 0.45 * Math.sqrt(i / ps.length + 0.02));
    const x = d.x + Math.cos(a) * rr;
    const z = d.z + Math.sin(a) * rr;
    const item: PartColumn = { kind: "part", id: `${d.id}:${p.label}`, label: p.label, parent: d, idx: i, n: p.n, share: p.n / td.denom, ofIntent: p.n / d.n, channel: p.channel, x, z };
    return { item, x, z, r: 0.03 * Math.sqrt(p.n / mx) + 0.006, hgt: height(p.n, mx) * 0.55, dim: false };
  });
}

function colorOf(item: Item, live: Live): string {
  const { theme: t, state: st, td } = live;
  const groupColor = (g: TerrainGroup | undefined) => (g ? seriesColor(t, g.colorIndex) : t.muted);
  switch (item.kind) {
    case "group":
      return groupColor(item);
    case "part":
      return st.part === "channel" && item.channel !== null ? channelColor(t, item.channel) : interpolateRgb(colorOf(item.parent, live), t.muted)(item.idx / (PART_TOP + 2));
    case "intent": {
      if (st.color === "coverage") return coverageColor(t, item.meta.coverage);
      if (st.color === "channel") return item.channel === null ? t.muted : channelColor(t, item.channel);
      if (st.color === "trend") {
        const ramp = scaleDiverging<string>().domain([-1.5, 0, 1.5]).clamp(true)
          .interpolator((k) => (k < 0.5 ? interpolateRgb(seriesColor(t, 1), t.muted)(k * 2) : interpolateRgb(t.muted, seriesColor(t, 0))((k - 0.5) * 2)));
        return ramp(item.trend);
      }
      return groupColor(td.groupById.get(item.group));
    }
  }
}

function prism(o: Orbit, c: Column, fill: string, alpha: number, outline: string | null): Hit {
  const { ctx } = o;
  const hgt = Math.max(0.002, c.hgt * o.grow);
  const ring = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    return [c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r] as const;
  });
  const bot = ring.map(([x, z]) => o.project(x, 0, z));
  const top = ring.map(([x, z]) => o.project(x, hgt, z));
  const poly = (pts: readonly Projected[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  };
  const sides = Array.from({ length: 6 }, (_, k) => {
    const k2 = (k + 1) % 6;
    const b0 = bot[k];
    const b1 = bot[k2];
    const t0 = top[k];
    const t1 = top[k2];
    const a = ((k + 0.5) / 6) * Math.PI * 2 + Math.PI / 6;
    return b0 && b1 && t0 && t1 ? { pts: [b0, b1, t1, t0], depth: (b0.depth + b1.depth) / 2, lit: 0.5 + 0.5 * Math.cos(a - 2.3) } : null;
  }).flatMap((s) => (s ? [s] : [])).sort((p, q) => q.depth - p.depth);
  for (const s of sides) {
    ctx.fillStyle = shade(fill, -(1.1 - s.lit * 0.9), alpha);
    poly(s.pts);
    ctx.fill();
  }
  ctx.fillStyle = shade(fill, 0.35, alpha);
  poly(top);
  ctx.fill();
  if (outline !== null) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const cTop = o.project(c.x, hgt, c.z);
  return { col: c, x: cTop.x, y: cTop.y, rs: Math.max(8, Math.abs(o.project(c.x + c.r, hgt, c.z).x - cTop.x)), depth: cTop.depth };
}

function draw(o: Orbit, live: Live): void {
  const { ctx } = o;
  const { td, state: st, theme: t, hover } = live;
  const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT_FAMILY}`;
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(t.fgMuted, 0.16);
  for (let k = -6; k <= 6; k += 1) {
    const v = k * 0.2;
    for (const [a, b] of [[o.project(v, 0, -1.2), o.project(v, 0, 1.2)], [o.project(-1.2, 0, v), o.project(1.2, 0, v)]] as const) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  if (st.level >= 1) {
    for (const g of td.groups) {
      const on = st.group === null || st.group === g.id;
      const c = seriesColor(t, g.colorIndex);
      ctx.beginPath();
      for (let k = 0; k < 36; k += 1) {
        const p = o.project(g.x + Math.cos((k / 36) * Math.PI * 2) * g.rad, 0, g.z + Math.sin((k / 36) * Math.PI * 2) * g.rad);
        if (k) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(c, on ? 0.1 : 0.04);
      ctx.fill();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = rgba(c, on ? 0.55 : 0.2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (st.level === 1 && on) {
        const lp = o.project(g.x, 0, g.z + g.rad + 0.03);
        ctx.font = font(11);
        ctx.textAlign = "center";
        ctx.fillStyle = t.fgMuted;
        ctx.fillText(`${g.label} · ${pct(g.share)}`, lp.x, lp.y + 10);
      }
    }
  }
  const focus = st.intent === null ? undefined : td.byId.get(st.intent);
  if (st.level === 2 && focus) {
    ctx.strokeStyle = rgba(t.fgMuted, 0.4);
    ctx.beginPath();
    for (let k = 0; k < 48; k += 1) {
      const p = o.project(focus.x + Math.cos((k / 48) * Math.PI * 2) * 0.2, 0, focus.z + Math.sin((k / 48) * Math.PI * 2) * 0.2);
      if (k) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
    prism(o, { item: focus, x: focus.x, z: focus.z, r: 0.05, hgt: COL_H * 0.55, dim: false }, colorOf(focus, live), 0.12, null);
  }
  const cols = columns(td, st).map((c) => ({ c, depth: o.project(c.x, 0, c.z).depth })).sort((a, b) => b.depth - a.depth);
  live.hits = cols.map(({ c }) => {
    const selected = c.item.id === hover?.col.item.id || (st.level === 1 && c.item.id === st.intent);
    return prism(o, c, colorOf(c.item, live), c.dim ? 0.18 : 0.95, selected ? t.fg : null);
  });
  // Labels, biggest first, skipping overlaps; the hovered column always gets one.
  const want = st.level === 0 ? live.hits.length : st.level === 1 ? (st.group !== null ? 40 : 14) : live.hits.length;
  const ranked = live.hits.filter((h) => !h.col.dim).sort((a, b) => b.col.item.share - a.col.item.share);
  const show = new Set(ranked.slice(0, want).map((h) => h.col.item.id));
  if (hover) show.add(hover.col.item.id);
  const boxes: { x1: number; x2: number; y1: number; y2: number }[] = [];
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const isHover = (h: Hit) => h.col.item.id === hover?.col.item.id;
  for (const h of [...live.hits].sort((a, b) => Number(isHover(b)) - Number(isHover(a)) || b.col.item.share - a.col.item.share)) {
    if (!show.has(h.col.item.id)) continue;
    const it = h.col.item;
    const name = it.label.length > 34 ? `${it.label.slice(0, 33)}…` : it.label;
    const val = it.kind === "part" ? `${pct(it.ofIntent)} of intent` : pct(it.share);
    ctx.font = font(12);
    const tw = Math.max(ctx.measureText(name).width, ctx.measureText(val).width);
    const box = { x1: h.x - tw / 2 - 2, x2: h.x + tw / 2 + 2, y1: h.y - 32, y2: h.y - 4 };
    if (!isHover(h) && boxes.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1)) continue;
    boxes.push(box);
    ctx.fillStyle = t.fg;
    ctx.font = font(12, 600);
    ctx.fillText(val, h.x, h.y - 20);
    ctx.fillStyle = t.fgMuted;
    ctx.font = font(12);
    ctx.fillText(name, h.x, h.y - 7);
  }
}

function tipFor(item: Item, live: Live): TipContent {
  const { td, state: st } = live;
  const per = HEIGHT_LABEL[st.height];
  switch (item.kind) {
    case "group":
      return { title: item.label, lines: [`${pct(item.share)} ${per} · #${item.rank} of ${td.groups.length} categories`, `${item.members.length} intents · ${fmtInt(item.n)} needs`, "Click to zoom in"] };
    case "intent":
      return { title: item.label, lines: [
        `${pct(item.share)} ${per} · #${item.rank} of ${td.intents.length}`, `${fmtInt(item.tickets)} tickets · category: ${item.group}`,
        `Trend: ${pct(item.shareFirst)} in Jan–Mar → ${pct(item.shareLast)} in Jul–Sep`,
        `FAQ coverage: ${item.meta.coverage === null ? "—" : COVERAGE_LABEL[item.meta.coverage]}`, "Click to zoom into its parts; shift-click to filter"] };
    case "part":
      return { title: item.label, lines: [`${pct(item.ofIntent)} of ${item.parent.label}`, `${pct(item.share)} ${per} · ${fmtInt(item.n)} needs`] };
  }
}

/** The intent landscape: columns sized by share, coloured by category, placed by meaning. */
export interface TerrainProps {
  readonly td: TerrainData;
  readonly state: TerrainState;
  readonly go: Go;
  readonly goUp: () => void;
  readonly onShiftPick: (id: string) => void;
  /** Incremented by the parent whenever navigation should animate the camera to the new level. */
  readonly flyKey: number;
}

export function Terrain(props: TerrainProps) {
  const theme = useTheme();
  const [ref, w] = useWidth<HTMLDivElement>(300);
  const tip = useTooltip(ref);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ ...HOME_VIEW });
  const orbitRef = useRef<Orbit | null>(null);
  const live = useRef<Live>({ ...props, theme, hover: null, hits: [] });
  Object.assign(live.current, { td: props.td, state: props.state, go: props.go, goUp: props.goUp, onShiftPick: props.onShiftPick, theme });
  const { show: showTip, hide: hideTip } = tip;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const pick = (e: { readonly clientX: number; readonly clientY: number }): Hit | null => {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      let best: Hit | null = null;
      for (const h of live.current.hits) {
        if (h.col.dim) continue;
        if (Math.hypot(h.x - px, h.y - py) <= h.rs + 6 && (best === null || h.depth < best.depth)) best = h;
      }
      return best;
    };
    const orbit = new Orbit(canvas, w, HEIGHT, viewRef.current, (o) => draw(o, live.current), {
      hover: (e) => {
        const L = live.current;
        const h = pick(e);
        if ((h?.col.item.id ?? null) !== (L.hover?.col.item.id ?? null)) { L.hover = h; orbit.paint(); }
        if (h) showTip(e, tipFor(h.col.item, L));
        else hideTip();
      },
      leave: () => { hideTip(); if (live.current.hover) { live.current.hover = null; orbit.paint(); } },
      click: (e) => {
        const L = live.current;
        const h = pick(e);
        if (!h) { if (L.state.level === 1 && L.state.group !== null) L.go(1, null, null); return; }
        const it = h.col.item;
        if (it.kind === "intent" && e.shiftKey) L.onShiftPick(it.id);
        else if (it.kind === "group") L.go(1, it.id, null);
        else if (it.kind === "intent") L.go(2, it.group, it.id);
      },
      dbl: (e) => { if (!pick(e)) live.current.goUp(); },
      escape: () => live.current.goUp(),
      zoomed: () => {
        const L = live.current;
        const z = orbit.view.zoom;
        const st = L.state;
        if (st.level === 0 && z > 1.55) L.go(1, null, null, false);
        else if (st.level === 1 && st.group === null && z < 1.1) L.go(0, null, null, false);
        else if (st.level === 1 && z > 3.2) {
          let best: { d: TerrainIntent; dd: number } | null = null;
          for (const h of L.hits) {
            if (h.col.dim || h.col.item.kind !== "intent") continue;
            const dd = Math.hypot(h.x - orbit.width / 2, h.y - HEIGHT * 0.5);
            if (best === null || dd < best.dd) best = { d: h.col.item, dd };
          }
          if (best) { orbit.view.tx = best.d.x; orbit.view.tz = best.d.z; L.go(2, best.d.group, best.d.id, false); }
        } else if (st.level === 2 && z < 2.2) L.go(1, st.group, null, false);
      },
    }, prefersReducedMotion());
    orbitRef.current = orbit;
    return () => { orbit.destroy(); orbitRef.current = null; };
  }, [w, showTip, hideTip]);

  useEffect(() => { orbitRef.current?.paint(); }, [props.td, props.state, theme]);
  useEffect(() => {
    if (props.flyKey > 0) orbitRef.current?.flyTo(targetView(live.current.td, live.current.state));
  }, [props.flyKey]);

  return (
    <div className="chart terrain" ref={ref}>
      <canvas ref={canvasRef} tabIndex={0} style={{ width: "100%", height: HEIGHT, display: "block", touchAction: "none", cursor: "grab" }}
        aria-label="Demand landscape. Drag to rotate, shift-drag to pan, scroll or plus and minus to zoom, Escape to zoom out a level." />
      {tip.node}
    </div>
  );
}
