import type { RewriteResult, Turn } from "./types";

/** Any rewrite model: a SageMaker / Inferentia endpoint, a local ONNX model, or the simulation below. */
export interface RewriteModel {
  readonly name: string;
  rewrite(frame: string, turn: Turn): Promise<RewriteResult>;
}

export const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Stand-in for the fine-tuned FLAN-T5 endpoint: waits a fixed latency and returns the gold rewrite.
 * It measures routing and cache behaviour only. Rewrite quality is perfect by construction, so any
 * quality number produced with it is not evidence about a real model.
 */
export class SimulatedModel implements RewriteModel {
  readonly name = "simulated (returns gold rewrite)";
  constructor(private readonly latencyMs: number) {}

  async rewrite(_frame: string, turn: Turn): Promise<RewriteResult> {
    await sleep(this.latencyMs);
    return { query: turn.gold_rewrite, filters: {} };
  }
}
