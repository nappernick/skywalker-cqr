// Random search over the TUNE constants so that every preset, group and region lands inside
// judgment-based target ranges at once. Usage: bun scripts/calibrate.ts [iterations] [runsPerPreset] [searchSeed]
import { runBatch, TUNE, mulberry32 } from "../src/model/simulate";
import { aggregate } from "../src/model/aggregate";
import { DEFAULT_PARAMS, PRESETS, cloneAff } from "../src/model/presets";
import { GROUP_INDEX } from "../src/model/groups";
import { REGION_INDEX } from "../src/model/regions";
import { GROUP_TARGETS, HOLD_TARGETS, REGION_TARGETS } from "../src/model/targets";
import type { Params } from "../src/model/types";

const iters = Number(process.argv[2] ?? 120);
const runs = Number(process.argv[3] ?? 100);
const P = (id: string): Params => ({ ...DEFAULT_PARAMS, ...PRESETS.find((p) => p.id === id)!.vals, aff: cloneAff(), runs, seed: 77 });
type Agg = ReturnType<typeof aggregate>;
const hold = (a: Agg) => (a.counts.hegemony + a.counts.fraying) / a.total;
const pen = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0);

function score() {
  const h = aggregate(runBatch(P("historical")));
  let s = pen(hold(h), ...HOLD_TARGETS.historical) * 4;
  for (const [g, [lo, hi]] of Object.entries(GROUP_TARGETS)) s += pen(h.groupMajor[GROUP_INDEX[g]], lo, hi);
  for (const [r, [lo, hi]] of Object.entries(REGION_TARGETS)) s += pen(h.lostShare[REGION_INDEX[r]], lo, hi);
  const iso = aggregate(runBatch(P("isolated")));
  const cw = aggregate(runBatch(P("coldwar")));
  const pr = aggregate(runBatch(P("pragmatic")));
  s += pen(hold(iso), ...HOLD_TARGETS.isolated) * 3 + pen(hold(cw), ...HOLD_TARGETS.coldwar) * 2 + pen(hold(pr), ...HOLD_TARGETS.pragmatic) * 2;
  return { s, h, holds: [hold(h), hold(iso), hold(cw), hold(pr)] };
}

const rand = mulberry32(Number(process.argv[4] ?? 1));
const RANGES: Record<keyof typeof TUNE, [number, number]> = {
  aOffset: [0, 0.2], aMax: [0.5, 0.9], fearW: [0.2, 0.6], despAtro: [0.2, 0.6], despBrut: [0.1, 0.4],
  growthThr: [0.12, 0.3], suppW: [0.2, 0.7], garScale: [1, 4.5], dBase: [0, 0.35],
};
let best = { s: score().s, t: { ...TUNE } };
console.log("start", best.s.toFixed(3), JSON.stringify(TUNE));
for (let k = 0; k < iters; k++) {
  const local = k > iters / 3;
  for (const key of Object.keys(RANGES) as (keyof typeof TUNE)[]) {
    const [lo, hi] = RANGES[key];
    TUNE[key] = local
      ? Math.min(hi, Math.max(lo, best.t[key] + (rand() - 0.5) * (hi - lo) * 0.2))
      : lo + rand() * (hi - lo);
  }
  const r = score();
  if (r.s < best.s) {
    best = { s: r.s, t: { ...TUNE } };
    console.log(k, r.s.toFixed(3), "holds h/iso/cw/prag", r.holds.map((x) => x.toFixed(2)).join(" "), JSON.stringify(best.t));
  }
}
console.log("BEST", JSON.stringify(best));
