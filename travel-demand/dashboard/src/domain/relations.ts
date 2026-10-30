import { pearson, weeklyShares, type WeeklyShares } from "./analytics";
import type { Model } from "./model";
import type { IntentRecord } from "./types";

/** How two intents are linked: weekly shares rise and fall together; same person's next ticket; same ticket. */
export type LinkBasis = "time" | "person" | "ticket";

interface LinkBase {
  readonly a: string;
  readonly b: string;
  /** Strength used for clustering and thresholds. */
  readonly w: number;
}
export interface TimeLink extends LinkBase {
  readonly kind: "time";
  readonly r: number;
  readonly rLagged: number;
  readonly lag: number;
  readonly lead: string | null;
  readonly follow: string | null;
}
export interface PersonLink extends LinkBase {
  readonly kind: "person";
  readonly support: number;
}
export interface TicketLink extends LinkBase {
  readonly kind: "ticket";
  readonly support: number;
  readonly lift: number;
  readonly pab: number;
  readonly pba: number;
}
export type Link = TimeLink | PersonLink | TicketLink;

export interface GraphNode {
  readonly id: string;
  readonly n: number;
  readonly meta: IntentRecord;
}

export interface Graph {
  readonly basis: LinkBasis;
  readonly nodes: readonly GraphNode[];
  readonly links: readonly Link[];
  /** Clusters, multi-member first then by size; members ordered so strong neighbours sit together. */
  readonly groups: readonly (readonly string[])[];
  /** Index into `groups`, or -1 for an intent alone in its group. */
  readonly groupOf: ReadonlyMap<string, number>;
  readonly order: readonly string[];
  readonly weight: (a: string, b: string) => number;
  readonly weekly: WeeklyShares | null;
}

export const CUT_RANGE: Readonly<Record<LinkBasis, readonly [number, number]>> = { time: [0.1, 0.9], person: [0.01, 0.25], ticket: [0.01, 0.25] };
export const DEFAULT_CUT: Readonly<Record<LinkBasis, number>> = { time: 0.4, person: 0.05, ticket: 0.05 };
const MIN_TICKETS_TIME = 20;
const MAX_LAG_WEEKS = 4;
const LAG_GAIN = 0.1;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildGraph(m: Model, basis: LinkBasis, cut: number): Graph {
  const n = new Map<string, number>();
  const pairCount = new Map<string, number>();
  for (const t of m.tickets) {
    const ids = [...new Set(t.needs.map((x) => x.meta.intent))].sort();
    for (const a of ids) n.set(a, (n.get(a) ?? 0) + 1);
    if (basis !== "ticket") continue;
    ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => pairCount.set(`${a}|${b}`, (pairCount.get(`${a}|${b}`) ?? 0) + 1)));
  }
  const N = m.tickets.length || 1;
  const nOf = (id: string) => n.get(id) ?? 0;
  let links: Link[] = [];
  let weekly: WeeklyShares | null = null;

  if (basis === "ticket") {
    for (const [k, v] of pairCount) {
      const [a = "", b = ""] = k.split("|");
      links.push({ kind: "ticket", a, b, support: v, w: v / Math.sqrt(nOf(a) * nOf(b)), lift: (v * N) / (nOf(a) * nOf(b)), pab: v / nOf(a), pba: v / nOf(b) });
    }
  } else if (basis === "person") {
    for (const r of m.index.transitions) {
      const a = r.from_intent;
      const b = r.next_intent_30d;
      if (r.same_intent || !n.has(a) || !n.has(b)) continue;
      links.push({ kind: "person", a, b, support: r.transitions, w: r.transitions / Math.sqrt(nOf(a) * nOf(b)) });
    }
  } else {
    weekly = weeklyShares(m.tickets);
    const ws = weekly;
    const ids = [...ws.share.keys()].filter((id) => nOf(id) >= MIN_TICKETS_TIME);
    ids.forEach((ia, i) => ids.slice(i + 1).forEach((ib) => {
      const x = ws.share.get(ia) ?? [];
      const y = ws.share.get(ib) ?? [];
      const r0 = pearson(x, y);
      // Lead/lag: does one intent's share predict the other's 1–4 weeks later?
      let lag = 0;
      let rl = r0;
      for (let L = 1; L <= MAX_LAG_WEEKS; L += 1) {
        const ab = pearson(x.slice(0, -L), y.slice(L));
        const ba = pearson(y.slice(0, -L), x.slice(L));
        if (ab > rl + LAG_GAIN) { rl = ab; lag = L; }
        if (ba > rl + LAG_GAIN) { rl = ba; lag = -L; }
      }
      const w = Math.max(r0, rl);
      if (w < cut) return;
      const [lead, follow] = lag >= 0 ? [ia, ib] : [ib, ia];
      links.push({ kind: "time", a: ia, b: ib, w, r: r0, rLagged: rl, lag: Math.abs(lag), lead: lag ? lead : null, follow: lag ? follow : null });
    }));
  }
  if (basis !== "time") links = links.filter((l) => l.w >= cut * 0.2);

  const nodes: GraphNode[] = [];
  for (const [id, c] of n) {
    const meta = m.index.meta.get(id);
    if (meta) nodes.push({ id, n: c, meta });
  }
  nodes.sort((x, y) => y.n - x.n);
  return { basis, nodes, links, weekly, ...cluster(nodes, links, cut) };
}

