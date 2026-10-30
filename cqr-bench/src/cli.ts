import { parseArgs } from "node:util";
import { loadEvalSet } from "./eval-set";
import { SimulatedModel } from "./model-client";
import { runBench, type BenchReport, type LatencySummary } from "./runner";

const { values } = parseArgs({
  options: {
    eval: { type: "string" },
    "model-latency": { type: "string" },
    "cache-latency": { type: "string" },
    budget: { type: "string" },
    json: { type: "boolean" },
  },
});

const num = (name: string, v: string | undefined, fallback: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number`);
  return n;
};

const ms = (s: LatencySummary) => `mean ${s.meanMs.toFixed(1)} · p50 ${s.p50Ms.toFixed(1)} · p95 ${s.p95Ms.toFixed(1)} · max ${s.maxMs.toFixed(1)} ms (n=${s.n})`;

function print(r: BenchReport, budgetMs: number): void {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log("Skywalker CQR bench: cache -> rewrite model");
  console.log(`model: ${r.model}`);
  console.log(`${r.conversations} conversations, ${r.turns} turns`);
  console.log(`routes: ${r.byRoute.model} model, ${r.byRoute.cache} cache hits (${pct(r.byRoute.cache / (r.turns || 1))})`);
  console.log(`latency, all turns: ${ms(r.latency)}`);
  for (const [route, s] of Object.entries(r.latencyByRoute)) console.log(`latency, ${route}: ${ms(s)}`);
  console.log(`rewrite budget ${budgetMs} ms at p95: ${r.latency.p95Ms <= budgetMs ? "within" : "OVER"}`);
  console.log(`exact-match vs gold: ${pct(r.exactMatch)}`);
  for (const [mode, v] of Object.entries(r.exactMatchByMode)) console.log(`  ${mode.padEnd(20)} ${pct(v.rate)} of ${v.n}`);
  if (r.model.startsWith("simulated")) {
    console.log("\nNote: the simulated model returns the gold rewrite, so exact-match is 100% by construction and latency is the configured sleep.");
    console.log("This run measures routing and cache behaviour only. Plug a real RewriteModel into runBench to measure a model.");
  }
}

const evalPath: string = values.eval ?? new URL("../data/eval/gold_standard_eval_set.json", import.meta.url).pathname;
const evalSet = await loadEvalSet(evalPath);
const report = await runBench(evalSet, {
  model: new SimulatedModel(num("model-latency", values["model-latency"], 45)),
  cacheLatencyMs: num("cache-latency", values["cache-latency"], 2),
});
if (values.json === true) console.log(JSON.stringify(report, null, 2));
else print(report, num("budget", values.budget, 75));
