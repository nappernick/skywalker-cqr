// One read interface over either the batch medians ("average") or a single run, so every panel draws both the same way.
import { NC } from "../model/cells";
import { REGIONS } from "../model/regions";
import { CF, NCF, RF, NRF, GF, NGF, type Aggregate, type Governor, type Ruler, type RunResult, type SimEvent } from "../model/types";

const NR = REGIONS.length;

export interface View {
  mode: "avg" | "run";
  cell: (t: number, i: number, f: number) => number;
  /** Armed strength of the region (median in average mode). */
  regR: (t: number, r: number) => number;
  /** 1 if lost; in average mode the share of runs in which it is lost. */
  lost: (t: number, r: number) => number;
  contested: (t: number, r: number) => boolean;
  glob: (t: number, f: number) => number;
  ruler: (t: number) => Ruler | null;
  gov: (t: number, r: number) => Governor | null;
  garrison: (t: number, r: number) => number | null;
  events: SimEvent[];
  ended: (t: number) => number;
}

export function makeView(mode: "avg" | "run", agg: Aggregate, run: RunResult | null): View {
  if (mode === "run" && run) {
    const reg = (t: number, r: number, f: number) => run.regions[(t * NR + r) * NRF + f];
    const g = (t: number, f: number) => run.glob[t * NGF + f];
    return {
      mode,
      cell: (t, i, f) => run.cells[(t * NC + i) * NCF + f],
      regR: (t, r) => reg(t, r, RF.R),
      lost: (t, r) => reg(t, r, RF.LOST),
      contested: (t, r) => reg(t, r, RF.CONT) > 0.5,
      glob: g,
      ruler: (t) => { const k = g(t, GF.LEAD); return k >= 0 ? run.rulers[k] : null; },
      gov: (t, r) => { const k = reg(t, r, RF.GOV); return k >= 0 && g(t, GF.ENDED) < 0.5 ? run.govs[k] : null; },
      garrison: (t, r) => reg(t, r, RF.GAR),
      events: run.events,
      ended: (t) => g(t, GF.ENDED),
    };
  }
  return {
    mode: "avg",
    cell: (t, i, f) => agg.cellMed[(t * NC + i) * NCF + f],
    regR: (t, r) => agg.regionR[t][r],
    lost: (t, r) => 1 - agg.heldShare[t][r],
    contested: () => false,
    glob: (t, f) => agg.globMed[t][f],
    ruler: () => null,
    gov: () => null,
    garrison: () => null,
    events: [],
    ended: (t) => agg.ended[t],
  };
}

export { CF, GF };
