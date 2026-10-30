import { scaleLinear, scaleLog } from "d3";
import { useState } from "react";
import { answerableRows, type AnswerableRow } from "../domain/analytics";
import { HBars, type BarItem } from "../ui/charts/HBars";
import { CHANNEL_LABEL, dec1, fmtInt, pct } from "../ui/format";
import { useWidth } from "../ui/hooks";
import { textWidth } from "../ui/measure";
import { Card, CoveragePill, Empty } from "../ui/primitives";
import { InlineBar, SortableTable, type Column } from "../ui/SortableTable";
import { channelColor, seriesColor, useTheme } from "../ui/theme";
import { useTooltip } from "../ui/Tooltip";
import type { PageProps } from "./types";

type Part = "direct" | "hidden";
const PARTS: readonly Part[] = ["direct", "hidden"];
const PART_LABEL: Readonly<Record<Part, string>> = { direct: "Asked as a question", hidden: "Hidden in action tickets" };

function Scatter({ rows, picked, onPick }: { readonly rows: readonly AnswerableRow[]; readonly picked: string | null; readonly onPick: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>(300);
  const tip = useTooltip(ref);
  const theme = useTheme();
  const h = 420;
  const left = textWidth("100%") + 12;
  const minT = Math.min(...rows.map((d) => d.total));
  const maxT = Math.max(...rows.map((d) => d.total));
  const x = scaleLog().domain([Math.max(5, minT * 0.8), maxT * 1.2]).range([left, w - 10]);
  const y = scaleLinear().domain([0, 1]).range([h - 34, 12]);
  const r = (d: AnswerableRow) => 3 + Math.sqrt(d.tickets) / 2;
  const xt = x.ticks(Math.max(2, Math.floor(w / 110))).filter((v) => ["1", "2", "5"].includes(String(v)[0] ?? ""));
  const boxes: { x1: number; x2: number; y1: number; y2: number }[] = [];
  const labels = [...rows].sort((a, b) => b.tickets - a.tickets).slice(0, 12).flatMap((d) => {
    const tw = textWidth(d.meta.name);
    let tx = x(d.total) + r(d) + 3;
    if (tx + tw > w - 4) tx = x(d.total) - r(d) - 3 - tw;
    const ty = y(d.share) + 4;
    const box = { x1: tx, x2: tx + tw, y1: ty - 11, y2: ty + 2 };
    if (tx < left || boxes.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1)) return [];
    boxes.push(box);
    return [<text key={d.meta.intent} x={tx} y={ty} fill={theme.fgMuted}>{d.meta.name}</text>];
  });
  return (
    <div className="chart" ref={ref}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Intent volume against answerable share">
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line x1={left} x2={w - 10} y1={y(t)} y2={y(t)} stroke={theme.grid} />
            <text x={left - 6} y={y(t)} dy="0.35em" textAnchor="end" fill={theme.fgMuted}>{pct(t)}</text>
          </g>
        ))}
        {xt.map((t) => <text key={t} x={x(t)} y={h - 16} textAnchor="middle" fill={theme.fgMuted}>{fmtInt(t)}</text>)}
        <text x={w - 10} y={h - 2} textAnchor="end" fill={theme.fgMuted}>Tickets with this intent (log scale)</text>
        {rows.map((d) => (
          <circle key={d.meta.intent} cx={x(d.total)} cy={y(d.share)} r={r(d)} fill={channelColor(theme, d.meta.best_channel)} fillOpacity={0.75}
            stroke={d.meta.intent === picked ? theme.fg : theme.panel} strokeWidth={d.meta.intent === picked ? 2 : 1} style={{ cursor: "pointer" }}
            onMouseMove={(e) => tip.show(e, { title: d.meta.name, lines: [`${fmtInt(d.total)} tickets, ${fmtInt(d.tickets)} answerable (${pct(d.share)})`, `Default channel: ${CHANNEL_LABEL[d.meta.best_channel]}`] })}
            onMouseLeave={tip.hide} onClick={() => onPick(d.meta.intent)} />
        ))}
        {labels}
      </svg>
      {tip.node}
    </div>
  );
}

type ColKey = "name" | "tickets" | "share" | "hiddenShare" | "transfer" | "notRiver" | "tier2" | "days" | "region" | "coverage";

