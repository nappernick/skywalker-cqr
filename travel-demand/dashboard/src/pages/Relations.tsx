import { extent, line, scaleLinear, scaleUtc, select, utcFormat, zoom, type D3ZoomEvent } from "d3";
import { useEffect, useRef } from "react";
import type { Model } from "../domain/model";
import { neighbours, type Graph, type Link } from "../domain/relations";
import type { IntentRecord } from "../domain/types";
import { dec1, dec2, fmtInt, pct } from "../ui/format";
import { useWidth } from "../ui/hooks";
import { fitText, textWidth } from "../ui/measure";
import { Empty } from "../ui/primitives";
import { SortableTable, type Column } from "../ui/SortableTable";
import { channelColor, coverageColor, seriesColor, useTheme, type Theme } from "../ui/theme";
import { useTooltip } from "../ui/Tooltip";

export type MapColor = "cluster" | "domain" | "channel" | "coverage";
export type MatrixMetric = "cosine" | "support" | "lift";

export function nodeColor(t: Theme, g: Graph, by: MapColor, meta: IntentRecord, domains: readonly string[]): string {
  switch (by) {
    case "domain": return seriesColor(t, Math.max(0, domains.indexOf(meta.domain)));
    case "channel": return channelColor(t, meta.best_channel);
    case "coverage": return coverageColor(t, meta.coverage);
    case "cluster": {
      const gi = g.groupOf.get(meta.intent) ?? -1;
      return gi >= 0 ? seriesColor(t, gi) : t.muted;
    }
  }
}

export function linkText(m: Model, l: Link): string[] {
  const name = (id: string) => m.index.meta.get(id)?.name ?? id;
  switch (l.kind) {
    case "time":
      return [`Weekly shares move together: r = ${dec2(l.r)}`,
        ...(l.lead !== null && l.follow !== null ? [`${name(l.lead)} tends to lead ${name(l.follow)} by ${l.lag} week${l.lag > 1 ? "s" : ""} (r = ${dec2(l.rLagged)})`] : [])];
    case "person":
      return [`${fmtInt(l.support)} people raised ${name(l.b)} within 30 days after ${name(l.a)}`];
    case "ticket":
      return [`${fmtInt(l.support)} shared tickets · lift ${dec1(l.lift)}`, `P(${name(l.b)} | ${name(l.a)}) = ${pct(l.pab)}`];
  }
}