/** Average-linkage agglomerative clustering on link strength, merging while the best pair is at least `tau`. */
export function cluster(nodes: readonly GraphNode[], links: readonly Link[], tau: number): Pick<Graph, "groups" | "groupOf" | "order" | "weight"> {
  const w = new Map<string, number>();
  for (const l of links) w.set(pairKey(l.a, l.b), (w.get(pairKey(l.a, l.b)) ?? 0) + l.w);
  const weight = (a: string, b: string) => w.get(pairKey(a, b)) ?? 0;
  const sim = (A: readonly string[], B: readonly string[]) => {
    let s = 0;
    for (const a of A) for (const b of B) s += weight(a, b);
    return s / (A.length * B.length);
  };
  let groups: string[][] = nodes.map((d) => [d.id]);
  for (;;) {
    let best: { i: number; j: number; s: number } | null = null;
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const s = sim(groups[i] ?? [], groups[j] ?? []);
        if (s >= tau && (best === null || s > best.s)) best = { i, j, s };
      }
    }
    if (best === null) break;
    groups[best.i] = [...(groups[best.i] ?? []), ...(groups[best.j] ?? [])];
    groups.splice(best.j, 1);
  }
  const size = new Map(nodes.map((d) => [d.id, d.n]));
  const sz = (id: string) => size.get(id) ?? 0;
  // Greedy chain from the largest member by strongest tie, so neighbours sit together on the matrix diagonal.
  groups = groups.map((g) => {
    const [first, ...others] = g;
    if (first === undefined) return g;
    let start = first;
    for (const id of others) if (sz(id) > sz(start)) start = id;
    const rest = new Set(g);
    rest.delete(start);
    const out = [start];
    let last = start;
    while (rest.size) {
      let next: string | null = null;
      for (const c of rest) {
        if (next === null || weight(last, c) > weight(last, next) || (weight(last, c) === weight(last, next) && sz(c) > sz(next))) next = c;
      }
      if (next === null) break;
      out.push(next);
      rest.delete(next);
      last = next;
    }
    return out;
  }).sort((a, b) => Number(b.length > 1) - Number(a.length > 1) || b.reduce((s, x) => s + sz(x), 0) - a.reduce((s, x) => s + sz(x), 0));
  const groupOf = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((id) => groupOf.set(id, g.length > 1 ? i : -1)));
  return { groups, groupOf, order: groups.flat(), weight };
}

export function neighbours(g: Graph, id: string): Map<string, Link> {
  const out = new Map<string, Link>();
  for (const l of g.links) {
    if (l.a === id) out.set(l.b, l);
    else if (l.b === id) out.set(l.a, l);
  }
  return out;
}
