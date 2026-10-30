import { useCallback, useEffect, useMemo, useState } from "react";
import type { IntentRecord } from "../domain/types";
import { buildGraph, CUT_RANGE, DEFAULT_CUT, type LinkBasis } from "../domain/relations";
import { HEIGHT_LABEL, INITIAL_TERRAIN, landscapeSeries, terrainData, type ColorBasis, type HeightBasis, type HeightScale, type Level, type PartBasis, type TerrainData, type TerrainState } from "../terrain/data";
import { Terrain } from "../terrain/Terrain";
import { dec2, fmtMonth, pct } from "../ui/format";
import { prefersReducedMotion } from "../ui/hooks";
import { Card, CoveragePill, Segmented, type SegOption } from "../ui/primitives";
import { seriesColor, useTheme } from "../ui/theme";
import { Groups, Matrix, nodeColor, TimePair, type MapColor, type MatrixMetric } from "./Relations";
import type { PageProps } from "./types";

const HEIGHTS: readonly SegOption<HeightBasis>[] = [{ value: "all", label: "Share of all needs" }, { value: "answerable", label: "Share of answerable" }, { value: "gap", label: "Share of uncovered doc demand" }];
const COLORS: readonly SegOption<ColorBasis>[] = [{ value: "group", label: "Category" }, { value: "coverage", label: "FAQ coverage" }, { value: "channel", label: "Channel" }, { value: "trend", label: "Trend" }];
const SCALES: readonly SegOption<HeightScale>[] = [{ value: "linear", label: "Linear" }, { value: "sqrt", label: "Square root" }];
const PARTS: readonly SegOption<PartBasis>[] = [{ value: "topic", label: "River topic" }, { value: "channel", label: "Channel" }, { value: "region", label: "Region" }, { value: "month", label: "Month" }];
const MAP_COLORS: readonly SegOption<MapColor>[] = [{ value: "cluster", label: "Co-occurrence groups" }, { value: "domain", label: "Domain" }, { value: "channel", label: "Channel" }, { value: "coverage", label: "FAQ coverage" }];
const BASES: readonly SegOption<LinkBasis>[] = [{ value: "time", label: "Time: rise and fall together" }, { value: "person", label: "Same person, next ticket" }, { value: "ticket", label: "Same ticket" }];
const METRICS: readonly SegOption<MatrixMetric>[] = [{ value: "cosine", label: "Strength" }, { value: "support", label: "Shared tickets" }, { value: "lift", label: "Lift" }];

interface RankItem {
  readonly id: string;
  readonly label: string;
  readonly share: number;
  readonly value: string;
  readonly onClick: () => void;
}

