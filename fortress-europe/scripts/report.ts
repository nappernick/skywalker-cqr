// Prints scenario outcomes and per-group / per-region results. Usage: bun scripts/report.ts [preset] [runs]
import { runBatch } from "../src/model/simulate";
import { aggregate } from "../src/model/aggregate";
import { DEFAULT_PARAMS, PRESETS, cloneAff } from "../src/model/presets";
import { GROUPS } from "../src/model/groups";
import { REGIONS } from "../src/model/regions";
import type { Params } from "../src/model/types";

const presets = process.argv[2] ? [process.argv[2]] : PRESETS.map((p) => p.id);
const runs = Number(process.argv[3] ?? 200);
for (const id of presets) {
  const p: Params = { ...DEFAULT_PARAMS, ...PRESETS.find((x) => x.id === id)!.vals, aff: cloneAff(), runs };
  const t0 = performance.now();
  const rs = runBatch(p);
  const a = aggregate(rs);
  const ms = performance.now() - t0;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  console.log(`\n=== ${id} (${runs} runs, ${ms.toFixed(0)} ms)`);
  console.log("outcomes", Object.entries(a.counts).map(([k, v]) => `${k} ${pct(v / a.total)}`).join(" | "),
    "| held (hegemony+fraying)", pct((a.counts.hegemony + a.counts.fraying) / a.total));
  console.log("control med 1945/55/70", [4, 14, 29].map((t) => a.control.med[t].toFixed(0)).join(" / "),
    "| strength 1945/55/70", [4, 14, 29].map((t) => a.strength.med[t].toFixed(2)).join(" / "));
  console.log("founder gone by 1950/60/70", [9, 19, 29].map((t) => pct(a.hitlerDead[t])).join(" / "),
    "| church war by 1970", pct(a.churchWar[29]), "| rump alive 1970", pct(a.rumpAlive[29]));
  console.log("groups (share of runs reaching major force):");
  console.log("  " + GROUPS.map((g, i) => `${g.id} ${pct(a.groupMajor[i])}`).join("  "));
  console.log("regions (share of runs lost to resistance/defection):");
  console.log("  " + REGIONS.map((r, i) => `${r.id} ${pct(a.lostShare[i])}`).join("  "));
  const ex = rs.reduce((n, r) => n + r.rulers.filter((x) => x.kind === "exceptional").length, 0);
  const rl = rs.reduce((n, r) => n + r.resLeaders.length, 0);
  console.log(`exceptional rulers per run ${(ex / runs).toFixed(2)} | exceptional resistance leaders per run ${(rl / runs).toFixed(2)}`);
}
