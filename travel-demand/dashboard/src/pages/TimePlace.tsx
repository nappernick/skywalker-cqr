import { scaleBand, scaleLinear } from "d3";
import { byIntent, countBy, mode, type IntentGroup } from "../domain/analytics";
import { REGIONS, type Month, type Region } from "../domain/types";
import { Heatmap, type HeatRow } from "../ui/charts/Heatmap";
import { fmtInt, fmtMonth, pct } from "../ui/format";
import { useWidth } from "../ui/hooks";
import { fitText } from "../ui/measure";
import { Card, Empty } from "../ui/primitives";
import { InlineBar, SortableTable, type Column } from "../ui/SortableTable";
import { seriesColor, useTheme } from "../ui/theme";
import { useTooltip } from "../ui/Tooltip";
import type { PageProps } from "./types";

function Multiples({ groups, months }: { readonly groups: readonly IntentGroup[]; readonly months: readonly Month[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(300);
  const tip = useTooltip(ref);
  const theme = useTheme();
  const series = groups.map((g) => {
    const c = countBy(g.tickets, (t) => t.month);
    return { g, vals: months.map((mo) => ({ mo, v: c.get(mo) ?? 0 })) };
  });
  const cols = Math.max(1, Math.min(4, Math.floor(w / 230)));
  const pw = w / cols;
  const ph = 120;
  const h = Math.ceil(series.length / cols) * ph;
  const ymax = Math.max(1, ...series.flatMap((s) => s.vals.map((v) => v.v)));
  const x = scaleBand<Month>().domain(months).range([4, pw - 16]).padding(0.2);
  const y = scaleLinear().domain([0, ymax]).range([ph - 22, 26]);
  const first = months[0];
  const last = months.at(-1);
  return (
    <div className="chart" ref={ref}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Monthly tickets for the largest intents">
        {series.map((s, i) => (
          <g key={s.g.meta.intent} transform={`translate(${(i % cols) * pw},${Math.floor(i / cols) * ph})`}>
            <text x={4} y={14} fill={theme.fg}>{fitText(s.g.meta.name, pw - 60)}</text>
            <text x={pw - 16} y={14} textAnchor="end" fill={theme.fgMuted}>{fmtInt(s.g.tickets.length)}</text>
            <line x1={4} x2={pw - 16} y1={ph - 22} y2={ph - 22} stroke={theme.axis} />
            {s.vals.map((d) => (
              <rect key={d.mo} x={x(d.mo) ?? 0} width={x.bandwidth()} y={y(d.v)} height={ph - 22 - y(d.v)} rx={1} fill={seriesColor(theme, 0)}
                onMouseMove={(e) => tip.show(e, { title: s.g.meta.name, lines: [`${fmtMonth(d.mo)}: ${fmtInt(d.v)} tickets`] })} onMouseLeave={tip.hide} />
            ))}
            {first !== undefined && <text x={4} y={ph - 8} fill={theme.fgMuted}>{fmtMonth(first)}</text>}
            {last !== undefined && <text x={pw - 16} y={ph - 8} textAnchor="end" fill={theme.fgMuted}>{fmtMonth(last)}</text>}
          </g>
        ))}
      </svg>
      {tip.node}
    </div>
  );
}

interface CountryRow {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly share: number;
  readonly tickets: number;
}

export function TimePlace({ model: m }: PageProps) {
  const theme = useTheme();
  const groups = byIntent(m);
  const region: HeatRow<Region>[] = groups.slice(0, 20).map((g) => {
    const c = countBy(g.tickets, (t) => t.region);
    return { id: g.meta.intent, label: g.meta.name, n: g.tickets.length, values: Object.fromEntries(REGIONS.map((k) => [k, (c.get(k) ?? 0) / g.tickets.length])) };
  });
  const countries: CountryRow[] = groups.filter((g) => g.tickets.length >= 20).flatMap((g) => {
    const country = mode(g.tickets, (t) => t.country);
    if (country === null) return [];
    const n = g.tickets.filter((t) => t.country === country).length;
    return [{ id: g.meta.intent, name: g.meta.name, country, share: n / g.tickets.length, tickets: g.tickets.length }];
  }).sort((a, b) => b.share - a.share).slice(0, 15);
  const cols: readonly Column<CountryRow, "name" | "country" | "share" | "tickets">[] = [
    { key: "name", label: "Intent", render: (d) => d.name },
    { key: "country", label: "Top country", render: (d) => d.country },
    { key: "share", label: "Share", numeric: true, sort: (d) => d.share, render: (d) => <>{pct(d.share)}<InlineBar share={d.share} color={seriesColor(theme, 0)} /></> },
    { key: "tickets", label: "Tickets", numeric: true, sort: (d) => d.tickets, render: (d) => fmtInt(d.tickets) },
  ];
  return (
    <div className="grid">
      <Card wide title="Monthly tickets for the 12 largest intents" sub="One shared scale, so the heights compare across panels. Look for January's migration wave and August's V-Pay jump.">
        {groups.length ? <Multiples groups={groups.slice(0, 12)} months={m.months} /> : <Empty>No tickets match these filters</Empty>}
      </Card>
      <Card title="Where each intent comes from" sub="Share of each intent's tickets by region, for the 20 largest intents in view.">
        {region.length ? <Heatmap rows={region} cols={REGIONS} colLabel={(r) => r} /> : <Empty>No tickets match these filters</Empty>}
      </Card>
      <Card title="Country-specific intents" sub="Intents with 20+ tickets where one country dominates. These answers need jurisdiction-aware content.">
        <SortableTable rows={countries} columns={cols} rowKey={(d) => d.id} initial={{ key: "share", dir: -1 }} empty="No intents with 20+ tickets match" />
      </Card>
    </div>
  );
}
