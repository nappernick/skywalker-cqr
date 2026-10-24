import { describe, expect, test } from "bun:test";
import { runBatch, simulate, mulberry32 } from "./simulate";
import { aggregate } from "./aggregate";
import { DEFAULT_PARAMS, PRESETS, cloneAff } from "./presets";
import { REGIONS, YEARS } from "./regions";
import { GROUPS } from "./groups";
import { CELLS, NC, CELLS_OF_REGION } from "./cells";
import { DEFAULT_AFF } from "./sponsors";
import { mortality } from "./people";
import { CF, NCF, GF, NGF, type Params } from "./types";

const paramsFor = (id: string, extra: Partial<Params> = {}): Params => ({
  ...DEFAULT_PARAMS,
  ...PRESETS.find((p) => p.id === id)!.vals,
  aff: cloneAff(),
  ...extra,
});

describe("data integrity", () => {
  test("region values sum to 1", () => {
    expect(REGIONS.reduce((s, r) => s + r.value, 0)).toBeCloseTo(1, 6);
  });

  test("group shares within each region never exceed 1", () => {
    for (let r = 0; r < REGIONS.length; r++) {
      const s = CELLS_OF_REGION[r].reduce((a, i) => a + CELLS[i].share, 0);
      expect(s).toBeLessThanOrEqual(1.0001);
    }
  });

  test("every group lives somewhere and every region has people", () => {
    for (let g = 0; g < GROUPS.length; g++) expect(CELLS.some((c) => c.g === g)).toBe(true);
    for (let r = 0; r < REGIONS.length; r++) expect(CELLS_OF_REGION[r].length).toBeGreaterThan(0);
  });

  test("every sponsor has an attitude toward every group", () => {
    for (const s of ["us", "uk", "su"] as const)
      for (const g of GROUPS) if (g.id !== "vdt") expect(DEFAULT_AFF[s][g.id]).toBeDefined();
  });

  test("mortality rises with age", () => {
    expect(mortality(70, 1)).toBeGreaterThan(mortality(50, 1));
    expect(mortality(60, 3)).toBeCloseTo(mortality(60, 1) * 3, 6);
  });
});

describe("simulation", () => {
  test("runs are deterministic for a seed", () => {
    const p = paramsFor("historical", { runs: 30 });
    const a = runBatch(p).map((r) => `${r.outcome}${r.endYear}`).join();
    const b = runBatch(p).map((r) => `${r.outcome}${r.endYear}`).join();
    expect(a).toBe(b);
  });

  test("recorded values are finite and in range", () => {
    const r = simulate(paramsFor("historical"), mulberry32(5), 0);
    expect(r.cells.length).toBe(YEARS * NC * NCF);
    expect(r.glob.length).toBe(YEARS * NGF);
    for (const v of r.cells) expect(Number.isFinite(v)).toBe(true);
    for (const v of r.glob) expect(Number.isFinite(v)).toBe(true);
    for (let t = 0; t < YEARS; t++)
      for (let i = 0; i < NC; i++) {
        const o = (t * NC + i) * NCF;
        for (const f of [CF.R, CF.A, CF.D, CF.FEAR, CF.NC, CF.AWARE]) {
          expect(r.cells[o + f]).toBeGreaterThanOrEqual(0);
          expect(r.cells[o + f]).toBeLessThanOrEqual(1);
        }
      }
  });

  test("Hitler is the first ruler and every year has a ruler until the end", () => {
    const r = simulate(paramsFor("historical"), mulberry32(9), 0);
    expect(r.rulers[0].name).toBe("Hitler");
    for (let t = 0; t <= r.endYear - 1941; t++) expect(r.glob[t * NGF + GF.LEAD]).toBeGreaterThanOrEqual(0);
  });

  test("abandoned resistance almost never wins", () => {
    const a = aggregate(runBatch(paramsFor("isolated", { runs: 120 })));
    expect((a.counts.hegemony + a.counts.fraying) / a.total).toBeGreaterThan(0.9);
  });

  test("Cold War backing does more damage than abandonment", () => {
    const cw = aggregate(runBatch(paramsFor("coldwar", { runs: 120 })));
    const iso = aggregate(runBatch(paramsFor("isolated", { runs: 120 })));
    expect(cw.control.med[20]).toBeLessThan(iso.control.med[20]);
  });

  test("a Soviet sponsor that refuses a group leaves it weaker", () => {
    const base = paramsFor("historical", { runs: 120 });
    const snub = paramsFor("historical", { runs: 120 });
    snub.aff.su.ser = 0;
    snub.aff.su.mon = 0;
    const gi = GROUPS.findIndex((g) => g.id === "ser");
    expect(aggregate(runBatch(snub)).groupMajor[gi]).toBeLessThanOrEqual(aggregate(runBatch(base)).groupMajor[gi]);
  });
});
