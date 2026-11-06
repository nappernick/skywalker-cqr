// The game layer: a player acting on one history of the model, a year at a time.
// The engine stays the judge of consequences; the game only decides which interventions reach it.
import { createSim, mulberry32, type Sim } from "../model/simulate";
import { REGIONS, REGION_INDEX, START, YEARS } from "../model/regions";
import { GROUPS, GROUP_INDEX } from "../model/groups";
import { CELLS, CELLS_OF_GROUP, NC } from "../model/cells";
import { ZONES } from "../model/people";
import { US_GOVS, UK_GOVS, govAt } from "../model/world";
import { CF, GF, NCF, NGF, RF, NRF, type Interventions, type Mission, type Params, type RunResult, type Stance } from "../model/types";
import { CARDS, type Card } from "./cards";
import { CHAPTERS } from "./chapters";

export type Mode = "spymaster" | "people" | "campaign";
export type Role = { kind: "spymaster" } | { kind: "people"; group: string };

export interface Decision { y: number; title: string; choice: string; consequence: string }

/** What the player has set up for the coming year. Orders persist; spending resets each year. */
export interface Plan {
  supply: Record<string, number>;
  info: Record<string, number>;
  missions: Mission[];
}

export interface Game {
  mode: Mode;
  /** The people a "people" game is about. */
  group: string | null;
  params: Params;
  sim: Sim;
  /** Influence (spymaster) or organization (people) to spend this year. */
  capital: number;
  plan: Plan;
  /** Standing orders to peoples, kept until changed. */
  orders: Record<string, Stance>;
  /** Story cards waiting for an answer this year. */
  pending: Card[];
  used: Set<string>;
  decisions: Decision[];
  /** Reprisals the player's own orders and operations provoked. */
  reprisals: number;
  chapter: number;
  chapterResults: { title: string; met: boolean; text: string }[];
  rng: () => number;
  /** Bumped on every change so the UI can re-render. */
  version: number;
}

export const COST = { arms: 10, radio: 10, assassinate: 6, sabotage: 4, broadcast: 3, protect: 2, train: 3, appeal: 3 } as const;
export const MISSION_LABEL: Record<Mission["kind"], string> = {
  assassinate: "Assassinate the governor", sabotage: "Sabotage", broadcast: "Broadcast the evidence", protect: "Hide a leader", train: "Send instructors",
};

// ---------- Reading the history so far ----------

/** The last recorded year (−1 before 1941 has been played). */
export const lastT = (g: Game) => g.sim.t - 1;
export const year = (g: Game) => START + g.sim.t;
export const run = (g: Game): RunResult => g.sim.live();

export function glob(g: Game, f: number): number {
  const t = lastT(g);
  return t < 0 ? (f === GF.COH ? 0.82 : f === GF.X ? 0.55 : f === GF.CTRL ? 100 : f === GF.K ? -1 : 0) : g.sim.live().glob[t * NGF + f];
}

export function cell(g: Game, i: number, f: number): number {
  const t = lastT(g);
  return t < 0 ? 0 : g.sim.live().cells[(t * NC + i) * NCF + f];
}

/** A people's strongest armed strength anywhere. */
export const groupR = (g: Game, id: string) => Math.max(0, ...CELLS_OF_GROUP[GROUP_INDEX[id]].map((i) => cell(g, i, CF.R)));
/** A people's average dissent, weighted by where it lives. */
export function groupD(g: Game, id: string): number {
  const cs = CELLS_OF_GROUP[GROUP_INDEX[id]];
  const w = cs.reduce((a, i) => a + CELLS[i].share, 0);
  return lastT(g) < 0 ? 0.5 : cs.reduce((a, i) => a + CELLS[i].share * cell(g, i, CF.D), 0) / w;
}
export function regionLost(g: Game, id: string): boolean {
  const t = lastT(g);
  return t >= 0 && g.sim.live().regions[(t * REGIONS.length + REGION_INDEX[id]) * NRF + RF.LOST] > 0.5;
}
export function rulerName(g: Game): string {
  const k = glob(g, GF.LEAD);
  return lastT(g) < 0 ? "Hitler" : k >= 0 ? g.sim.live().rulers[k].name : "";
}
export function governorOf(g: Game, zone: string): string {
  const z = ZONES.find((x) => x.id === zone)!;
  const t = lastT(g);
  if (t < 0) return "";
  const k = g.sim.live().regions[(t * REGIONS.length + REGION_INDEX[z.regions[0]]) * NRF + RF.GOV];
  return k >= 0 ? g.sim.live().govs[k].name : "";
}
export const leaderOf = (g: Game, id: string) => run(g).resLeaders.find((l) => l.group === id && l.until === null) ?? null;

