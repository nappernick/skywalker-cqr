import { QueryCache } from "./cache";
import { buildFrame } from "./frame";
import { sleep, type RewriteModel } from "./model-client";
import type { Conversation, FailureMode, Route, TurnRecord } from "./types";

export interface BenchOptions {
  readonly model: RewriteModel;
  readonly cache?: QueryCache;
  /** Simulated round trip of a cache hit (e.g. Redis / DynamoDB), in ms. */
  readonly cacheLatencyMs?: number;
  readonly now?: () => number;
}

export interface LatencySummary {
  readonly n: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export interface BenchReport {
  readonly model: string;
  readonly turns: number;
  readonly conversations: number;
  readonly byRoute: Readonly<Record<Route, number>>;
  readonly latency: LatencySummary;
  readonly latencyByRoute: Readonly<Partial<Record<Route, LatencySummary>>>;
  readonly exactMatch: number;
  readonly exactMatchByMode: Readonly<Partial<Record<FailureMode, { n: number; rate: number }>>>;
  readonly records: readonly TurnRecord[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Nearest-rank percentile of an ascending array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i] ?? 0;
}

export function summarize(values: readonly number[]): LatencySummary {
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, meanMs: s.length ? sum / s.length : 0, p50Ms: percentile(s, 50), p95Ms: percentile(s, 95), maxMs: s.at(-1) ?? 0 };
}

/** Runs every turn of every conversation through cache -> model, in order, recording route and latency. */
export async function runBench(conversations: readonly Conversation[], opts: BenchOptions): Promise<BenchReport> {
  const cache = opts.cache ?? new QueryCache();
  const now = opts.now ?? (() => performance.now());
  const records: TurnRecord[] = [];

  for (const conv of conversations) {
    let previous = "";
    for (const [turnIndex, turn] of conv.turns.entries()) {
      const start = now();
      let route: Route = "cache";
      let result = cache.get(previous, turn.text);
      if (result) {
        await sleep(opts.cacheLatencyMs ?? 0);
      } else {
        route = "model";
        result = await opts.model.rewrite(buildFrame(previous, turn.text), turn);
        cache.put(previous, turn.text, result);
      }
      records.push({
        conversationId: conv.conversation_id, turnIndex, failureMode: turn.failure_mode, route,
        latencyMs: now() - start, rewrite: result.query, gold: turn.gold_rewrite,
        exactMatch: norm(result.query) === norm(turn.gold_rewrite),
      });
      previous = turn.text;
    }
  }

  const byRoute: Record<Route, number> = { cache: 0, model: 0 };
  for (const r of records) byRoute[r.route] += 1;
  const latencyByRoute: Partial<Record<Route, LatencySummary>> = {};
  for (const route of ["cache", "model"] as const) {
    const v = records.filter((r) => r.route === route).map((r) => r.latencyMs);
    if (v.length) latencyByRoute[route] = summarize(v);
  }
  const exactMatchByMode: Partial<Record<FailureMode, { n: number; rate: number }>> = {};
  for (const r of records) {
    const cur = exactMatchByMode[r.failureMode] ?? { n: 0, rate: 0 };
    exactMatchByMode[r.failureMode] = { n: cur.n + 1, rate: cur.rate + (r.exactMatch ? 1 : 0) };
  }
  for (const v of Object.values(exactMatchByMode)) v.rate /= v.n;

  return {
    model: opts.model.name, turns: records.length, conversations: conversations.length, byRoute,
    latency: summarize(records.map((r) => r.latencyMs)), latencyByRoute,
    exactMatch: records.length ? records.filter((r) => r.exactMatch).length / records.length : 0,
    exactMatchByMode, records,
  };
}
