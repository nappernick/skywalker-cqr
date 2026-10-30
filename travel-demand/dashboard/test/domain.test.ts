import { describe, expect, test } from "bun:test";
import { answerableRows, censusAnswerable, classifierAnswerable, coverageRows, median, pairs, pearson } from "../src/domain/analytics";
import { applyFilters, buildIndex, NO_FILTERS, type Index } from "../src/domain/model";
import { ParseError, parseCensus, parseIntents, parseSpace, parseTicketIntents, parseTickets, parseTransitions, toMonth } from "../src/domain/parse";
import { buildGraph, cluster, type GraphNode, type Link } from "../src/domain/relations";
import type { Dataset, IntentRecord } from "../src/domain/types";
import { readFilters } from "../src/state/filters";

const DATA = new URL("../../reports/dashboard/", import.meta.url).pathname;
const json = async (name: string): Promise<unknown> => Bun.file(`${DATA}${name}.json`).json();

async function load(): Promise<Dataset> {
  const census = Bun.file(`${DATA}census.json`);
  return {
    tickets: parseTickets(await json("tickets")),
    ticketIntents: parseTicketIntents(await json("ticket_intents")),
    intents: parseIntents(await json("intents")),
    transitions: parseTransitions(await json("transitions")),
    space: parseSpace(await json("intent_space")),
    census: (await census.exists()) ? parseCensus(await census.json()) : null,
  };
}

const data = await load();
const index: Index = buildIndex(data);
const all = applyFilters(index, NO_FILTERS);

describe("parsers", () => {
  test("reject a wrong category with its path", () => {
    expect(() => parseTicketIntents([{ k: 1, intent: "x", channel: "nope", basis: "intent_default" }])).toThrow(/ticket_intents\[0\]\.channel/);
  });
  test("reject a malformed month", () => {
    expect(() => toMonth("2026-13")).toThrow(ParseError);
    expect(toMonth("2026-05")).toBe(toMonth("2026-05"));
  });
  test("accept 0/1 flags and empty strings as null", () => {
    const [t] = parseTickets([{ k: 0, month: "2026-01", week: "2026-01-05", region: "EMEA", country: "DE", origin: "River", resolution: "knowledge",
      tier2plus: 1, third_party: 0, days: 1.5, repeat30: 0, not_on_river: 0, channel: "answer", n_intents: 1, topic: null, census: "" }]);
    expect(t?.tier2plus).toBe(true);
    expect(t?.census).toBeNull();
  });
});

describe("real export", () => {
  test("loads every dataset", () => {
    expect(data.tickets.length).toBe(8012);
    expect(data.intents.length).toBe(63);
    expect(index.space.size).toBe(63);
  });
  // These figures come from the Python pipeline (reports/10_*, reports/14_*); the port must reproduce them exactly.
  test("classifier: fully answerable and any-answerable tickets", () => {
    expect(all.tickets.filter(classifierAnswerable).length).toBe(1614);
    expect(all.tickets.filter((t) => t.anyAnswer).length).toBe(1808);
  });
  test("census: answerable by content alone and agreement with the classifier", () => {
    const c = all.tickets.filter(censusAnswerable);
    expect(c.length).toBe(1836);
    expect(c.filter(classifierAnswerable).length).toBe(1088);
    expect(all.tickets.filter((t) => classifierAnswerable(t) && !censusAnswerable(t)).length).toBe(526);
    expect(index.census?.answerable).toBe(1836);
  });
  test("every need points at known intent metadata and its own ticket", () => {
    for (const t of index.tickets) for (const n of t.needs) expect(n.ticket).toBe(t);
    expect(all.needs.every((n) => index.meta.get(n.meta.intent) === n.meta)).toBe(true);
  });
});

describe("filters", () => {
  test("need-level filters keep only matching needs", () => {
    const m = applyFilters(index, { ...NO_FILTERS, channel: "answer" });
    expect(m.needs.every((n) => n.channel === "answer")).toBe(true);
    expect(m.tickets.length).toBe(1808);
  });
  test("month range narrows tickets and months", () => {
    const from = toMonth("2026-03");
    const to = toMonth("2026-05");
    const m = applyFilters(index, { ...NO_FILTERS, from, to });
    expect(m.months).toEqual(["2026-03", "2026-04", "2026-05"].map(toMonth));
    expect(m.tickets.every((t) => t.month >= from && t.month <= to)).toBe(true);
  });
  test("URL filters drop values the data does not contain", () => {
    const f = readFilters("?region=EMEA&channel=bogus&intent=obt_access&domain=Nope&from=2026-02", index);
    expect(f).toEqual({ ...NO_FILTERS, region: "EMEA", intent: "obt_access", from: toMonth("2026-02") });
  });
});

describe("analytics", () => {
  test("median and pearson", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(pearson([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1])).toBeCloseTo(-1);
    expect(pearson([1, 2, 3], [1, 2, 3])).toBe(0); // too short to trust
  });
  test("answerable rows sum to the answerable needs", () => {
    const sum = answerableRows(all).reduce((s, r) => s + r.answerableNeeds, 0);
    expect(sum).toBe(all.needs.filter((n) => n.channel === "answer").length);
  });
  test("coverage demand = answerable + answer-first", () => {
    for (const r of coverageRows(all)) expect(r.demand).toBe(r.answerable + r.answerFirst);
  });
  test("pairs are oriented so A brings B at least as often as B brings A", () => {
    for (const p of pairs(all, 5)) expect(p.pba).toBeGreaterThan(0);
  });
});

describe("relations", () => {
  const meta = (id: string): IntentRecord => ({ intent: id, name: id, domain: "d", faq_question: "", answer_class: "doc", best_channel: "answer",
    agent_capability: null, coverage: null, gap: "", faq_titles: "", faq_available_from: null });
  const node = (id: string, n: number): GraphNode => ({ id, n, meta: meta(id) });
  const link = (a: string, b: string, w: number): Link => ({ kind: "person", a, b, w, support: 1 });
  test("average linkage merges strongly tied intents only", () => {
    const c = cluster([node("a", 10), node("b", 5), node("c", 3)], [link("a", "b", 0.9), link("b", "c", 0.1)], 0.5);
    expect(c.groups[0]).toEqual(["a", "b"]);
    expect(c.groupOf.get("c")).toBe(-1);
    expect(c.weight("b", "a")).toBe(0.9);
  });
  test("time graph on the real export links only intents with 20+ tickets", () => {
    const g = buildGraph(all, "time", 0.4);
    const n = new Map(g.nodes.map((d) => [d.id, d.n]));
    expect(g.weekly?.weeks.length).toBe(38);
    for (const l of g.links) {
      expect(l.kind).toBe("time");
      expect(n.get(l.a) ?? 0).toBeGreaterThanOrEqual(20);
      expect(l.w).toBeGreaterThanOrEqual(0.4);
    }
  });
});
