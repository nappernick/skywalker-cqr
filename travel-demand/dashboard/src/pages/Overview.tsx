import { channelCounts, countBy, groupBy } from "../domain/analytics";
import { toMonth } from "../domain/parse";
import { CHANNELS, type Channel, type Month } from "../domain/types";
import { HBars } from "../ui/charts/HBars";
import { StackedColumns, type MonthMarker } from "../ui/charts/StackedColumns";
import { CHANNEL_LABEL, fmtInt, pct } from "../ui/format";
import { Card, Empty } from "../ui/primitives";
import { channelColor, useTheme } from "../ui/theme";
import type { PageProps } from "./types";

// Events identified in the analysis (FINDINGS.md); fixed annotations, not data.
const EVENTS: readonly MonthMarker[] = [
  { month: toMonth("2026-01"), label: "Tool migration wave" },
  { month: toMonth("2026-07"), label: "CTI tree reorganised" },
  { month: toMonth("2026-08"), label: "V-Pay jump" },
];

export function Overview({ model: m, filters }: PageProps) {
  const theme = useTheme();
  const color = (c: Channel) => channelColor(theme, c);
  const label = (c: Channel) => CHANNEL_LABEL[c];
  const byChannel = channelCounts(m.tickets, (t) => t.channel);
  const n = m.tickets.length;
  const domains = [...groupBy(m.needs, (x) => x.meta.domain)]
    .map(([d, needs]) => ({ id: d, label: d, total: needs.length, segs: CHANNELS.map((k) => ({ key: k, v: channelCounts(needs, (x) => x.channel)[k] })) }))
    .sort((a, b) => b.total - a.total);
  const perMonth = new Map<Month, Map<Channel, number>>();
  for (const [mo, ts] of groupBy(m.tickets, (t) => t.month)) perMonth.set(mo, countBy(ts, (t) => t.channel));

  return (
    <div className="grid">
      <Card title="What would best replace the human" sub="Tickets by the channel of their hardest need. Answer is the documentation set Skywalker targets.">
        <HBars items={CHANNELS.map((k) => ({ id: k, label: label(k), total: byChannel[k], segs: [{ key: k, v: byChannel[k] }] }))}
          keys={CHANNELS} color={color} keyLabel={label} rowH={30} value={(d) => `${fmtInt(d.total)} · ${pct(d.total / (n || 1))}`}
          picked={m.filters.channel} onPick={(id) => filters.toggle("channel", id)} />
      </Card>
      <Card title="Channel mix by domain" sub="Needs (ticket–intent rows) per domain, split by channel. Click a bar to filter to that domain.">
        {domains.length ? <HBars items={domains} keys={CHANNELS} color={color} keyLabel={label} rowH={28} picked={m.filters.domain} onPick={(id) => filters.toggle("domain", id)} />
          : <Empty>No tickets match these filters</Empty>}
      </Card>
      <Card wide title="Tickets per month by channel" sub="By creation month. November and December 2025 hold only tickets still open into the export, so they are partial. Drag across months to filter every view to that range.">
        <StackedColumns months={m.months} keys={CHANNELS} value={(mo, k) => perMonth.get(mo)?.get(k) ?? 0} color={color} keyLabel={label}
          unit="tickets" markers={EVENTS} onBrush={(from, to) => filters.set({ from, to })} />
      </Card>
    </div>
  );
}
