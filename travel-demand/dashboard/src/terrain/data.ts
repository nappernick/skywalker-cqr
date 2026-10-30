import { groupBy, mode } from "../domain/analytics";
import type { Model, Need } from "../domain/model";
import { toMonth } from "../domain/parse";
import type { Channel, IntentRecord, Month, Neighbour } from "../domain/types";
import { CHANNEL_LABEL, fmtMonth } from "../ui/format";

export type HeightBasis = "all" | "answerable" | "gap";
export type ColorBasis = "group" | "coverage" | "channel" | "trend";
export type HeightScale = "sqrt" | "linear" | "squared" | "cubed" | "fifth";
export type PartBasis = "topic" | "channel" | "region" | "month";
export type Level = 0 | 1 | 2;

export interface TerrainState {
  readonly level: Level;
  /** Category (domain) in focus at level 1+, or null for all. */
  readonly group: string | null;
  /** Intent in focus at level 2. */
  readonly intent: string | null;
  readonly height: HeightBasis;
  readonly color: ColorBasis;
  readonly scale: HeightScale;
  readonly part: PartBasis;
  /** 0 = all months, otherwise 1-based index into the model's months. */
  readonly month: number;
}

export const INITIAL_TERRAIN: TerrainState = { level: 0, group: null, intent: null, height: "all", color: "group", scale: "linear", part: "topic", month: 0 };

export const HEIGHT_LABEL: Readonly<Record<HeightBasis, string>> = { all: "of all needs", answerable: "of answerable needs", gap: "of uncovered documentation demand" };

const FIRST3: readonly Month[] = ["2026-01", "2026-02", "2026-03"].map(toMonth);
const LAST3: readonly Month[] = ["2026-07", "2026-08", "2026-09"].map(toMonth);
export const PART_TOP = 11;

export interface TerrainIntent {
  readonly kind: "intent";
  readonly id: string;
  readonly label: string;
  readonly meta: IntentRecord;
  readonly needs: readonly Need[];
  readonly n: number;
  readonly share: number;
  readonly x: number;
  readonly z: number;
  readonly group: string;
  readonly terms: readonly string[];
  readonly nearest: readonly Neighbour[];
  readonly channel: Channel | null;
  /** log2 ratio of share in the last three full months vs the first three. */
  readonly trend: number;
  readonly shareFirst: number;
  readonly shareLast: number;
  readonly tickets: number;
  readonly rank: number;
}

export interface TerrainGroup {
  readonly kind: "group";
  readonly id: string;
  readonly label: string;
  readonly members: readonly TerrainIntent[];
  readonly share: number;
  readonly n: number;
  readonly x: number;
  readonly z: number;
  readonly rad: number;
  readonly rank: number;
  /** Stable colour index per category, independent of filters. */
  readonly colorIndex: number;
}

export interface TerrainData {
  readonly intents: readonly TerrainIntent[];
  readonly groups: readonly TerrainGroup[];
  readonly denom: number;
  readonly month: Month | null;
  readonly byId: ReadonlyMap<string, TerrainIntent>;
  readonly groupById: ReadonlyMap<string, TerrainGroup>;
}

function keepNeed(n: Need, st: TerrainState, month: Month | null): boolean {
  if (month !== null && n.ticket.month !== month) return false;
  if (st.height === "answerable") return n.channel === "answer";
  if (st.height === "gap") return (n.channel === "answer" || n.meta.answer_class.startsWith("doc_then")) && n.meta.coverage !== "full";
  return true;
}

function sharesIn(m: Model, months: readonly Month[]): Map<string, number> {
  const rs = m.needs.filter((n) => months.includes(n.ticket.month));
  const out = new Map<string, number>();
  for (const [id, v] of groupBy(rs, (n) => n.meta.intent)) out.set(id, v.length / (rs.length || 1));
  return out;
}

