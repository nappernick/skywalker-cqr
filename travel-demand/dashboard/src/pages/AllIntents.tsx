import { byIntent, channelCounts, countBy } from "../domain/analytics";
import { CHANNELS, RESOLUTIONS, type Channel, type Resolution } from "../domain/types";
import { HBars } from "../ui/charts/HBars";
import { Heatmap, type HeatRow } from "../ui/charts/Heatmap";
import { CHANNEL_LABEL, RESOLUTION_LABEL } from "../ui/format";
import { Card, Empty } from "../ui/primitives";
import { channelColor, useTheme } from "../ui/theme";
import type { PageProps } from "./types";

export function AllIntents({ model: m, filters }: PageProps) {
  const theme = useTheme();
  const groups = byIntent(m);
  const top = groups.slice(0, 25);
  const cols = RESOLUTIONS.filter((r) => top.some((g) => g.tickets.some((t) => t.resolution === r)));
  const heat: HeatRow<Resolution>[] = top.map((g) => {
    const c = countBy(g.tickets, (t) => t.resolution);
    return { id: g.meta.intent, label: g.meta.name, n: g.tickets.length, values: Object.fromEntries(cols.map((k) => [k, (c.get(k) ?? 0) / g.tickets.length])) };
  });
  return (
    <div className="grid">
      <Card wide title="Every intent by channel" sub="Tickets per intent, split by the channel each ticket's need landed in after the resolver's root cause. Click a bar to filter everything to that intent.">
        {groups.length ? (
          <HBars items={groups.map((g) => ({ id: g.meta.intent, label: g.meta.name, total: g.tickets.length, segs: CHANNELS.map((k) => ({ key: k, v: channelCounts(g.needs, (n) => n.channel)[k] })) }))}
            keys={CHANNELS} color={(c: Channel) => channelColor(theme, c)} keyLabel={(c: Channel) => CHANNEL_LABEL[c]} rowH={22} picked={m.filters.intent} onPick={(id) => filters.toggle("intent", id)} />
        ) : <Empty>No tickets match these filters</Empty>}
      </Card>
      <Card wide title="What was asked vs what fixed it" sub="Share of each intent's tickets by resolver root-cause type, for the 25 largest intents in view. A high knowledge share on an action intent is hidden answerable demand.">
        {heat.length ? <Heatmap rows={heat} cols={cols} colLabel={(r) => RESOLUTION_LABEL[r]} /> : <Empty>No tickets match these filters</Empty>}
      </Card>
    </div>
  );
}