/** Regions where a people lives. */
export const homeRegions = (id: string) => CELLS_OF_GROUP[GROUP_INDEX[id]].map((i) => REGIONS[CELLS[i].r].id);

// ---------- Who is playing ----------

export function role(g: Game): Role {
  if (g.mode === "spymaster") return { kind: "spymaster" };
  if (g.mode === "people") return { kind: "people", group: g.group! };
  const ch = CHAPTERS[g.chapter];
  return ch.group ? { kind: "people", group: ch.group } : { kind: "spymaster" };
}

/** Peoples the player can give orders to: your own people, or those your network arms. */
export function commandable(g: Game): string[] {
  const r = role(g);
  if (r.kind === "people") return [r.group];
  return GROUPS.filter((x) => x.id !== "vdt" && (g.plan.supply[x.id] ?? 0) >= 0.2).map((x) => x.id);
}

/** Influence for the year: Washington's and London's appetite (spymaster), or the movement's strength (people). */
export function income(g: Game): number {
  const r = role(g);
  const y = year(g);
  if (r.kind === "spymaster") {
    const will = g.params.us * govAt(US_GOVS, y).mult * (y >= 1947 ? 1.15 : 1) + g.params.uk * govAt(UK_GOVS, y).mult;
    return Math.round(6 + 14 * will);
  }
  const grp = GROUPS[GROUP_INDEX[r.group]];
  return Math.round(4 + 8 * groupD(g, r.group) + 4 * grp.exile + 6 * groupR(g, r.group));
}

export function spent(g: Game): number {
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return Math.round(sum(g.plan.supply) * COST.arms + sum(g.plan.info) * COST.radio + g.plan.missions.reduce((a, m) => a + COST[m.kind], 0));
}
export const available = (g: Game) => g.capital - spent(g);

// ---------- Setting up ----------

export function newGame(mode: Mode, params: Params, group: string | null = null): Game {
  const g: Game = {
    mode, group: mode === "people" ? group ?? "ser" : null,
    params: { ...params, aff: { us: { ...params.aff.us }, uk: { ...params.aff.uk }, su: { ...params.aff.su } } },
    sim: null as unknown as Sim,
    capital: 0, plan: { supply: {}, info: {}, missions: [] }, orders: {}, pending: [], used: new Set(),
    decisions: [], reprisals: 0, chapter: 0, chapterResults: [], rng: mulberry32(params.seed + 7), version: 0,
  };
  g.sim = createSim(g.params, mulberry32(params.seed), 0);
  g.capital = income(g);
  draw(g);
  return g;
}

// ---------- The player's levers ----------

const touch = (g: Game) => { g.version++; };

export function setSupply(g: Game, id: string, v: number) {
  const old = g.plan.supply[id] ?? 0;
  const cap = old + Math.max(0, available(g)) / COST.arms;
  g.plan.supply[id] = Math.round(Math.max(0, Math.min(0.6, v, cap)) * 10) / 10;
  if (!g.plan.supply[id]) delete g.plan.supply[id];
  touch(g);
}

export function setInfo(g: Game, region: string, v: number) {
  const old = g.plan.info[region] ?? 0;
  const cap = old + Math.max(0, available(g)) / COST.radio;
  g.plan.info[region] = Math.round(Math.max(0, Math.min(0.5, v, cap)) * 10) / 10;
  if (!g.plan.info[region]) delete g.plan.info[region];
  touch(g);
}

