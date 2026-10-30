import { byIntent, channelCounts, groupBy } from "../domain/analytics";
import { CHANNELS, ORIGINS, type Channel, type Origin } from "../domain/types";
import { HBars, type BarItem } from "../ui/charts/HBars";
import { CHANNEL_LABEL, fmtInt, ORIGIN_LABEL, pct } from "../ui/format";
import { Card, Empty } from "../ui/primitives";
import { channelColor, seriesColor, useTheme } from "../ui/theme";
import type { PageProps } from "./types";

export function Agents({ model: m, filters }: PageProps) {
  const theme = useTheme();
  const caps: BarItem<Channel>[] = [...groupBy(m.needs.filter((n) => n.channel === "agent_action" && n.meta.agent_capability !== null), (n) => n.meta.agent_capability ?? "")]
    .map(([cap, needs]) => ({
      id: cap, label: cap, total: needs.length, segs: [{ key: "agent_action" as const, v: needs.length }],
      tip: { title: cap, lines: [`${fmtInt(needs.length)} needs`, ...[...new Set(needs.map((n) => n.meta.name))].slice(0, 4)] },
    })).sort((a, b) => b.total - a.total);
  const transfer: BarItem<"share">[] = byIntent(m).filter((g) => g.tickets.length >= 15).flatMap((g) => {
    const n = g.tickets.filter((t) => t.resolution === "routing").length;
    const share = n / g.tickets.length;
    return n ? [{ id: g.meta.intent, label: g.meta.name, total: share, segs: [{ key: "share" as const, v: share }],
      tip: { title: g.meta.name, lines: [`${fmtInt(n)} of ${fmtInt(g.tickets.length)} tickets transferred (${pct(share)})`] } }] : [];
  }).sort((a, b) => b.total - a.total).slice(0, 15);
  const origins: BarItem<Channel, Origin>[] = ORIGINS.flatMap((o) => {
    const ts = m.tickets.filter((t) => t.origin === o);
    if (!ts.length) return [];
    const c = channelCounts(ts, (t) => t.channel);
    const segs = CHANNELS.map((k) => ({ key: k, v: c[k] / ts.length }));
    return [{ id: o, label: ORIGIN_LABEL[o], total: 1, segs, tip: { title: `${ORIGIN_LABEL[o]} · ${fmtInt(ts.length)} tickets`, lines: segs.filter((s) => s.v).map((s) => `${CHANNEL_LABEL[s.key]}: ${pct(s.v)}`) } }];
  });
  const originCount = (o: Origin) => m.tickets.filter((t) => t.origin === o).length;
  return (
    <div className="grid">
      <Card wide title="Agent capabilities by demand" sub="Needs in the agent-action channel, grouped by the system access an agent would need. Assumes the work is automatable, not that the access exists today. These are new agentic capabilities, separate from answering questions.">
        {caps.length ? <HBars items={caps} keys={["agent_action"]} color={(c) => channelColor(theme, c)} keyLabel={(c) => CHANNEL_LABEL[c]} labelShare={0.55} />
          : <Empty>No agent-action needs match these filters</Empty>}
      </Card>
      <Card title="Transferred in from the expense team" sub="Share of each intent's tickets whose root cause is a transfer from the expense team, intents with 15+ tickets. These are travel-policy questions asked at expense time.">
        {transfer.length ? <HBars items={transfer} keys={["share"]} color={() => seriesColor(theme, 0)} keyLabel={() => "Transferred"} max={1} value={(d) => pct(d.total)}
          picked={m.filters.intent} onPick={(id) => filters.toggle("intent", id)} /> : <Empty>No transferred tickets match these filters</Empty>}
      </Card>
      <Card title="How people filed, by channel" sub="Share of tickets per filing route by channel. People who skip River's help menu ask answerable questions more often.">
        {origins.length ? <HBars items={origins} keys={CHANNELS} color={(c) => channelColor(theme, c)} keyLabel={(c) => CHANNEL_LABEL[c]} rowH={34} max={1}
          value={(d) => `${fmtInt(originCount(d.id))} tickets`} picked={m.filters.origin} onPick={(id) => filters.toggle("origin", id)} /> : <Empty>No tickets match these filters</Empty>}
      </Card>
    </div>
  );
}
