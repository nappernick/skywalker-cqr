/**
 * Runs the travel-demand analysis end to end, in dependency order:
 *   build (xlsx -> SQLite) -> analyze -> FAQ coverage -> semantic intent space -> census report -> dashboard export.
 * Usage: bun travel-demand/pipeline.ts [--from <step>] [--python <bin>]
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const ROOT = import.meta.dir;
const DATA = join(ROOT, "data");

interface Step {
  readonly name: string;
  readonly args: readonly string[];
  readonly needs: readonly string[];
}

const STEPS: readonly Step[] = [
  { name: "build", args: ["scripts/build.py", "data/tickets.xlsx"], needs: ["tickets.xlsx"] },
  { name: "analyze", args: ["scripts/analyze.py"], needs: ["travel.sqlite"] },
  { name: "coverage", args: ["scripts/faq_coverage.py"], needs: ["travel.sqlite", "corpus/skywalker_faq_corpus.jsonl"] },
  { name: "space", args: ["scripts/intent_space.py"], needs: ["travel.sqlite"] },
  { name: "census", args: ["scripts/census.py", "report"], needs: ["travel.sqlite", "census/ratings.csv", "census/ticket_signature.csv"] },
  { name: "export", args: ["scripts/export_dashboard.py"], needs: ["travel.sqlite"] },
];

const { values } = parseArgs({ options: { from: { type: "string" }, python: { type: "string" } } });
const python: string = values.python ?? "python3";
const start = values.from ? STEPS.findIndex((s) => s.name === values.from) : 0;
if (start < 0) throw new Error(`unknown step "${values.from}"; one of: ${STEPS.map((s) => s.name).join(", ")}`);

for (const step of STEPS.slice(start)) {
  const missing = step.needs.filter((f) => !existsSync(join(DATA, f)));
  if (missing.length) {
    if (step.name === "census") {
      console.warn(`skip census: missing data/${missing.join(", data/")} (run scripts/census.py prepare and rate the batches)`);
      continue;
    }
    throw new Error(`step ${step.name}: missing data/${missing.join(", data/")}`);
  }
  console.log(`\n== ${step.name}`);
  const proc = Bun.spawn([python, ...step.args], { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`step ${step.name} failed with exit code ${code}`);
}
console.log("\npipeline complete: reports/ and reports/dashboard/ are up to date");