export function Answerable({ model: m, filters }: PageProps) {
  const theme = useTheme();
  const [q, setQ] = useState("");
  const rows = answerableRows(m);
  const withAns = rows.filter((d) => d.answerableNeeds > 0).sort((a, b) => b.answerableNeeds - a.answerableNeeds);
  const totalAns = withAns.reduce((s, d) => s + d.answerableNeeds, 0);
  let cum = 0;
  const pareto: BarItem<Part>[] = withAns.slice(0, 25).map((d) => {
    cum += d.answerableNeeds;
    const share = cum / (totalAns || 1);
    return {
      id: d.meta.intent, label: d.meta.name, total: d.answerableNeeds,
      segs: [{ key: "direct", v: d.answerableNeeds - d.hidden }, { key: "hidden", v: d.hidden }],
      tip: { title: d.meta.name, lines: [`Answerable needs: ${fmtInt(d.answerableNeeds)}`, `From action tickets resolved by explanation: ${fmtInt(d.hidden)}`, `Running share: ${pct(share)}`] },
    };
  });
  const cumShare = new Map<string, number>();
  let run = 0;
  for (const d of withAns) { run += d.answerableNeeds; cumShare.set(d.meta.intent, run / (totalAns || 1)); }
  const query = q.trim().toLowerCase();
  const table = rows.filter((d) => d.tickets > 0 && (!query || `${d.meta.name} ${d.meta.faq_question}`.toLowerCase().includes(query)));
  const maxN = Math.max(1, ...table.map((d) => d.tickets));
  const cols: readonly Column<AnswerableRow, ColKey>[] = [
    { key: "name", label: "Intent", sort: (d) => d.meta.name, render: (d) => <><span>{d.meta.name}</span><span className="q">{d.meta.faq_question}</span></> },
    { key: "tickets", label: "Answerable tickets", numeric: true, sort: (d) => d.tickets, render: (d) => <>{fmtInt(d.tickets)}<InlineBar share={d.tickets / maxN} color={seriesColor(theme, 0)} /></> },
    { key: "share", label: "Share of intent", numeric: true, sort: (d) => d.share, render: (d) => pct(d.share) },
    { key: "hiddenShare", label: "Hidden in action", numeric: true, sort: (d) => d.hiddenShare, render: (d) => pct(d.hiddenShare) },
    { key: "transfer", label: "From expense team", numeric: true, sort: (d) => d.transfer, render: (d) => pct(d.transfer) },
    { key: "notRiver", label: "Chose “not on River”", numeric: true, sort: (d) => d.notRiver, render: (d) => pct(d.notRiver) },
    { key: "tier2", label: "Tier 2+", numeric: true, sort: (d) => d.tier2, render: (d) => pct(d.tier2) },
    { key: "days", label: "Median days", numeric: true, sort: (d) => d.medianDays, render: (d) => dec1(d.medianDays) },
    { key: "region", label: "Top region", sort: (d) => d.topRegion ?? "", render: (d) => d.topRegion ?? "—" },
    { key: "coverage", label: "FAQ coverage", sort: (d) => d.coverage ?? "", render: (d) => <CoveragePill coverage={d.coverage} /> },
  ];
  const scatterRows = rows.filter((d) => d.total >= 10);
  return (
    <div className="grid">
      <Card title="Answerable needs, largest first" sub="Answerable needs per intent with the running share of all answerable needs. The coloured part was asked as a question; the grey part came from tickets that asked for an action but were resolved by an explanation.">
        {pareto.length ? (
          <HBars items={pareto} keys={PARTS} color={(k) => (k === "direct" ? seriesColor(theme, 0) : theme.muted)} keyLabel={(k) => PART_LABEL[k]}
            value={(d) => `${fmtInt(d.total)} · ${pct(cumShare.get(d.id) ?? 0)}`} picked={m.filters.intent} onPick={(id) => filters.toggle("intent", id)} />
        ) : <Empty>No answerable needs match these filters</Empty>}
      </Card>
      <Card title="Volume vs how answerable" sub="Each dot is an intent with 10+ tickets in view, coloured by its default channel. Up and right is big and mostly answerable; low and right is big but mostly an action, with some hidden answerable demand.">
        {scatterRows.length ? <Scatter rows={scatterRows} picked={m.filters.intent} onPick={(id) => filters.toggle("intent", id)} /> : <Empty>No intents with 10+ tickets match these filters</Empty>}
      </Card>
      <Card wide title="Answerable intents in detail" sub="The FAQ backlog. Sort by any column; search matches the intent and its question. Burden columns describe the answerable tickets only.">
        <input className="search" type="search" placeholder="Search intents" aria-label="Search intents" value={q} onChange={(e) => setQ(e.target.value)} />
        <SortableTable rows={table} columns={cols} rowKey={(d) => d.meta.intent} initial={{ key: "tickets", dir: -1 }} empty="No answerable intents match" />
      </Card>
    </div>
  );
}