function RankList({ items }: { readonly items: readonly RankItem[] }) {
  const theme = useTheme();
  const top = Math.max(1e-9, ...items.map((i) => i.share));
  return (
    <ol className="rank">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" className="rank-btn" onClick={i.onClick}>
            <span>{i.label}</span><span className="rank-val">{i.value}</span>
            <span className="rank-bar"><span style={{ width: `${(i.share / top) * 100}%`, background: seriesColor(theme, 0) }} /></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function SidePanel({ td, st, go }: { readonly td: TerrainData; readonly st: TerrainState; readonly go: (l: Level, g: string | null, i: string | null) => void }) {
  const scope = `${td.month === null ? "all months" : fmtMonth(td.month)} · ${td.denom.toLocaleString()} needs`;
  const per = HEIGHT_LABEL[st.height];
  if (st.level === 0) {
    return <aside className="side"><h3>Categories by share</h3><p className="sub">{scope}</p>
      <RankList items={td.groups.map((g) => ({ id: g.id, label: g.label, share: g.share, value: pct(g.share), onClick: () => go(1, g.id, null) }))} /></aside>;
  }
  const d = st.intent === null ? undefined : td.byId.get(st.intent);
  if (st.level === 1 || !d) {
    const g = st.group === null ? undefined : td.groupById.get(st.group);
    const list = g ? g.members.slice(0, 40) : td.intents.slice(0, 15);
    return <aside className="side"><h3>{g ? g.label : "Intents by share"}</h3><p className="sub">{g ? `${pct(g.share)} ${per} · ${scope}` : scope}</p>
      <RankList items={list.map((x) => ({ id: x.id, label: x.label, share: x.share, value: `${pct(x.share)}${g ? ` · ${pct(x.share / g.share)} of category` : ""}`, onClick: () => go(2, x.group, x.id) }))} /></aside>;
  }
  const g = td.groupById.get(d.group);
  const near = d.nearest.flatMap((n) => { const x = td.byId.get(n.intent); return x ? [{ x, sim: n.sim }] : []; });
  return (
    <aside className="side">
      <h3>{d.label}</h3>
      <p className="sub">{`${pct(d.share)} ${per} · rank ${d.rank} of ${td.intents.length}${g ? ` · ${pct(d.share / g.share)} of ${g.label}` : ""}`}</p>
      <p className="sub">Share of all needs: {pct(d.shareFirst)} in Jan–Mar → {pct(d.shareLast)} in Jul–Sep</p>
      {d.meta.coverage !== null && <p className="sub"><CoveragePill coverage={d.meta.coverage} /> {d.meta.gap}</p>}
      {d.terms.length > 0 && <><p className="sub">Words people use</p><div className="chips">{d.terms.map((t) => <span key={t} className="chip">{t}</span>)}</div></>}
      <p className="sub">Closest in meaning</p>
      <RankList items={near.map(({ x, sim }) => ({ id: x.id, label: x.label, share: x.share, value: `${pct(x.share)} · sim ${dec2(sim)}`, onClick: () => go(2, x.group, x.id) }))} />
    </aside>
  );
}

export function IntentMap({ model: m, filters }: PageProps) {
  const theme = useTheme();
  const [st, setSt] = useState<TerrainState>(INITIAL_TERRAIN);
  const [flyKey, setFlyKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [basis, setBasis] = useState<LinkBasis>("time");
  const [cuts, setCuts] = useState<Readonly<Record<LinkBasis, number>>>(DEFAULT_CUT);
  const [mapColor, setMapColor] = useState<MapColor>("cluster");
  const [metric, setMetric] = useState<MatrixMetric>("cosine");

  const td = useMemo(() => terrainData(m, st), [m, st]);
  const series = useMemo(() => landscapeSeries(m, st.height), [m, st.height]);
  const go = useCallback((level: Level, group: string | null, intent: string | null, fly = true) => {
    setSt((s) => ({ ...s, level, group, intent }));
    if (intent !== null) setSelected(intent);
    if (fly) setFlyKey((k) => k + 1);
  }, []);
  const goUp = useCallback(() => {
    setSt((s) => (s.level === 2 ? { ...s, level: 1, intent: null } : s.level === 1 && s.group !== null ? { ...s, group: null } : { ...s, level: 0, group: null, intent: null }));
    setFlyKey((k) => k + 1);
  }, []);
  const patch = (p: Partial<TerrainState>) => setSt((s) => ({ ...s, ...p }));

  const months = m.index.months;
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => setSt((s) => ({ ...s, month: s.month >= months.length ? 1 : s.month + 1 })), prefersReducedMotion() ? 1600 : 1100);
    return () => window.clearInterval(id);
  }, [playing, months.length]);
  useEffect(() => {
    if (playing && st.month >= months.length) setPlaying(false);
  }, [playing, st.month, months.length]);

  const cut = cuts[basis];
  const [lo, hi] = CUT_RANGE[basis];
  const graph = useMemo(() => buildGraph(m, basis, cut), [m, basis, cut]);
  const timeGraph = useMemo(() => (basis === "time" ? graph : buildGraph(m, "time", cuts.time)), [m, basis, graph, cuts.time]);
  const color = useCallback((meta: IntentRecord) => nodeColor(theme, graph, mapColor, meta, m.index.domains), [theme, graph, mapColor, m.index.domains]);
  const pin = (id: string) => setSelected(id);

  const crumbs: { label: string; act: () => void }[] = [{ label: st.level === 0 ? "All demand · categories" : "All demand", act: () => go(0, null, null) }];
  if (st.level >= 1 && st.group === null) crumbs.push({ label: "All intents", act: () => go(1, null, null) });
  const grp = st.group === null ? undefined : td.groupById.get(st.group);
  if (grp) crumbs.push({ label: grp.label, act: () => go(1, grp.id, null) });
  const focus = st.intent === null ? undefined : td.byId.get(st.intent);
  if (st.level === 2 && focus) crumbs.push({ label: focus.label, act: () => undefined });
  const monthLabel = st.month ? (months[st.month - 1] ?? null) : null;

  return (
    <>
      <Card wide title="Intent map" sub={<><b>Size</b> is how often an intent is asked: its share of all needs, as height and footprint. <b>Colour</b> is its category. <b>Position</b> is meaning: intents about similar things stand close together, placed from sentence embeddings of the titles people wrote or picked and of each intent's definition. Scroll to zoom from categories to intents to the parts of one intent and back; click a column to drill in; double-click empty ground or press Escape to go up a level. Drag to rotate, shift-drag to pan.</>}>
        <div className="toolbar">
          <Segmented label="Size by" options={HEIGHTS} value={st.height} onChange={(height) => patch({ height })} />
          <Segmented label="Colour" options={COLORS} value={st.color} onChange={(c) => patch({ color: c })} />
          <Segmented label="Scale" options={SCALES} value={st.scale} onChange={(scale) => patch({ scale })} />
          <Segmented label="Intent parts" options={PARTS} value={st.part} onChange={(part) => patch({ part })} />
        </div>
        <div className="toolbar">
          <nav className="crumbs" aria-label="Zoom level">
            {crumbs.map((c, i) => (
              <span key={c.label}>{i > 0 && <span className="sep">›</span>}
                <button type="button" className="crumb" aria-current={i === crumbs.length - 1} onClick={c.act}>{c.label}</button></span>
            ))}
          </nav>
          <button type="button" className="btn" onClick={goUp}>Zoom out a level</button>
          <button type="button" className="btn" onClick={() => go(0, null, null)}>Back to all categories</button>
          <label className="range">Month
            <input type="range" min={0} max={months.length} step={1} value={st.month} onChange={(e) => patch({ month: Number(e.target.value) })} />
            <b>{monthLabel === null ? "All months" : fmtMonth(monthLabel)}</b>
          </label>
          <button type="button" className="btn" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>Play months</button>
        </div>
        <div className="split">
          {td.intents.length ? <Terrain td={td} series={series} state={st} go={go} goUp={goUp} onShiftPick={(id) => filters.toggle("intent", id)} flyKey={flyKey} /> : <div className="empty">No needs match these filters</div>}
          <SidePanel td={td} st={st} go={go} />
        </div>
        <p className="sub">Shares count needs (ticket–intent rows), so each level sums to 100%. Trend colour compares an intent's share in July–September with January–March. Placement is a UMAP layout of 63 intents from BAAI/bge-small-en-v1.5 sentence embeddings; read neighbourhoods, not exact distances.</p>
      </Card>

      <h2 className="section">How intents move together</h2>
      <div className="toolbar">
        <Segmented label="Colour and group by" options={MAP_COLORS} value={mapColor} onChange={setMapColor} />
        <Segmented label="Link intents by" options={BASES} value={basis} onChange={setBasis} />
        <label className="range">Link cutoff
          <input type="range" min={0} max={1} step={0.01} value={(cut - lo) / (hi - lo)} onChange={(e) => setCuts((c) => ({ ...c, [basis]: lo + Number(e.target.value) * (hi - lo) }))} />
          <b>{basis === "time" ? "r ≥ " : "strength ≥ "}{dec2(cut)}</b>
        </label>
        <button type="button" className="btn" onClick={() => setSelected(null)}>Clear selection</button>
      </div>
      <div className="grid">
        <Card wide title="Rising and falling together" sub="The pinned intent (or the most connected one) against its three strongest time partners: each line is that intent's weekly share of tickets, standardised so shapes compare. Hover for weekly counts.">
          <TimePair m={m} g={timeGraph} selected={selected} />
        </Card>
        <Card wide title="Groupings found in the data" sub="Intents merged by average-linkage clustering on the current link basis: weekly correlation for time, or shared count ÷ √(tickets A × tickets B) for the others. Raise the cutoff for tighter groups. Click a row to pin its lead intent.">
          <Groups m={m} g={graph} color={color} onPin={pin} />
        </Card>
        <Card wide title="Co-occurrence matrix" sub="Intents ordered by group; dashed boxes mark groups. The measure buttons apply to same-ticket links. Scroll to zoom, drag to pan; click a cell to pin the row's intent.">
          <Segmented label="Measure" options={METRICS} value={metric} onChange={setMetric} />
          <Matrix m={m} g={graph} metric={metric} color={color} selected={selected} onPin={pin} />
        </Card>
      </div>
    </>
  );
}
