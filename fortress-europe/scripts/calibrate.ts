// Random search over the TUNE constants so that every preset, group and region lands inside
// judgment-based target ranges at once. Usage: bun scripts/calibrate.ts [iterations] [runsPerPreset]
import { runBatch, TUNE } from "../src/model/simulate";
import { aggregate } from "../src/model/aggregate";
import { DEFAULT_PARAMS, PRESETS, cloneAff } from "../src/model/presets";
import { GROUP_INDEX } from "../src/model/groups";
import type { Params } from "../src/model/types";

const iters = Number(process.argv[2] ?? 120);
const runs = Number(process.argv[3] ?? 100);
const P = (id: string): Params => ({ ...DEFAULT_PARAMS, ...PRESETS.find((p) => p.id === id)!.vals, aff: cloneAff(), runs, seed: 77 });
type Agg = ReturnType<typeof aggregate>;
const hold = (a: Agg) => (a.counts.hegemony + a.counts.fraying) / a.total;
const pen = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0);

/** Share of runs in which each group's resistance becomes a major force (armed strength 0.5 or more), historical preset. */
export const GROUP_TARGETS: Record<string, [number, number]> = {
  ser: [0.4, 0.6], mon: [0.4, 0.6], gre: [0.3, 0.5], bel: [0.35, 0.6], pol: [0.1, 0.35], slv: [0.2, 0.45],
  alb: [0.15, 0.35], cro: [0.1, 0.3], euk: [0.15, 0.35], wuk: [0.15, 0.4], rus: [0.2, 0.45], fre: [0.05, 0.2],
  nor: [0.03, 0.15], cze: [0.02, 0.12], dut: [0, 0.05], dan: [0, 0.05], fle: [0, 0.05], lux: [0, 0.05], als: [0, 0.05],
  wal: [0.02, 0.1], lit: [0.05, 0.25], lat: [0.05, 0.25], est: [0.05, 0.25], slk: [0.1, 0.3], bos: [0.05, 0.2],
  mac: [0.05, 0.25], ita: [0.05, 0.3], hun: [0.05, 0.3], rom: [0.05, 0.3], bul: [0.05, 0.3], fin: [0.05, 0.3],
};

function score() {
  const h = aggregate(runBatch(P("historical")));
  let s = pen(hold(h), 0.45, 0.65) * 4;
  for (const [g, [lo, hi]] of Object.entries(GROUP_TARGETS)) s += pen(h.groupMajor[GROUP_INDEX[g]], lo, hi);
  const iso = aggregate(runBatch(P("isolated")));
  const cw = aggregate(runBatch(P("coldwar")));
  const pr = aggregate(runBatch(P("pragmatic")));
  s += pen(hold(iso), 0.93, 1) * 3 + pen(hold(cw), 0, 0.3) * 2 + pen(hold(pr), 0.88, 1) * 2;
  return { s, h, holds: [hold(h), hold(iso), hold(cw), hold(pr)] };
}

const RANGES: Record<keyof typeof TUNE, [number, number]> = {
  aOffset: [0, 0.2], aMax: [0.5, 0.9], fearW: [0.2, 0.6], despAtro: [0.2, 0.6], despBrut: [0.1, 0.4],
  growthThr: [0.12, 0.3], suppW: [0.2, 0.6], garScale: [1, 3], dBase: [0, 0.2],
};
let best = { s: score().s, t: { ...TUNE } };
console.log("start", best.s.toFixed(3), JSON.stringify(TUNE));
for (let k = 0; k < iters; k++) {
  const local = k > iters / 3;
  for (const key of Object.keys(RANGES) as (keyof typeof TUNE)[]) {
    const [lo, hi] = RANGES[key];
    TUNE[key] = local
      ? Math.min(hi, Math.max(lo, best.t[key] + (Math.random() - 0.5) * (hi - lo) * 0.2))
      : lo + Math.random() * (hi - lo);
  }
  const r = score();
  if (r.s < best.s) {
    best = { s: r.s, t: { ...TUNE } };
    console.log(k, r.s.toFixed(3), "holds h/iso/cw/prag", r.holds.map((x) => x.toFixed(2)).join(" "), JSON.stringify(best.t));
  }
}
console.log("BEST", JSON.stringify(best));