export function terrainData(m: Model, st: TerrainState): TerrainData {
  const month = st.month ? (m.index.months[st.month - 1] ?? null) : null;
  const rows = m.needs.filter((n) => m.index.space.has(n.meta.intent) && keepNeed(n, st, month));
  const denom = rows.length || 1;
  const s0 = sharesIn(m, FIRST3);
  const s1 = sharesIn(m, LAST3);
  const intents = [...groupBy(rows, (n) => n.meta)].flatMap(([meta, needs]): TerrainIntent[] => {
    const sp = m.index.space.get(meta.intent);
    if (!sp) return [];
    const a = s0.get(meta.intent) ?? 0;
    const b = s1.get(meta.intent) ?? 0;
    return [{
      kind: "intent", id: meta.intent, label: meta.name, meta, needs, n: needs.length, share: needs.length / denom,
      x: sp.x, z: sp.y, group: meta.domain, terms: sp.terms, nearest: sp.nearest, channel: mode(needs, (n) => n.channel),
      trend: a || b ? Math.log2((b + 1e-4) / (a + 1e-4)) : 0, shareFirst: a, shareLast: b,
      tickets: new Set(needs.map((n) => n.ticket)).size, rank: 0,
    }];
  }).sort((p, q) => q.share - p.share).map((d, i) => ({ ...d, rank: i + 1 }));
  const categories = [...m.index.domains];
  const groups = [...groupBy(intents, (d) => d.group)].map(([g, ds]): TerrainGroup => {
    const share = ds.reduce((s, d) => s + d.share, 0);
    const cx = ds.reduce((s, d) => s + d.x * d.share, 0) / (share || 1);
    const cz = ds.reduce((s, d) => s + d.z * d.share, 0) / (share || 1);
    const rad = Math.max(...ds.map((d) => Math.hypot(d.x - cx, d.z - cz))) + 0.09;
    return { kind: "group", id: g, label: g, members: ds, share, n: ds.reduce((s, d) => s + d.n, 0), x: cx, z: cz, rad: Math.min(0.75, rad), rank: 0, colorIndex: Math.max(0, categories.indexOf(g)) };
  }).sort((p, q) => q.share - p.share).map((g, i) => ({ ...g, rank: i + 1 }));
  return { intents, groups, denom, month, byId: new Map(intents.map((d) => [d.id, d])), groupById: new Map(groups.map((g) => [g.id, g])) };
}

export interface Part {
  readonly label: string;
  readonly n: number;
  readonly other: boolean;
  readonly channel: Channel | null;
}

/** Breaks one intent into parts (River topic, channel, region or month), capped at PART_TOP plus "other". */
export function parts(d: TerrainIntent, basis: PartBasis): Part[] {
  if (basis === "month") {
    return [...groupBy(d.needs, (n) => n.ticket.month)].sort(([a], [b]) => a.localeCompare(b))
      .map(([mo, v]) => ({ label: fmtMonth(mo), n: v.length, other: false, channel: null }));
  }
  const key = (n: Need): string => (basis === "topic" ? (n.ticket.topic ?? "Free-text titles") : basis === "channel" ? n.channel : n.ticket.region);
  const ps = [...groupBy(d.needs, key)].map(([k, v]) => {
    const channel = basis === "channel" ? (v[0]?.channel ?? null) : null;
    return { label: channel === null ? k : CHANNEL_LABEL[channel], n: v.length, other: false, channel };
  }).sort((a, b) => b.n - a.n);
  if (ps.length <= PART_TOP) return ps;
  const rest = ps.slice(PART_TOP);
  return [...ps.slice(0, PART_TOP), { label: `${rest.length} other`, n: rest.reduce((s, p) => s + p.n, 0), other: true, channel: null }];
}

/** Static facts about one intent on the landscape. */
export interface SeriesIntent {
  readonly id: string;
  readonly label: string;
  readonly meta: IntentRecord;
  readonly x: number;
  readonly z: number;
  readonly domain: string;
  readonly domainIndex: number;
  readonly channel: Channel | null;
  readonly trend: number;
}

/**
 * Each intent's share of needs per frame, for smooth animation: frame 0 is all months, frame i is month i.
 * Shares are of the needs matching the size basis, so every frame sums to 1.
 */
export interface LandscapeSeries {
  readonly height: HeightBasis;
  readonly intents: readonly SeriesIntent[];
  readonly frames: readonly Float64Array[];
  readonly months: readonly Month[];
}

export function landscapeSeries(m: Model, height: HeightBasis): LandscapeSeries {
  const st: TerrainState = { ...INITIAL_TERRAIN, height };
  const all = terrainData(m, st);
  const idx = new Map(all.intents.map((d, i) => [d.id, i]));
  const domains = [...m.index.domains];
  const intents: SeriesIntent[] = all.intents.map((d) => ({
    id: d.id, label: d.label, meta: d.meta, x: d.x, z: d.z, domain: d.group, domainIndex: Math.max(0, domains.indexOf(d.group)), channel: d.channel, trend: d.trend,
  }));
  const frames = [0, ...m.index.months.map((_, i) => i + 1)].map((month) => {
    const td = month === 0 ? all : terrainData(m, { ...st, month });
    const w = new Float64Array(intents.length);
    for (const d of td.intents) {
      const i = idx.get(d.id);
      if (i !== undefined) w[i] = d.share;
    }
    return w;
  });
  return { height, intents, frames, months: m.index.months };
}
