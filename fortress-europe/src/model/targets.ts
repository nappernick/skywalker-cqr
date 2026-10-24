// Calibration targets. There is no ground truth after 1945, so these are judgment ranges grounded in 1941–45 behavior.

/** Share of runs in which Germany still holds Europe (hegemony or fraying) in 1970, per preset. */
export const HOLD_TARGETS: Record<string, [number, number]> = {
  historical: [0.45, 0.65], pragmatic: [0.88, 1], isolated: [0.93, 1], coldwar: [0, 0.3],
};

/** Share of historical runs in which each group's resistance becomes a major force (armed strength 0.5 or more). */
export const GROUP_TARGETS: Record<string, [number, number]> = {
  ser: [0.4, 0.6], mon: [0.4, 0.6], gre: [0.3, 0.5], bel: [0.35, 0.6], pol: [0.1, 0.35], slv: [0.2, 0.45],
  alb: [0.15, 0.35], cro: [0.1, 0.3], euk: [0.15, 0.35], wuk: [0.15, 0.4], rus: [0.2, 0.45], fre: [0.05, 0.2],
  nor: [0.03, 0.15], cze: [0.02, 0.12], dut: [0, 0.05], dan: [0, 0.05], fle: [0, 0.05], lux: [0, 0.05], als: [0, 0.05],
  wal: [0.02, 0.1], lit: [0.05, 0.25], lat: [0.05, 0.25], est: [0.05, 0.25], slk: [0.1, 0.3], bos: [0.05, 0.2],
  mac: [0.05, 0.25], ita: [0.05, 0.3], hun: [0.05, 0.3], rom: [0.05, 0.3], bul: [0.05, 0.3], fin: [0.05, 0.3],
};

/** Share of historical runs in which each region is lost. Norway's resistance never held territory; the Low Countries had no terrain to try. */
export const REGION_TARGETS: Record<string, [number, number]> = {
  nor: [0, 0.2], den: [0, 0.05], nld: [0, 0.05], bel: [0, 0.05], lux: [0, 0.05],
};
