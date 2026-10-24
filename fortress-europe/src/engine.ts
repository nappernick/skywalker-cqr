// The batch engine behind the page. It runs inside the worker, or on the main thread if workers are unavailable.
// The full runs stay here; the page asks for one at a time.
import { runBatch } from "./model/simulate";
import { aggregate } from "./model/aggregate";
import type { RunResult } from "./model/types";
import type { FromWorker, ToWorker } from "./protocol";

let runs: RunResult[] = [];

export function handle(m: ToWorker): { msg: FromWorker; transfer: Transferable[] } | null {
  if (m.type === "run") {
    const t0 = performance.now();
    runs = runBatch(m.params);
    const agg = aggregate(runs);
    const summaries = runs.map((r) => ({ id: r.id, outcome: r.outcome, endYear: r.endYear, lastRuler: r.rulers[r.rulers.length - 1].name }));
    return { msg: { type: "done", token: m.token, agg, summaries, ms: performance.now() - t0 }, transfer: [agg.cellMed.buffer] };
  }
  const r = runs[m.id];
  if (!r) return null;
  // Copy so the engine keeps its own buffers for later requests.
  const run: RunResult = { ...r, cells: r.cells.slice(), regions: r.regions.slice(), glob: r.glob.slice() };
  return { msg: { type: "run", token: m.token, run }, transfer: [run.cells.buffer, run.regions.buffer, run.glob.buffer] };
}
