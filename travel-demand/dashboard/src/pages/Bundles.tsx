import { pairs, type PairRow } from "../domain/analytics";
import { HBars, type BarItem } from "../ui/charts/HBars";
import { dec1, fmtInt, pct } from "../ui/format";
import { Card, Empty } from "../ui/primitives";
import { InlineBar, SortableTable, type Column } from "../ui/SortableTable";
import { seriesColor, useTheme } from "../ui/theme";
import type { PageProps } from "./types";

type Journey = "same" | "next";
const JOURNEYS: readonly Journey[] = ["same", "next"];

export function Bundles({ model: m }: PageProps) {
  const theme = useTheme();
  const rows = pairs(m, 5).slice(0, 20);
  const maxS = Math.max(1, ...rows.map((d) => d.tickets));
  const cols: readonly Column<PairRow, "a" | "b" | "tickets" | "pba" | "lift">[] = [
    { key: "a", label: "A", render: (d) => d.a.name },
    { key: "b", label: "B", render: (d) => d.b.name },
    { key: "tickets", label: "Tickets", numeric: true, sort: (d) => d.tickets, render: (d) => <>{fmtInt(d.tickets)}<InlineBar share={d.tickets / maxS} color={seriesColor(theme, 0)} /></> },
    { key: "pba", label: "P(B|A)", numeric: true, sort: (d) => d.pba, render: (d) => pct(d.pba) },
    { key: "lift", label: "Lift", numeric: true, sort: (d) => d.lift, render: (d) => dec1(d.lift) },
  ];
  const meta = m.index.meta;
  const journeys: BarItem<Journey>[] = [...m.index.transitions].sort((a, b) => b.transitions - a.transitions).flatMap((r) => {
    const from = meta.get(r.from_intent);
    const to = meta.get(r.next_intent_30d);
    if (!from || !to) return [];
    const key: Journey = r.same_intent ? "same" : "next";
    return [{ id: `${r.from_intent}>${r.next_intent_30d}`, label: r.same_intent ? `${from.name} (again)` : `${from.name} → ${to.name}`, total: r.transitions, segs: [{ key, v: r.transitions }] }];
  }).slice(0, 20);
  return (
    <div className="grid">
      <Card title="Needs that arrive together" sub="Intent pairs in the same ticket, 5+ tickets in view. Lift above 1 means they co-occur more than chance; P(B|A) is how often A brings B. Good candidates for one page.">
        <SortableTable rows={rows} columns={cols} rowKey={(d) => `${d.a.intent}|${d.b.intent}`} initial={{ key: "tickets", dir: -1 }} empty="No pairs with 5+ tickets in view" />
      </Card>
      <Card title="What the same person asks next" sub="Intent of a requester's next ticket within 30 days, all tickets. Pre-computed with pseudonymous requesters, so filters do not apply here.">
        {journeys.length ? (
          <HBars items={journeys} keys={JOURNEYS} labelShare={0.6} color={(k) => (k === "next" ? seriesColor(theme, 0) : theme.muted)}
            keyLabel={(k) => (k === "same" ? "Same need again" : "A different need next")} />
        ) : <Empty>No journeys</Empty>}
      </Card>
    </div>
  );
}