export function addMission(g: Game, m: Mission): boolean {
  if (available(g) < COST[m.kind]) return false;
  if (g.plan.missions.some((x) => JSON.stringify(x) === JSON.stringify(m))) return false;
  g.plan.missions.push(m);
  touch(g);
  return true;
}

export function removeMission(g: Game, k: number) { g.plan.missions.splice(k, 1); touch(g); }

export function setOrder(g: Game, id: string, s: Stance | null) {
  if (s) g.orders[id] = s; else delete g.orders[id];
  touch(g);
}

/** A people appeals to a sponsor: its standing with that sponsor rises for good. */
export function appeal(g: Game, sponsor: "us" | "uk" | "su"): boolean {
  const r = role(g);
  if (r.kind !== "people" || available(g) < COST.appeal) return false;
  g.capital -= COST.appeal;
  g.params.aff[sponsor][r.group] = Math.min(1, (g.params.aff[sponsor][r.group] ?? 0) + 0.1);
  g.decisions.push({ y: year(g), title: "Appeal", choice: `Appeal to ${sponsor === "us" ? "Washington" : sponsor === "uk" ? "London" : "Moscow"}`, consequence: "Your envoys win a little more standing. Supply follows standing, not promises." });
  touch(g);
  return true;
}

// ---------- Story cards ----------

/** Deals up to two story cards for the coming year. */
function draw(g: Game) {
  const eligible = CARDS.filter((c) => !g.used.has(c.id) && c.when(g));
  const out: Card[] = [];
  while (eligible.length && out.length < 2) out.push(eligible.splice(Math.floor(g.rng() * eligible.length), 1)[0]);
  for (const c of out) g.used.add(c.id);
  g.pending = out;
}

export function choose(g: Game, cardId: string, k: number) {
  const c = g.pending.find((x) => x.id === cardId);
  if (!c) return;
  const ch = c.choices[k];
  const consequence = ch.apply(g) ?? ch.result;
  g.decisions.push({ y: year(g), title: c.title, choice: ch.label, consequence });
  g.pending = g.pending.filter((x) => x.id !== cardId);
  touch(g);
}

// ---------- Ending the year ----------

/** Orders that provoke reprisals: open risings and assassinations. Counted for the ledger. */
function provocations(g: Game): number {
  return Object.values(g.orders).filter((s) => s === "rise").length + g.plan.missions.filter((m) => m.kind === "assassinate" || m.kind === "sabotage").length;
}

export function endYear(g: Game) {
  if (g.sim.done || g.pending.length) return;
  const iv: Interventions = { supply: { ...g.plan.supply }, info: { ...g.plan.info }, stance: { ...g.orders }, missions: [...g.plan.missions] };
  g.reprisals += provocations(g);
  const left = Math.max(0, available(g));
  g.sim.step(iv);
  if (g.mode === "campaign") advanceChapter(g, g.sim.done);
  if (!g.sim.done) {
    g.capital = income(g) + Math.floor(left / 2);
    g.plan = { supply: {}, info: {}, missions: [] };
    draw(g);
  } else {
    g.pending = [];
  }
  touch(g);
}

/** Judges the chapter once its last year is played, or when the history ends early. */
function advanceChapter(g: Game, ended: boolean) {
  const ch = CHAPTERS[g.chapter];
  if (!ch || (year(g) <= ch.to && !ended)) return;
  const res = ch.objective(g);
  g.chapterResults.push({ title: ch.title, met: res.met, text: res.text });
  g.chapter++;
  const next = CHAPTERS[g.chapter];
  if (next) g.orders = next.group ? { [next.group]: g.orders[next.group] } as Record<string, Stance> : {};
  for (const k of Object.keys(g.orders)) if (!g.orders[k]) delete g.orders[k];
}

export const finished = (g: Game) => g.sim.done;
export const yearsLeft = (g: Game) => YEARS - g.sim.t;
