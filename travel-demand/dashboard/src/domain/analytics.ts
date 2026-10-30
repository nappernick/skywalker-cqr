import { CENSUS_LABELS, CHANNELS, type CensusLabel, type Channel, type Coverage, type IntentRecord, type IsoDate, type Month, type Region, type Resolution } from "./types";
import type { Model, Need, Ticket } from "./model";

export function countBy<T, K>(items: Iterable<T>, key: (t: T) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function groupBy<T, K>(items: Iterable<T>, key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** The most frequent key, ties broken by first seen. */
export function mode<T, K>(items: Iterable<T>, key: (t: T) => K): K | null {
  let best: K | null = null;
  let bestN = 0;
  for (const [k, n] of countBy(items, key)) if (n > bestN) [best, bestN] = [k, n];
  return best;
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

export const ticketsOf = (needs: readonly Need[]): Ticket[] => [...new Set(needs.map((n) => n.ticket))];

export type ChannelCounts = Readonly<Record<Channel, number>>;

export function channelCounts<T>(items: readonly T[], channel: (t: T) => Channel): ChannelCounts {
  const c = countBy(items, channel);
  const out: Record<Channel, number> = { answer: 0, agent_action: 0, intake_and_route: 0, agent_prep_human_decision: 0, human_investigation: 0, engineering_fix: 0 };
  for (const k of CHANNELS) out[k] = c.get(k) ?? 0;
  return out;
}

export interface IntentGroup {
  readonly meta: IntentRecord;
  readonly needs: readonly Need[];
  readonly tickets: readonly Ticket[];
}

/** Needs grouped by intent, largest (by distinct tickets) first. */
export function byIntent(m: Model): IntentGroup[] {
  return [...groupBy(m.needs, (n) => n.meta)]
    .map(([meta, needs]) => ({ meta, needs, tickets: ticketsOf(needs) }))
    .sort((a, b) => b.tickets.length - a.tickets.length);
}

export const isAnswerFirst = (n: Need): boolean => n.channel !== "answer" && n.meta.answer_class.startsWith("doc_then");

export interface AnswerableRow {
  readonly meta: IntentRecord;
  readonly total: number;
  readonly answerableNeeds: number;
  /** Answerable needs that came from action tickets resolved by an explanation (root-cause override). */
  readonly hidden: number;
  readonly tickets: number;
  readonly share: number;
  readonly hiddenShare: number;
  readonly transfer: number;
  readonly notRiver: number;
  readonly tier2: number;
  readonly medianDays: number;
  readonly topRegion: Region | null;
  readonly coverage: Coverage | null;
}

export function answerableRows(m: Model): AnswerableRow[] {
  return byIntent(m).map(({ meta, needs, tickets }) => {
    const ans = needs.filter((n) => n.channel === "answer");
    const tk = ticketsOf(ans);
    const frac = (f: (t: Ticket) => boolean) => (tk.length ? tk.filter(f).length / tk.length : 0);
    const hidden = ans.filter((n) => n.basis !== "intent_default").length;
    return {
      meta, total: tickets.length, answerableNeeds: ans.length, hidden, tickets: tk.length,
      share: tickets.length ? tk.length / tickets.length : 0, hiddenShare: ans.length ? hidden / ans.length : 0,
      transfer: frac((t) => t.resolution === "routing"), notRiver: frac((t) => t.not_on_river), tier2: frac((t) => t.tier2plus),
      medianDays: median(tk.map((t) => t.days)), topRegion: mode(tk, (t) => t.region), coverage: meta.coverage,
    };
  });
}

export interface CoverageRow {
  readonly meta: IntentRecord;
  readonly coverage: Coverage | null;
  readonly answerable: number;
  readonly answerFirst: number;
  readonly demand: number;
  readonly afterFaq: number;
}

export function coverageRows(m: Model): CoverageRow[] {
  return byIntent(m).map(({ meta, needs }) => {
    const distinct = (f: (n: Need) => boolean) => new Set(needs.filter(f).map((n) => n.ticket)).size;
    const answerable = distinct((n) => n.channel === "answer");
    const answerFirst = distinct(isAnswerFirst);
    const from = meta.faq_available_from;
    return { meta, coverage: meta.coverage, answerable, answerFirst, demand: answerable + answerFirst, afterFaq: from === null ? 0 : distinct((n) => n.ticket.month >= from) };
  });
}

export interface PairRow {
  readonly a: IntentRecord;
  readonly b: IntentRecord;
  readonly tickets: number;
  readonly pba: number;
  readonly lift: number;
}

/** Intent pairs raised in the same ticket; A is the side for which the pair is the larger share. */
export function pairs(m: Model, minTickets: number): PairRow[] {
  const n = m.tickets.length;
  const cnt = new Map<IntentRecord, number>();
  const pair = new Map<string, { a: IntentRecord; b: IntentRecord; s: number }>();
  for (const t of m.tickets) {
    const set = [...new Set(t.needs.map((x) => x.meta))].sort((x, y) => x.intent.localeCompare(y.intent));
    for (const a of set) cnt.set(a, (cnt.get(a) ?? 0) + 1);
    set.forEach((a, i) => set.slice(i + 1).forEach((b) => {
      const key = `${a.intent}|${b.intent}`;
      const cur = pair.get(key);
      if (cur) cur.s += 1;
      else pair.set(key, { a, b, s: 1 });
    }));
  }
  return [...pair.values()].filter((p) => p.s >= minTickets).map(({ a, b, s }) => {
    const na = cnt.get(a) ?? 1;
    const nb = cnt.get(b) ?? 1;
    const [hi, lo, nhi, nlo] = s / na >= s / nb ? [a, b, na, nb] : [b, a, nb, na];
    return { a: hi, b: lo, tickets: s, pba: s / nhi, lift: s / nhi / (nlo / n) };
  }).sort((x, y) => y.tickets - x.tickets);
}

export type ResolutionShares = Readonly<Partial<Record<Resolution, number>>>;

// ---------- time co-movement ----------

export const WEEK_FROM = "2026-01-05";
export const WEEK_TO = "2026-09-21"; // last full week in the export

export interface WeeklyShares {
  readonly weeks: readonly IsoDate[];
  readonly counts: ReadonlyMap<string, readonly number[]>;
  readonly share: ReadonlyMap<string, readonly number[]>;
}

export function weeklyShares(tickets: readonly Ticket[]): WeeklyShares {
  const weeks = [...new Set(tickets.map((t) => t.week))].filter((w) => w >= WEEK_FROM && w <= WEEK_TO).sort();
  const wi = new Map(weeks.map((w, i) => [w, i]));
  const total = new Array<number>(weeks.length).fill(0);
  const per = new Map<string, number[]>();
  for (const t of tickets) {
    const i = wi.get(t.week);
    if (i === undefined) continue;
    total[i] = (total[i] ?? 0) + 1;
    for (const id of new Set(t.needs.map((n) => n.meta.intent))) {
      let v = per.get(id);
      if (!v) per.set(id, (v = new Array<number>(weeks.length).fill(0)));
      v[i] = (v[i] ?? 0) + 1;
    }
  }
  const share = new Map([...per].map(([id, v]) => [id, v.map((c, i) => ((total[i] ?? 0) ? c / (total[i] ?? 1) : 0))]));
  return { weeks, counts: per, share };
}

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 6) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) { mx += x[i] ?? 0; my += y[i] ?? 0; }
  mx /= n; my /= n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = (x[i] ?? 0) - mx;
    const b = (y[i] ?? 0) - my;
    sxy += a * b; sxx += a * a; syy += b * b;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

// ---------- census ----------

export type CensusCounts = Readonly<Record<CensusLabel, number>>;

export function censusCounts(tickets: readonly Ticket[]): CensusCounts {
  const c = countBy(tickets.filter((t) => t.census !== null), (t) => t.census);
  const out: Record<CensusLabel, number> = { fact_answer: 0, self_serve: 0, answer_then_action: 0, action: 0, defect: 0, feedback: 0, unclear: 0 };
  for (const k of CENSUS_LABELS) out[k] = c.get(k) ?? 0;
  return out;
}

export const CENSUS_ANSWERABLE: ReadonlySet<CensusLabel> = new Set<CensusLabel>(["fact_answer", "self_serve"]);
export const censusAnswerable = (t: Ticket): boolean => t.census !== null && CENSUS_ANSWERABLE.has(t.census);
/** Every need on the ticket is in the answer channel (the classifier's "fully answerable"). */
export const classifierAnswerable = (t: Ticket): boolean => t.channel === "answer";

export const monthRange = (months: readonly Month[], from: Month | null, to: Month | null): Month[] =>
  months.filter((m) => (from === null || m >= from) && (to === null || m <= to));
