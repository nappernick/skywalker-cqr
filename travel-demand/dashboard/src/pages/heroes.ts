import { byIntent, censusAnswerable, countBy, groupBy, isAnswerFirst } from "../domain/analytics";
import type { Model } from "../domain/model";
import { fmtInt, fmtMonth, pct } from "../ui/format";

export const TAB_IDS = ["overview", "map", "census", "answerable", "coverage", "intents", "time", "bundles", "agents"] as const;
export type TabId = (typeof TAB_IDS)[number];

export interface Hero {
  readonly title: string;
  readonly summary: string;
  /** The page's one-line finding, computed from the filtered data. */
  readonly statement: string;
}

const share = (part: number, whole: number) => pct(whole ? part / whole : 0);

/** Each page's numbered section: title, one-line summary and a data-driven headline. */
export function heroFor(tab: TabId, m: Model): Hero {
  const n = m.tickets.length;
  if (!n) return { title: "No tickets in view", summary: "Widen or reset the filters.", statement: "Nothing matches these filters." };
  const count = (f: (t: Model["tickets"][number]) => boolean) => m.tickets.filter(f).length;
  switch (tab) {
    case "overview":
      return {
        title: "Travel support demand, Nov 2025 – Sep 2026",
        summary: `${fmtInt(n)} travel-support tickets in view, each counted under its hardest need: what would best replace the human who handled it.`,
        statement: `${share(count((t) => t.channel === "answer"), n)} could be answered from docs. ${share(count((t) => t.channel === "agent_action"), n)} need an agent to act.`,
      };
    case "map": {
      const domains = [...groupBy(m.needs, (x) => x.meta.domain)].map(([d, v]) => ({ d, k: v.length })).sort((a, b) => b.k - a.k);
      const top = domains[0];
      return {
        title: "Intent map",
        summary: `${new Set(m.needs.map((x) => x.meta.intent)).size} intents in ${domains.length} categories, placed by meaning and sized by how often they are asked.`,
        statement: top ? `${top.d} is ${share(top.k, m.needs.length)} of all needs.` : "No needs in view.",
      };
    }
    case "census": {
      const rated = m.tickets.filter((t) => t.census !== null);
      if (!rated.length) return { title: "Answerability census", summary: "No census ratings in this export.", statement: "Run the census to fill this page." };
      return {
        title: "Answerability census",
        summary: "Every ticket rated by two blind raters from its metadata alone; a third settled disagreements. Judged by whether a reasonable page could answer it, not by today's FAQs.",
        statement: `${share(rated.filter(censusAnswerable).length, rated.length)} are answerable by content alone. ${share(rated.filter((t) => t.census === "answer_then_action").length, rated.length)} more need an answer, then an action.`,
      };
    }
    case "answerable": {
      const ans = m.needs.filter((x) => x.channel === "answer");
      const sizes = [...countBy(ans, (x) => x.meta.intent).values()].sort((a, b) => b - a);
      const top10 = sizes.slice(0, 10).reduce((s, v) => s + v, 0);
      return {
        title: "The answerable set",
        summary: "Needs fully answered by documentation, by intent, with the burden they carry and their FAQ coverage.",
        statement: ans.length ? `Ten intents hold ${share(top10, ans.length)} of answerable demand.` : "No answerable needs in view.",
      };
    }
    case "coverage": {
      const doc = m.needs.filter((x) => x.channel === "answer" || isAnswerFirst(x));
      return {
        title: "FAQ coverage",
        summary: "Documentation demand judged against all 104 fragments of the Skywalker FAQ corpus. A floor: the unified knowledge base is larger.",
        statement: `${share(doc.filter((x) => x.meta.coverage === "full").length, doc.length)} of documentation demand has a full FAQ answer.`,
      };
    }
    case "intents": {
      const groups = byIntent(m);
      const top10 = groups.slice(0, 10).reduce((s, g) => s + g.needs.length, 0);
      return {
        title: "Every intent",
        summary: "Each intent by the channel its tickets landed in, and by what the resolver found the ticket to be.",
        statement: `${groups.length} intents. The top ten carry ${share(top10, m.needs.length)} of all needs.`,
      };
    }
    case "time": {
      const peak = [...countBy(m.tickets, (t) => t.month)].sort((a, b) => b[1] - a[1])[0];
      return {
        title: "Time and place",
        summary: "Monthly volume for the largest intents, where each comes from, and which need jurisdiction-aware answers.",
        statement: peak ? `${fmtMonth(peak[0])} was the busiest month: ${fmtInt(peak[1])} tickets.` : "No months in view.",
      };
    }
    case "bundles":
      return {
        title: "Bundles and journeys",
        summary: "Needs raised in the same ticket, and what the same person asks next within 30 days.",
        statement: `${share(count((t) => t.n_intents > 1), n)} of tickets carry more than one need.`,
      };
    case "agents":
      return {
        title: "Agents and routing",
        summary: "Work an agent with system access could do end to end. These are new agentic capabilities, separate from answering questions in Slack.",
        statement: `${share(count((t) => t.channel === "agent_action"), n)} of tickets need a system action, not an answer.`,
      };
  }
}
