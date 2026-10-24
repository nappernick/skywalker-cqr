import { REGIONS, YEARS } from "./regions";
import { GROUPS } from "./groups";
import { NC, CELLS_OF_GROUP } from "./cells";
import { CF, NCF, RF, NRF, GF, NGF, type Aggregate, type Band, type Outcome, type RunResult } from "./types";

function quantile(sorted: Float64Array, q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function band(runs: RunResult[], get: (r: RunResult, t: number) => number): Band {
  const med: number[] = [];
  const p10: number[] = [];
  const p90: number[] = [];
  const col = new Float64Array(runs.length);
  for (let t = 0; t < YEARS; t++) {
    runs.forEach((r, k) => { col[k] = get(r, t); });
    col.sort();
    med.push(quantile(col, 0.5));
    p10.push(quantile(col, 0.1));
    p90.push(quantile(col, 0.9));
  }
  return { med, p10, p90 };
}

/** Summarizes a batch of runs: outcome counts, medians over time, and per-region and per-group shares. */
export function aggregate(runs: RunResult[]): Aggregate {
  const NR = REGIONS.length;
  const n = runs.length;
  const counts: Record<Outcome, number> = { hegemony: 0, fraying: 0, rollback: 0, collapse: 0, uswar: 0 };
  runs.forEach((r) => { counts[r.outcome]++; });

  const col = new Float64Array(n);
  const cellMed = new Float32Array(YEARS * NC * NCF);
  for (let t = 0; t < YEARS; t++)
    for (let i = 0; i < NC; i++)
      for (let f = 0; f < NCF; f++) {
        const o = (t * NC + i) * NCF + f;
        runs.forEach((r, k) => { col[k] = r.cells[o]; });
        col.sort();
        cellMed[o] = quantile(col, 0.5);
      }

  const regionR: number[][] = [];
  const heldShare: number[][] = [];
  for (let t = 0; t < YEARS; t++) {
    const rr: number[] = [];
    const hs: number[] = [];
    for (let i = 0; i < NR; i++) {
      const o = (t * NR + i) * NRF;
      runs.forEach((r, k) => { col[k] = r.regions[o + RF.R]; });
      col.sort();
      rr.push(quantile(col, 0.5));
      hs.push(runs.filter((r) => r.regions[o + RF.LOST] < 0.5).length / n);
    }
    regionR.push(rr);
    heldShare.push(hs);
  }

  const globMed: number[][] = [];
  for (let t = 0; t < YEARS; t++) {
    const row: number[] = [];
    for (let f = 0; f < NGF; f++) {
      runs.forEach((r, k) => { col[k] = r.glob[t * NGF + f]; });
      col.sort();
      row.push(quantile(col, 0.5));
    }
    globMed.push(row);
  }

  const share = (pred: (r: RunResult, t: number) => boolean) =>
    Array.from({ length: YEARS }, (_, t) => runs.filter((r) => pred(r, t)).length / n);
  const rulerAt = (r: RunResult, t: number) => {
    const idx = r.glob[t * NGF + GF.LEAD];
    return idx >= 0 ? r.rulers[idx] : null;
  };

  // A group is a major force in a year when any of its cells has armed strength of 0.5 or more.
  const major = (r: RunResult, g: number, t: number) => CELLS_OF_GROUP[g].some((i) => r.cells[(t * NC + i) * NCF + CF.R] >= 0.5);
  const T45 = 1945 - 1941;
  const T50 = 1950 - 1941;
  const alive50 = runs.filter((r) => r.glob[T50 * NGF + GF.ENDED] < 0.5);

  return {
    total: n,
    counts,
    control: band(runs, (r, t) => r.glob[t * NGF + GF.CTRL]),
    strength: band(runs, (r, t) => r.glob[t * NGF + GF.S]),
    cellMed,
    regionR,
    heldShare,
    lostShare: REGIONS.map((_, i) => runs.filter((r) => r.lostByResistance[i]).length / n),
    contestedShare: REGIONS.map((_, i) => runs.filter((r) => r.contestedEver[i]).length / n),
    groupMajor: GROUPS.map((_, g) => runs.filter((r) => r.groupPeak[g] >= 0.5).length / n),
    groupBy1945: GROUPS.map((_, g) => runs.filter((r) => Array.from({ length: T45 + 1 }, (_, t) => t).some((t) => major(r, g, t))).length / n),
    groupIn1950: GROUPS.map((_, g) => (alive50.length ? alive50.filter((r) => major(r, g, T50)).length / alive50.length : 0)),
    hitlerDead: share((r, t) => rulerAt(r, t)?.kind !== "founder"),
    churchWar: share((r, t) => r.glob[t * NGF + GF.CHURCH] > 0.05),
    usBomb: share((r, t) => r.glob[t * NGF + GF.USB] > 0.5),
    deBomb: share((r, t) => r.glob[t * NGF + GF.DEB] > 0.5),
    rumpAlive: share((r, t) => r.glob[t * NGF + GF.K] >= 0),
    ended: share((r, t) => r.glob[t * NGF + GF.ENDED] > 0.5),
    globMed,
    newGeneration: share((r, t) => { const ru = rulerAt(r, t); return ru !== null && ru.born >= 1906; }),
  };
}

export { CF };