/** The focus intent against its three strongest time partners, weekly shares standardised so shapes compare. */
export function TimePair({ m, g, selected }: { readonly m: Model; readonly g: Graph; readonly selected: string | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(320);
  const tip = useTooltip(ref);
  const theme = useTheme();
  const ws = g.weekly;
  if (!ws || ws.weeks.length < 6) return <Empty>Too few weeks in view to compare</Empty>;
  const degree = (id: string) => g.links.filter((l) => l.a === id || l.b === id).length;
  const focus = (selected !== null && ws.share.has(selected) ? selected : null)
    ?? [...g.nodes].filter((d) => ws.share.has(d.id)).sort((a, b) => degree(b.id) - degree(a.id) || b.n - a.n)[0]?.id ?? null;
  if (focus === null) return <Empty>No intents to compare</Empty>;
  const partners = [...neighbours(g, focus)].sort((a, b) => b[1].w - a[1].w).slice(0, 3);
  const zscore = (v: readonly number[]) => {
    const mu = v.reduce((s, x) => s + x, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, v.length - 1)) || 1;
    return v.map((x) => (x - mu) / sd);
  };
  const entries: { readonly id: string; readonly link: Link | null }[] = [{ id: focus, link: null }, ...partners.map(([id, link]) => ({ id, link }))];
  const series = entries.map((s, i) => ({
    ...s, name: m.index.meta.get(s.id)?.name ?? s.id, v: zscore(ws.share.get(s.id) ?? []), raw: ws.counts.get(s.id) ?? [],
    color: i === 0 ? theme.fg : seriesColor(theme, i - 1), width: i === 0 ? 2.6 : 1.6,
  }));
  const h = 300;
  const dates = ws.weeks.map((wk) => new Date(`${wk}T00:00:00Z`));
  const right = Math.min(w * 0.38, Math.max(...series.map((s) => textWidth(s.name))) + 14);
  const [d0, d1] = extent(dates);
  const x = scaleUtc().domain([d0 ?? new Date(), d1 ?? new Date()]).range([8, w - right]);
  const all = series.flatMap((s) => s.v);
  const y = scaleLinear().domain([Math.min(-2, ...all), Math.max(2, ...all)]).range([h - 24, 10]);
  const path = line<number>().x((_, i) => x(dates[i] ?? new Date())).y((v) => y(v));
  const ends = series.map((s, i) => ({ s, i, y: y(s.v.at(-1) ?? 0) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k += 1) {
    const prev = ends[k - 1];
    const cur = ends[k];
    if (prev && cur && cur.y - prev.y < 14) cur.y = prev.y + 14;
  }
  const fmtWeek = utcFormat("%b %-d, %Y");
  return (
    <div className="chart" ref={ref}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Weekly share of ${series[0]?.name ?? ""} and its time partners`}>
        {[-2, 0, 2].map((v) => <line key={v} x1={8} x2={w - right} y1={y(v)} y2={y(v)} stroke={v ? theme.grid : theme.axis} />)}
        {x.ticks(Math.max(2, Math.floor(w / 110))).map((d) => <text key={d.toISOString()} x={x(d)} y={h - 6} textAnchor="middle" fill={theme.fgMuted}>{utcFormat("%b %-d")(d)}</text>)}
        {series.map((s) => <path key={s.id} d={path(s.v) ?? ""} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinejoin="round" strokeLinecap="round" />)}
        {ends.map((e) => <text key={e.s.id} x={w - right + 6} y={e.y} dy="0.35em" fill={e.s.color} fontWeight={e.i ? 400 : 600}>{fitText(e.s.name, right - 8)}</text>)}
        <rect x={8} y={0} width={Math.max(0, w - right - 8)} height={h - 24} fill="transparent"
          onMouseMove={(e) => {
            const px = e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left ?? 0);
            let i = 0;
            dates.forEach((d, k) => { if (Math.abs(x(d) - px) < Math.abs(x(dates[i] ?? d) - px)) i = k; });
            const wk = dates[i];
            if (wk) tip.show(e, { title: `Week of ${fmtWeek(wk)}`, lines: series.map((s) => `${s.name}: ${fmtInt(s.raw[i] ?? 0)} tickets (${pct(ws.share.get(s.id)?.[i] ?? 0)} of week)`) });
          }}
          onMouseLeave={tip.hide} />
      </svg>
      <ul className="links">
        {series.slice(1).map((s) => <li key={s.id}>{s.name}: {s.link ? linkText(m, s.link).join(" · ") : ""}</li>)}
      </ul>
      {tip.node}
    </div>
  );
}

interface GroupRow {
  readonly index: number;
  readonly members: readonly string[];
  readonly tickets: number;
  readonly answerable: number;
  readonly tie: number;
}

export function Groups({ m, g, color, onPin }: { readonly m: Model; readonly g: Graph; readonly color: (meta: IntentRecord) => string; readonly onPin: (id: string) => void }) {
  const rows: GroupRow[] = g.groups.flatMap((members, index) => {
    if (members.length < 2) return [];
    const set = new Set(members);
    const tk = m.tickets.filter((t) => t.needs.some((n) => set.has(n.meta.intent)));
    const answerable = tk.filter((t) => t.needs.some((n) => set.has(n.meta.intent) && n.channel === "answer")).length;
    const internal = g.links.filter((l) => set.has(l.a) && set.has(l.b));
    return [{ index, members, tickets: tk.length, answerable, tie: internal.length ? internal.reduce((s, l) => s + l.w, 0) / internal.length : 0 }];
  });
  if (!rows.length) return <Empty>No groupings at this threshold; lower it to merge more intents</Empty>;
  const name = (id: string) => m.index.meta.get(id)?.name ?? id;
  const cols: readonly Column<GroupRow, "group" | "members" | "tickets" | "answerable" | "tie">[] = [
    { key: "group", label: "Group", render: (r) => {
      const lead = r.members[0];
      const meta = lead === undefined ? undefined : m.index.meta.get(lead);
      return <>{meta && <span className="swatch" style={{ background: color(meta) }} />}{lead === undefined ? "" : `${name(lead)}${r.members.length > 1 ? ` +${r.members.length - 1}` : ""}`}</>;
    } },
    { key: "members", label: "Intents in it", render: (r) => <span className="q">{r.members.map(name).join(" · ")}</span> },
    { key: "tickets", label: "Tickets", numeric: true, sort: (r) => r.tickets, render: (r) => fmtInt(r.tickets) },
    { key: "answerable", label: "Answerable", numeric: true, sort: (r) => r.answerable / (r.tickets || 1), render: (r) => pct(r.answerable / (r.tickets || 1)) },
    { key: "tie", label: "Mean tie", numeric: true, sort: (r) => r.tie, render: (r) => dec2(r.tie) },
  ];
  return <SortableTable rows={rows} columns={cols} rowKey={(r) => String(r.index)} initial={{ key: "tickets", dir: -1 }} onRowClick={(r) => { const lead = r.members[0]; if (lead !== undefined) onPin(lead); }} />;
}

interface Cell {
  readonly a: string;
  readonly b: string;
  readonly v: number;
  readonly link: Link;
}

export function Matrix({ m, g, metric, color, selected, onPin }: {
  readonly m: Model; readonly g: Graph; readonly metric: MatrixMetric; readonly color: (meta: IntentRecord) => string;
  readonly selected: string | null; readonly onPin: (id: string) => void;
}) {
  const [ref, w] = useWidth<HTMLDivElement>(320);
  const tip = useTooltip(ref);
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<SVGGElement>(null);
  const ids = g.order.filter((id) => g.links.some((l) => l.a === id || l.b === id));
  const name = (id: string) => m.index.meta.get(id)?.name ?? id;
  const L = Math.min(Math.max(0, ...ids.map((id) => textWidth(name(id)))), w * 0.32) + 10;
  const cell = Math.max(5, Math.min(16, (w - L - 8) / Math.max(1, ids.length)));
  const h = cell * ids.length + 8;
  useEffect(() => {
    const svg = svgRef.current;
    const layer = zoomRef.current;
    if (!svg || !layer) return undefined;
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([1, 10]).translateExtent([[0, 0], [w, h]])
      .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => layer.setAttribute("transform", e.transform.toString()));
    const sel = select(svg);
    sel.call(z);
    return () => { sel.on(".zoom", null); };
  }, [w, h]);
  if (ids.length < 2) return <Empty>Too few co-occurring intents in view</Empty>;
  const pos = new Map(ids.map((id, i) => [id, i]));
  const cells = new Map<string, Cell>();
  for (const l of g.links) {
    if (!pos.has(l.a) || !pos.has(l.b)) continue;
    const v = l.kind !== "ticket" || metric === "cosine" ? l.w : metric === "support" ? l.support : Math.log2(1 + l.lift);
    for (const [a, b] of [[l.a, l.b], [l.b, l.a]] as const) {
      const prev = cells.get(`${a}|${b}`);
      cells.set(`${a}|${b}`, { a, b, v: (prev?.v ?? 0) + v, link: prev?.link ?? l });
    }
  }
  const vmax = Math.max(1e-9, ...[...cells.values()].map((c) => c.v));
  const fillOf = (v: number) => {
    const k = Math.min(1, 0.15 + (v / vmax) * 0.85);
    return `color-mix(in srgb, ${seriesColor(theme, 0)} ${Math.round(k * 100)}%, ${theme.panel})`;
  };
  const blocks = g.groups.filter((gr) => gr.length > 1).flatMap((gr) => {
    const inView = gr.flatMap((id) => { const p = pos.get(id); return p === undefined ? [] : [p]; });
    return inView.length < 2 ? [] : [{ a: Math.min(...inView), b: Math.max(...inView) }];
  });
  return (
    <div className="chart" ref={ref}>
      <svg ref={svgRef} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Intent co-occurrence matrix">
        <g ref={zoomRef}>
          {ids.map((id, i) => (
            <text key={id} x={L - 8} y={i * cell + cell / 2} dy="0.35em" textAnchor="end" fontSize={Math.min(12, cell)} fill={theme.fg} fontWeight={id === selected ? 600 : 400}>{fitText(name(id), L - 10, Math.min(12, cell))}</text>
          ))}
          {ids.map((id, i) => {
            const meta = m.index.meta.get(id);
            return <rect key={id} x={L + i * cell} y={i * cell} width={cell - 1} height={cell - 1} fill={meta ? color(meta) : theme.muted} fillOpacity={0.55} />;
          })}
          {blocks.map((b) => <rect key={`${b.a}-${b.b}`} x={L + b.a * cell - 1} y={b.a * cell - 1} width={(b.b - b.a + 1) * cell + 1} height={(b.b - b.a + 1) * cell + 1} fill="none" stroke={theme.fgMuted} strokeDasharray="2 2" />)}
          {[...cells.values()].map((c) => (
            <rect key={`${c.a}|${c.b}`} x={L + (pos.get(c.b) ?? 0) * cell} y={(pos.get(c.a) ?? 0) * cell} width={cell - 1} height={cell - 1} rx={1} fill={fillOf(c.v)}
              stroke={c.a === selected || c.b === selected ? theme.fg : "none"} style={{ cursor: "pointer" }}
              onMouseMove={(e) => tip.show(e, { title: `${name(c.a)} ↔ ${name(c.b)}`, lines: linkText(m, c.link) })} onMouseLeave={tip.hide} onClick={() => onPin(c.a)} />
          ))}
        </g>
      </svg>
      {tip.node}
    </div>
  );
}

