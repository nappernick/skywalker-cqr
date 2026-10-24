import type { Aggregate, Outcome, Params, RunResult } from "./model/types";

export interface RunSummary { id: number; outcome: Outcome; endYear: number; lastRuler: string }

export type ToWorker =
  | { type: "run"; token: number; params: Params }
  | { type: "get"; token: number; id: number };

export type FromWorker =
  | { type: "done"; token: number; agg: Aggregate; summaries: RunSummary[]; ms: number }
  | { type: "run"; token: number; run: RunResult };
