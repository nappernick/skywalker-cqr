import { byIntent, censusAnswerable, censusCounts, classifierAnswerable, countBy } from "../domain/analytics";
import { CENSUS_LABELS, RESOLUTIONS, type CensusLabel, type Resolution } from "../domain/types";
import { HBars, type BarItem } from "../ui/charts/HBars";
import { Heatmap, type HeatRow } from "../ui/charts/Heatmap";
import { CENSUS_LABEL, dec2, fmtInt, pct, pct1, RESOLUTION_LABEL } from "../ui/format";
import { Card, Empty, Kpi } from "../ui/primitives";
import { InlineBar, SortableTable, type Column } from "../ui/SortableTable";
import { censusColor, seriesColor, useTheme } from "../ui/theme";
import type { PageProps } from "./types";

type Agreement = "both" | "census_only" | "classifier_only" | "neither";
const AGREEMENT: readonly Agreement[] = ["both", "census_only", "classifier_only", "neither"];
const AGREEMENT_LABEL: Readonly<Record<Agreement, string>> = {
  both: "Both say answerable", census_only: "Census only", classifier_only: "Classifier only", neither: "Neither",
};

interface IntentCensus {
  readonly id: string;
  readonly name: string;
  readonly tickets: number;
  readonly census: number;
  readonly classifier: number;
  readonly thenAction: number;
}

export function Census({ model: m, filters }: PageProps) {
  const theme = useTheme();
  const rated = m.tickets.filter((t) => t.census !== null);
  if (!rated.length) return <Empty>No census ratings in this export. Run scripts/census.py and re-export.</Empty>;
  const s = m.index.census;
  const counts = censusCounts(rated);
  const n = rated.length;
  const answerable = counts.fact_answer + counts.self_serve;
  const labels: BarItem<CensusLabel, CensusLabel>[] = CENSUS_LABELS.map((k) => ({ id: k, label: CENSUS_LABEL[k], total: counts[k], segs: [{ key: k, v: counts[k] }] }));
  const agree = countBy(rated, (t): Agreement => {
    const c = censusAnswerable(t);
    const k = classifierAnswerable(t);
    return c && k ? "both" : c ? "census_only" : k ? "classifier_only" : "neither";
  });
  const agreeItems: BarItem<Agreement, Agreement>[] = AGREEMENT.map((k) => ({ id: k, label: AGREEMENT_LABEL[k], total: agree.get(k) ?? 0, segs: [{ key: k, v: agree.get(k) ?? 0 }] }));
  const agreeColor = (k: Agreement) => (k === "both" ? seriesColor(theme, 0) : k === "census_only" ? seriesColor(theme, 7) : k === "classifier_only" ? seriesColor(theme, 1) : theme.muted);
  const res = RESOLUTIONS.filter((r) => rated.some((t) => t.resolution === r));
  const heat: HeatRow<CensusLabel>[] = res.map((r: Resolution) => {
    const ts = rated.filter((t) => t.resolution === r);
    const c = countBy(ts, (t) => t.census);
    return { id: r, label: `${RESOLUTION_LABEL[r]} (${fmtInt(ts.length)})`, n: ts.length, values: Object.fromEntries(CENSUS_LABELS.map((k) => [k, (c.get(k) ?? 0) / ts.length])) };
  });
  const intents: IntentCensus[] = byIntent(m).map((g) => {
    const ts = g.tickets.filter((t) => t.census !== null);
    const share = (f: (t: (typeof ts)[number]) => boolean) => (ts.length ? ts.filter(f).length / ts.length : 0);
    return { id: g.meta.intent, name: g.meta.name, tickets: ts.length, census: share(censusAnswerable), classifier: share(classifierAnswerable), thenAction: share((t) => t.census === "answer_then_action") };
  }).filter((d) => d.tickets > 0);
  const cols: readonly Column<IntentCensus, "name" | "tickets" | "census" | "classifier" | "thenAction">[] = [
    { key: "name", label: "Intent", sort: (d) => d.name, render: (d) => d.name },
    { key: "tickets", label: "Tickets", numeric: true, sort: (d) => d.tickets, render: (d) => fmtInt(d.tickets) },
    { key: "census", label: "Census answerable", numeric: true, sort: (d) => d.census, render: (d) => <>{pct(d.census)}<InlineBar share={d.census} color={seriesColor(theme, 0)} /></> },
    { key: "classifier", label: "Classifier answerable", numeric: true, sort: (d) => d.classifier, render: (d) => pct(d.classifier) },
    { key: "thenAction", label: "Question, then action", numeric: true, sort: (d) => d.thenAction, render: (d) => pct(d.thenAction) },
  ];
  return (
    <>
      <div className="kpis">
        <Kpi label="Answerable by content alone" value={pct1(answerable / n)} note={`${fmtInt(answerable)} of ${fmtInt(n)} tickets in view`} />
        <Kpi label="Content fully answers it" value={pct1(counts.fact_answer / n)} note="FAQ, wiki or policy page" />
        <Kpi label="Plus an action" value={pct1(counts.answer_then_action / n)} note="Answerable question, then someone acts" />
        {s && <Kpi label="Range, all tickets" value={`${pct(s.strict_answerable / s.tickets)}–${pct(s.loose_answerable / s.tickets)}`} note="Both raters vs either rater" />}
        {s && <Kpi label="Rater agreement" value={pct(s.agreement_signatures)} note={`Cohen's κ ${dec2(s.kappa)} · ${fmtInt(s.adjudicated_signatures)} adjudicated`} />}
      </div>
      <div className="grid">
        <Card title="What resolves each ticket" sub={`Every ticket rated by two blind raters from its metadata alone (title, CTI item, labels, root cause), with a third adjudicating disagreements. Judged by whether a reasonable page could answer it, not by today's FAQs.${s ? ` ${fmtInt(s.signatures)} distinct metadata signatures cover all ${fmtInt(s.tickets)} tickets.` : ""}`}>
          <HBars items={labels} keys={CENSUS_LABELS} color={(k) => censusColor(theme, k)} keyLabel={(k) => CENSUS_LABEL[k]} rowH={28} value={(d) => `${fmtInt(d.total)} · ${pct(d.total / n)}`} />
        </Card>
        <Card title="Census vs the intent classifier" sub="Tickets the census rates answerable by content alone, against tickets whose every need the rule-based classifier routes to answer. The totals match closely; the tickets differ.">
          <HBars items={agreeItems} keys={AGREEMENT} color={agreeColor} keyLabel={(k) => AGREEMENT_LABEL[k]} rowH={30} value={(d) => `${fmtInt(d.total)} · ${pct(d.total / n)}`} />
        </Card>
        <Card wide title="Root cause vs census label" sub="Share of each resolver root-cause type by census label. Defect tickets that rate as content-answerable are the non-fault troubleshooting the metadata can show; the true share is likely higher.">
          <Heatmap rows={heat} cols={CENSUS_LABELS} colLabel={(k) => CENSUS_LABEL[k]} />
        </Card>
        <Card wide title="Census by intent" sub="Click a row to filter to that intent.">
          <SortableTable rows={intents} columns={cols} rowKey={(d) => d.id} initial={{ key: "tickets", dir: -1 }} onRowClick={(d) => filters.toggle("intent", d.id)} />
        </Card>
      </div>
    </>
  );
}
