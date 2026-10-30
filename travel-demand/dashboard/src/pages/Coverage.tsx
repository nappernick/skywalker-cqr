import { coverageRows, isAnswerFirst, countBy, type CoverageRow } from "../domain/analytics";
import { toMonth } from "../domain/parse";
import { COVERAGES, type Coverage as Cov, type Month } from "../domain/types";
import { HBars, type BarItem } from "../ui/charts/HBars";
import { StackedColumns } from "../ui/charts/StackedColumns";
import { COVERAGE_LABEL, fmtInt } from "../ui/format";
import { Card, CoveragePill, Empty, Legend } from "../ui/primitives";
import { SortableTable, type Column } from "../ui/SortableTable";
import { coverageColor, useTheme } from "../ui/theme";
import type { PageProps } from "./types";

const CERTIFIED: Month = toMonth("2026-05"); // most FAQs first certified (FINDINGS.md section 9)
const COV_ORDER: Readonly<Record<Cov, number>> = { full: 0, partial: 1, none: 2 };
type ColKey = "name" | "coverage" | "demand" | "answerable" | "answerFirst" | "after" | "gap" | "faqs";

export function Coverage({ model: m, filters }: PageProps) {
  const theme = useTheme();
  const color = (c: Cov) => coverageColor(theme, c);
  const label = (c: Cov) => COVERAGE_LABEL[c];
  const covOf = (meta: { readonly coverage: Cov | null }): Cov => meta.coverage ?? "none";
  const sets = [
    { id: "answerable", label: "Answerable needs", needs: m.needs.filter((n) => n.channel === "answer") },
    { id: "answer_first", label: "Answer-first needs", needs: m.needs.filter(isAnswerFirst) },
  ].filter((d) => d.needs.length).map((d): BarItem<Cov> => {
    const c = countBy(d.needs, (n) => covOf(n.meta));
    return { id: d.id, label: d.label, total: d.needs.length, segs: COVERAGES.map((k) => ({ key: k, v: c.get(k) ?? 0 })) };
  });
  const ans = m.needs.filter((n) => n.channel === "answer");
  const monthly = new Map<Month, Map<Cov, Set<number>>>();
  for (const n of ans) {
    const byCov = monthly.get(n.ticket.month) ?? new Map<Cov, Set<number>>();
    monthly.set(n.ticket.month, byCov);
    const set = byCov.get(covOf(n.meta)) ?? new Set<number>();
    byCov.set(covOf(n.meta), set);
    set.add(n.ticket.k);
  }
  const rows = coverageRows(m);
  const backlog: BarItem<Cov>[] = rows.filter((d) => d.coverage !== "full" && d.demand > 0).sort((a, b) => b.demand - a.demand).slice(0, 20).map((d) => ({
    id: d.meta.intent, label: d.meta.name, total: d.demand, segs: [{ key: covOf(d), v: d.demand }],
    tip: { title: d.meta.name, lines: [label(covOf(d)), `Answerable tickets: ${fmtInt(d.answerable)}`, `Answer-first tickets: ${fmtInt(d.answerFirst)}`, d.meta.gap].filter(Boolean) },
  }));
  const cols: readonly Column<CoverageRow, ColKey>[] = [
    { key: "name", label: "Intent", sort: (d) => d.meta.name, render: (d) => d.meta.name },
    { key: "coverage", label: "Coverage", sort: (d) => COV_ORDER[covOf(d)], render: (d) => <CoveragePill coverage={d.coverage} /> },
    { key: "demand", label: "Doc demand", numeric: true, sort: (d) => d.demand, render: (d) => fmtInt(d.demand) },
    { key: "answerable", label: "Answerable", numeric: true, sort: (d) => d.answerable, render: (d) => fmtInt(d.answerable) },
    { key: "answerFirst", label: "Answer-first", numeric: true, sort: (d) => d.answerFirst, render: (d) => fmtInt(d.answerFirst) },
    { key: "after", label: "Tickets after FAQ", numeric: true, sort: (d) => d.afterFaq, render: (d) => fmtInt(d.afterFaq) },
    { key: "gap", label: "What is missing", sort: (d) => d.meta.gap, render: (d) => <span className="q">{d.meta.gap || "—"}</span> },
    { key: "faqs", label: "Covering FAQs", render: (d) => <span className="q">{d.meta.faq_titles || "—"}</span> },
  ];
  return (
    <>
      <Legend label="FAQ coverage" items={COVERAGES.map((c) => ({ key: c, label: label(c), color: color(c) }))} />
      <div className="grid">
        <Card title="How much of the documentation demand the FAQs cover" sub="Needs judged against all 104 fragments of Skywalker's FAQ corpus (version 2026-10-28). Answer-first needs are action requests that start with an eligibility or process question.">
          {sets.length ? <HBars items={sets} keys={COVERAGES} color={color} keyLabel={label} rowH={34} labelShare={0.36} value={(d) => `${fmtInt(d.total)} needs`} />
            : <Empty>No documentation demand matches these filters</Empty>}
        </Card>
        <Card title="Answerable tickets per month, by coverage" sub="Most FAQs were first certified in May 2026. Answerable tickets on fully covered topics did not fall after it; certification is not proof Skywalker was live or used.">
          {ans.length ? <StackedColumns months={m.months} keys={COVERAGES} value={(mo, k) => monthly.get(mo)?.get(k)?.size ?? 0} color={color} keyLabel={label}
            unit="answerable tickets" height={260} markers={[{ month: CERTIFIED, label: "FAQs certified" }]} /> : <Empty>No answerable needs match these filters</Empty>}
        </Card>
        <Card wide title="Content backlog" sub="Intents without a full answer, ranked by the documentation demand a page would serve: answerable plus answer-first tickets. Click a bar to filter to that intent.">
          {backlog.length ? <HBars items={backlog} keys={COVERAGES} color={color} keyLabel={label} picked={m.filters.intent} onPick={(id) => filters.toggle("intent", id)} />
            : <Empty>No coverage gaps match these filters</Empty>}
        </Card>
        <Card wide title="Coverage by intent" sub="The judgment, the FAQs that answer each intent and what is missing. Tickets after FAQ counts tickets created in or after the month the covering FAQ was first certified.">
          <SortableTable rows={rows} columns={cols} rowKey={(d) => d.meta.intent} initial={{ key: "demand", dir: -1 }} empty="No intents match these filters" />
        </Card>
      </div>
    </>
  );
}
