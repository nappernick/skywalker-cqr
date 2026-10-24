// Prints the model's data as Markdown tables (used to build README.md). Usage: bun scripts/tables.ts
import { GROUPS, RIVALRIES } from "../src/model/groups";
import { REGIONS } from "../src/model/regions";
import { DEFAULT_AFF, NEUTRALS } from "../src/model/sponsors";
import { REGION_RESOURCES, RESOURCE_NOTES } from "../src/model/resources";
import { ZONES, INITIAL_GOVERNORS, HEIRS, HITLER, ALLY_RULERS } from "../src/model/people";

const f = (x: number) => x.toFixed(2).replace(/^0\./, ".");
console.log("### Identity groups\n");
console.log("| id | Group | Nazi classification | bm | ident | collabP | theta | comm | polar | rel | exile | Lives in (region: share) | US | UK | USSR |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const g of GROUPS) console.log(`| ${g.id} | ${g.name} | ${g.classLabel} | ${f(g.bm)} | ${f(g.ident)} | ${f(g.collabP)} | ${f(g.theta)} | ${f(g.comm)} | ${f(g.polar)} | ${f(g.rel)} | ${f(g.exile)} | ${g.presence.map(([r, s]) => `${r} ${f(s)}`).join(", ")} | ${DEFAULT_AFF.us[g.id] !== undefined ? f(DEFAULT_AFF.us[g.id]) : "–"} | ${DEFAULT_AFF.uk[g.id] !== undefined ? f(DEFAULT_AFF.uk[g.id]) : "–"} | ${DEFAULT_AFF.su[g.id] !== undefined ? f(DEFAULT_AFF.su[g.id]) : "–"} |`);
console.log("\nGroup notes:\n");
for (const g of GROUPS) console.log(`- **${g.name}** (${g.id}): ${g.notes} Exile backing: ${g.exileName}.`);
console.log("\n### Rivalries\n\n| Groups | Strength | Why |\n|---|---|---|");
for (const r of RIVALRIES) console.log(`| ${r.a} vs ${r.b} | ${f(r.k)} | ${r.note} |`);
console.log("\n### Regions\n\n| id | Region | Kind | Value | Terrain | West reach | Soviet reach | Neutral conduits | Priority | Regime / titular group | Resources |\n|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of REGIONS) {
  const res = REGION_RESOURCES[r.id];
  console.log(`| ${r.id} | ${r.name} | ${r.kind} | ${f(r.value)} | ${f(r.terrain)} | ${f(r.westReach)} | ${f(r.sovReach)} | ${r.conduits.map(([n, w]) => `${n} ${f(w)}`).join(", ") || "–"} | ${r.priority} | ${[r.regime, r.titular].filter(Boolean).join(" / ") || "–"} | ${res ? Object.entries(res).map(([k, v]) => `${k} ${f(v!)}`).join(", ") : "–"}${RESOURCE_NOTES[r.id] ? ` (${RESOURCE_NOTES[r.id]})` : ""} |`);
}
console.log("\n### Neutrals\n\n| id | Country | Courage | Stance |\n|---|---|---|---|");
for (const n of NEUTRALS) console.log(`| ${n.id} | ${n.name} | ${f(n.courage)} | ${n.stance} |`);
console.log("\n### German administrative zones and starting governors\n\n| Zone | Regions | Oversight | Governor | Faction | Competence | Zeal | Old fighter | Note |\n|---|---|---|---|---|---|---|---|---|");
for (const z of ZONES) { const g = INITIAL_GOVERNORS[z.id]; console.log(`| ${z.name} | ${z.regions.join(", ")} | ${z.oversight} | ${g.name} | ${g.faction} | ${g.competence} | ${g.zeal} | ${g.oldFighter ? "yes" : "no"} | ${g.note} |`); }
console.log("\n### Berlin: founder and known heirs\n\n| Name | Born | Health × | Faction | Force | Competence | Ideology | Loyalty | Merit | Note |\n|---|---|---|---|---|---|---|---|---|---|");
for (const h of [HITLER, ...HEIRS]) console.log(`| ${h.name} | ${h.born} | ${h.health} | ${h.faction} | ${h.force} | ${h.competence} | ${h.ideology} | ${h.loyalty} | ${h.merit} | ${h.note} |`);
console.log("\n### Allied and puppet rulers\n\n| Ruler | Born | Regions | Commitment |\n|---|---|---|---|");
for (const a of ALLY_RULERS) console.log(`| ${a.name} | ${a.born} | ${a.regions.join(", ")} | ${a.commit} |`);
