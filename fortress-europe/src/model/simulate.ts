import { REGIONS, REGION_INDEX, START, END, YEARS } from "./regions";
import { GROUPS, GROUP_INDEX } from "./groups";
import { NEUTRALS } from "./sponsors";
import {
  CELLS, NC, CELLS_OF_REGION, RIVALS_OF_CELL, ARMS_CACHE, JEWISH_SHARE, ALLY_INDEPENDENCE, GPO_TARGET, HARVEST_ZONE, NZONES,
} from "./cells";
import {
  ZONES, ZONE_OF, INITIAL_GOVERNORS, HEYDRICH_REPLACEMENT, ARCHETYPES, HITLER, HEIRS, COHORT_LABEL, FACTION_IDEOLOGY,
  FACTION_LABEL, ALLY_RULERS, FIGURE_TALENT, EXCEPTIONAL_LABEL, mortality, type Figure,
} from "./people";
import { CORE, REGION_RESOURCES, NEUTRAL_TRADE, RESOURCE_NEED, RESOURCE_WEIGHT, type ResourceId } from "./resources";
import { US_GOVS, UK_GOVS, SU_GOVS, govAt } from "./world";
import {
  CF, NCF, RF, NRF, GF, NGF,
  type EventKind, type FactionId, type Governor, type Outcome, type Params, type ResLeader, type Ruler, type RunResult,
  type SimEvent, type Talent,
} from "./types";

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** Psychology and force constants, set by scripts/calibrate.ts against all-group targets. */
export const TUNE = {
  aOffset: 0.036,
  aMax: 0.785,
  fearW: 0.485,
  despAtro: 0.291,
  despBrut: 0.4,
  growthThr: 0.252,
  suppW: 0.46,
  garScale: 3.2,
  dBase: 0.099,
  rise: 0.6,
  surge: 2,
  crush: 8,
};

const FACTIONS: FactionId[] = ["ss", "party", "wehr", "tech", "goring"];
const SKILLS = ["orator", "diplomat", "general", "admin"] as const;
type Skill = (typeof SKILLS)[number];
const RES: ResourceId[] = ["oil", "coal", "iron", "food", "metals"];

/** Ordinary people vary around their background; exceptional ones can be anything. */
function drawTalent(rng: () => number, base: { comp: number; violence: number; ideology: number }, pExceptional: number): Talent {
  if (rng() < pExceptional) {
    const primary = SKILLS[Math.floor(rng() * 4)];
    const secondary = rng() < 0.5 ? SKILLS[Math.floor(rng() * 4)] : null;
    const sk = (s: Skill) => (s === primary ? 0.85 + 0.15 * rng() : s === secondary ? 0.7 + 0.25 * rng() : clamp(0.4 + 0.2 * gauss(rng), 0.05, 0.9));
    return {
      force: 0.85 + 0.15 * rng(), competence: 0.75 + 0.25 * rng(),
      orator: sk("orator"), diplomat: sk("diplomat"), general: sk("general"), admin: sk("admin"),
      violence: rng(), ideology: rng(), exceptional: true,
    };
  }
  const sk = () => clamp(0.35 + 0.15 * gauss(rng), 0.05, 0.85);
  return {
    force: clamp(0.3 * Math.exp(0.45 * gauss(rng)), 0.05, 0.8),
    competence: clamp(base.comp + 0.12 * gauss(rng), 0.1, 0.95),
    orator: sk(), diplomat: sk(), general: sk(), admin: sk(),
    violence: clamp(base.violence + 0.15 * gauss(rng), 0, 1),
    ideology: clamp(base.ideology + 0.15 * gauss(rng), 0, 1),
    exceptional: false,
  };
}

const topSkill = (t: Talent): Skill => SKILLS.reduce((a, b) => (t[b] > t[a] ? b : a), SKILLS[0]);

function describeAlignment(t: Talent): string {
  const v = t.violence < 0.25 ? "committed to restraint" : t.violence > 0.75 ? "ready for unlimited violence" : "coldly calculating about force";
  const i = t.ideology < 0.3 ? "a pragmatist" : t.ideology > 0.75 ? "a true believer" : "a believer with limits";
  return `${i}, ${v}`;
}

const figureTalent = (f: Figure): Talent => ({
  force: f.force, competence: f.competence, ideology: f.ideology, ...FIGURE_TALENT[f.key], exceptional: f.key === "hitler",
});

export function simulate(p: Params, rng: () => number, id: number): RunResult {
  const NR = REGIONS.length;
  const NG = GROUPS.length;
  const cellRec = new Float32Array(YEARS * NC * NCF);
  const regRec = new Float32Array(YEARS * NR * NRF);
  const glob = new Float32Array(YEARS * NGF);
  const events: SimEvent[] = [];
  const say = (y: number, kind: EventKind, text: string, region?: string) => events.push({ y, kind, text, region });

  // ---------- Berlin ----------
  const prag = p.pragmatism;
  const fac: Record<FactionId, number> = { ss: 0.28, party: 0.3, wehr: 0.12 + 0.2 * prag, tech: 0.06 + 0.14 * prag, goring: 0.12 };
  const normFac = () => {
    let s = 0;
    for (const f of FACTIONS) { fac[f] = Math.max(0.02, fac[f]); s += fac[f]; }
    for (const f of FACTIONS) fac[f] /= s;
  };
  normFac();
  const fac0 = { ...fac };
  const ideo0 = fac0.ss + fac0.party;
  const prag0 = fac0.wehr + fac0.tech;
  const bench: Record<FactionId, number> = { ss: 0.6, party: 0.45, wehr: 0.62, tech: 0.68, goring: 0.38 };

  const rulers: Ruler[] = [];
  const mkRuler = (f: Figure, y: number, kind: Ruler["kind"]): Ruler => ({
    name: f.name, faction: f.faction, born: f.born, talent: figureTalent(f), loyalty: f.loyalty, merit: f.merit, since: y, kind, note: f.note,
  });
  rulers.push(mkRuler(HITLER, START, "founder"));
  let ruler = rulers[0];
  let rulerIdx = 0;
  let rulerPrefers: Partial<Record<FactionId, number>> = HITLER.prefers;
  const heirAlive: Record<string, boolean> = Object.fromEntries(HEIRS.map((h) => [h.key, true]));
  let heydrichAlive = true;
  let fervor = 0.9;
  let coh = 0.82;
  let X = 0.55;

  // ---------- Governors ----------
  const govs: Governor[] = [];
  const zoneGov: number[] = [];
  const zoneR = ZONES.map(() => 0);
  const protectedLogged = new Set<number>();
  const govTalent = (comp: number, zeal: number, exceptional: number): Talent =>
    drawTalent(rng, { comp, violence: zeal, ideology: zeal }, exceptional);
  ZONES.forEach((z) => {
    const s = INITIAL_GOVERNORS[z.id];
    const t = govTalent(s.competence, s.zeal, 0);
    t.competence = s.competence; t.violence = s.zeal; t.ideology = s.zeal;
    govs.push({ name: s.name, faction: s.faction, competence: s.competence, zeal: s.zeal, since: START, oldFighter: s.oldFighter, talent: t, note: s.note });
    zoneGov.push(govs.length - 1);
  });
  const zoneIndex: Record<string, number> = Object.fromEntries(ZONES.map((z, i) => [z.id, i]));

  // Allied and puppet rulers
  const allyGov: Record<string, number> = {};
  const allyCommit: Record<string, number> = {};
  const allyBorn: Record<string, number> = {};
  const allyHealth: Record<string, number> = {};
  const allyShock: Record<string, number> = {};
  const allyDiplomat: Record<string, number> = {};
  const allyOfRegion: Record<number, string> = {};
  for (const a of ALLY_RULERS) {
    govs.push({
      name: a.name, faction: "ally", competence: 0.6, zeal: a.commit, since: START, oldFighter: false,
      talent: { force: 0.5, competence: 0.6, orator: 0.4, diplomat: 0.4, general: 0.4, admin: 0.5, violence: 0.5, ideology: a.commit, exceptional: false },
      note: "",
    });
    allyGov[a.key] = govs.length - 1;
    allyCommit[a.key] = a.commit;
    allyBorn[a.key] = a.born;
    allyHealth[a.key] = a.health;
    allyShock[a.key] = 0;
    allyDiplomat[a.key] = 0.4;
    for (const rid of a.regions) allyOfRegion[REGION_INDEX[rid]] = a.key;
  }
  const govOfRegion = (r: number): Governor => {
    const z = ZONE_OF[REGIONS[r].id];
    if (z !== undefined && REGIONS[r].kind !== "ally") return govs[zoneGov[zoneIndex[z]]];
    return govs[allyGov[allyOfRegion[r]]];
  };
  const govIdxOfRegion = (r: number): number => {
    const z = ZONE_OF[REGIONS[r].id];
    if (z !== undefined && REGIONS[r].kind !== "ally") return zoneGov[zoneIndex[z]];
    return allyGov[allyOfRegion[r]] ?? -1;
  };

  // ---------- Outside world ----------
  let rumpAlive = rng() < p.rump;
  let K = rumpAlive ? 0.28 : 0;
  const usBomb = Math.round(p.bombYear + gauss(rng) * 3);
  let deBomb: number | null = null;
  let usWar = false;
  let outcome: Outcome | null = null;
  let endYear = END;

  // ---------- Cells ----------
  const cR = new Float64Array(NC);
  const cA = new Float64Array(NC);
  const cD = new Float64Array(NC);
  const cAtro = new Float64Array(NC);
  const cCap = new Float64Array(NC).fill(1);
  const cPop = new Float64Array(NC).fill(1);
  const cGen = new Float64Array(NC);
  const cLearn = new Float64Array(NC);
  const cAware = new Float64Array(NC);
  const cNC = new Float64Array(NC);
  const cColAct = new Float64Array(NC);
  const groupPeak = new Array(NG).fill(0);
  const logged = CELLS.map(() => ({ cascade: false, infight: false, snub: false, labor: false, famine: 0 }));
  for (let i = 0; i < NC; i++) {
    const c = CELLS[i];
    const g = GROUPS[c.g];
    const r = REGIONS[c.r];
    // Men who kept their rifles when their army dissolved are the first fighters.
    cR[i] = g.id === "vdt" || r.kind === "ally" ? 0
      : 0.02 + 0.05 * g.bm * r.terrain + 0.12 * (ARMS_CACHE[r.id] ?? 0) * (1 - g.collabP) + (rumpAlive && r.sovReach > 0.8 ? 0.04 * g.comm : 0);
    cA[i] = r.kind === "ally" ? 0.04 : 0.08 * (1 - g.collabP * 0.5);
    cD[i] = 0.2 + g.ident * 0.3 + g.bm * 0.1;
    const commit0 = r.titular === g.id ? (ALLY_RULERS.find((a) => a.regions.includes(r.id))?.commit ?? 0.5) : 0;
    cColAct[i] = g.id === "vdt" ? 0.6 + 0.3 * p.collab
      : Math.max(commit0 * g.collabP, clamp((p.collab + 0.25 * (r.titular === g.id ? 1 - commit0 : 0)) * g.collabP * (1 - 0.6 * cD[i]) * (0.5 + 0.5 * X), 0, 1));
  }

  // ---------- Regions ----------
  const lost = new Array(NR).fill(false);
  const lostByResistance = new Array(NR).fill(false);
  const streak = new Array(NR).fill(0);
  const cStreak = new Array(NR).fill(0);
  const regTop = new Float64Array(NR);
  const surgeGar = new Float64Array(NR);
  const contested = new Array(NR).fill(false);
  const contestedEver = new Array(NR).fill(false);
  const regR = new Float64Array(NR);
  const regA = new Float64Array(NR);
  const regNC = new Float64Array(NR);
  const regW = CELLS_OF_REGION.map((cs) => cs.map((i) => CELLS[i].share));
  const jewGone = new Float64Array(NR);
  const allyDeported: Record<string, boolean> = {};
  const regionLogged = REGIONS.map(() => ({ gpo: false, nc: false }));

  // ---------- Resistance leaders ----------
  const resLeaders: ResLeader[] = [];
  const groupLeader = new Array<number>(NG).fill(-1);

  let lastDefection = -99;
  let learnG = 0;
  let settlers = 0.1;
  let church = 0;
  let churchStarted = false;
  let gpoLogged = false;
  let lastT = YEARS - 1;
  let prevLosses = 0;

  say(START, "start", rumpAlive
    ? "The Soviet state survives the 1941–42 campaigns as a rump beyond the Volga and Urals. The eastern front never fully closes."
    : "The Soviet state collapses in 1942. Partisans in the east lose their only real sponsor.");
  say(START, "start", "Britain is at peace with Germany under the 1940 settlement. Its government, its broadcasts and its secret services are constrained by the treaty. The United States stays out but keeps sending aid.");

  /** Picks Berlin's next ruler from surviving heirs and a generated cohort, weighted by institutional base and personal force. */
  const succession = (y: number, cause: string) => {
    type Cand = { ruler: Ruler; prefers: Partial<Record<FactionId, number>>; w: number; key?: string };
    const cands: Cand[] = [];
    const founderDied = ruler.kind === "founder";
    for (const h of HEIRS) {
      if (!heirAlive[h.key] || h.name === ruler.name) continue;
      if (h.key === "heydrich" && !heydrichAlive) continue;
      const r = mkRuler(h, y, "known");
      const heir = h.key === "goring" && founderDied ? 2.5 : 1;
      cands.push({ ruler: r, prefers: h.prefers, w: (fac[h.faction] + 0.04) * Math.pow(h.force, 1.5) * Math.sqrt(h.competence) * heir, key: h.key });
    }
    const nCohort = 2 + (y > 1955 ? 1 : 0);
    for (let k = 0; k < nCohort; k++) {
      let u = rng();
      let f: FactionId = "ss";
      for (const ff of FACTIONS) { u -= fac[ff]; if (u <= 0) { f = ff; break; } }
      const born = Math.round(y - 47 - 9 * rng());
      const hj = born >= 1918;
      const t = drawTalent(rng, {
        comp: bench[f],
        violence: clamp(FACTION_IDEOLOGY[f] - 0.05, 0, 1),
        ideology: clamp(FACTION_IDEOLOGY[f] + (hj ? 0.05 : 0) - 0.25 * (1 - fervor), 0, 1),
      }, 0.04);
      const labels = COHORT_LABEL[f];
      const base = labels[Math.floor(rng() * labels.length)];
      const name = t.exceptional ? `${EXCEPTIONAL_LABEL[topSkill(t)]}, ${base.replace(/^an? /, "")}` : base;
      const prefers: Partial<Record<FactionId, number>> = t.ideology > 0.6
        ? { [f]: 0.5, ss: (f === "ss" ? 0.5 : 0) + 0.25, party: (f === "party" ? 0.5 : 0) + 0.15, tech: 0.05, wehr: 0.05 }
        : { [f]: 0.5, wehr: (f === "wehr" ? 0.5 : 0) + 0.2, tech: (f === "tech" ? 0.5 : 0) + 0.2, ss: 0.05, party: 0.05 };
      const r: Ruler = {
        name: `${name} (born ${born})`, faction: f, born, talent: t,
        loyalty: clamp(0.5 - 0.3 * t.competence + 0.15 * gauss(rng), 0.05, 0.9), merit: clamp(t.competence * 0.85, 0.1, 0.95),
        since: y, kind: t.exceptional ? "exceptional" : "cohort",
        note: t.exceptional
          ? `An exceptional figure from the ${hj ? "Hitler Youth generation" : "second generation"}: ${describeAlignment(t)}.`
          : `A product of the ${FACTION_LABEL[f]}, ${describeAlignment(t)}.`,
      };
      cands.push({ ruler: r, prefers, w: (fac[f] + 0.04) * Math.pow(t.force, 1.5) * Math.sqrt(t.competence) });
    }
    const total = cands.reduce((a, c) => a + c.w, 0);
    let u = rng() * total;
    let win = cands[cands.length - 1];
    for (const c of cands) { u -= c.w; if (u <= 0) { win = c; break; } }
    const sorted = cands.map((c) => c.w).sort((a, b) => b - a);
    const contested = sorted.length > 1 ? sorted[1] / sorted[0] : 0;
    const shock = 0.05 + 0.2 * contested * rng() + (founderDied ? 0.08 : 0);
    coh = clamp(coh - shock + 0.08 * win.ruler.talent.force, 0, 1);
    X = clamp(X - (founderDied ? 0.12 : 0.05), 0.05, 0.95);
    const prevName = ruler.name;
    ruler = win.ruler;
    rulerPrefers = win.prefers;
    rulers.push(ruler);
    rulerIdx = rulers.length - 1;
    if (win.key) heirAlive[win.key] = false;
    if (win.key === "heydrich") replaceGov(zoneIndex.prot, y, "Heydrich's move to Berlin");
    // A ruler with little regard for loyalty may purge rival heirs.
    const purged: string[] = [];
    for (const h of HEIRS) {
      if (!heirAlive[h.key] || (h.key === "heydrich" && !heydrichAlive)) continue;
      if (rng() < 0.2 * ruler.talent.violence * (1 - ruler.loyalty)) { heirAlive[h.key] = false; purged.push(h.name); if (h.key === "heydrich") heydrichAlive = false; }
    }
    say(y, "regime", `${cause} ${prevName} is succeeded by ${ruler.name}${contested > 0.6 ? " after a bitter struggle" : ""}. ${ruler.note}${purged.length ? ` Rivals purged: ${purged.join(", ")}.` : ""}`);
    // Governors from disfavored factions risk being swept out.
    ZONES.forEach((_z, zi) => {
      const g = govs[zoneGov[zi]];
      if (g.faction === "ally") return;
      if (rng() < 0.35 * (1 - 2 * (rulerPrefers[g.faction] ?? 0))) replaceGov(zi, y, `the new leadership's purge of ${FACTION_LABEL[g.faction as FactionId]} appointees`, false);
    });
  };

  /** Appoints a new governor, drawn from the factions Berlin now favors. */
  function replaceGov(zi: number, y: number, why: string, log = true) {
    const old = govs[zoneGov[zi]];
    let tot = 0;
    const wts = FACTIONS.map((f) => { const w = fac[f] * (1 + 2 * (rulerPrefers[f] ?? 0)); tot += w; return w; });
    let u = rng() * tot;
    let f: FactionId = "ss";
    for (let k = 0; k < FACTIONS.length; k++) { u -= wts[k]; if (u <= 0) { f = FACTIONS[k]; break; } }
    const arch = ARCHETYPES[f][Math.floor(rng() * ARCHETYPES[f].length)];
    const comp = clamp(arch.comp + (bench[f] - 0.55) * 0.5 + 0.2 * (ruler.talent.competence - 0.5) * ruler.merit, 0.1, 0.95);
    const t = govTalent(comp, arch.zeal, 0.02);
    const name = t.exceptional ? `${EXCEPTIONAL_LABEL[topSkill(t)]}, ${arch.name.replace(/^an? /, "")}` : arch.name;
    govs.push({
      name, faction: f, competence: t.competence, zeal: t.violence, since: y, oldFighter: arch.oldFighter, talent: t,
      note: t.exceptional ? `Exceptional: ${describeAlignment(t)}.` : `${FACTION_LABEL[f]} appointee, ${describeAlignment(t)}.`,
    });
    zoneGov[zi] = govs.length - 1;
    if (log) say(y, "governor", `${ZONES[zi].name}: ${old.name} is replaced by ${name} (${why}).`, ZONES[zi].regions[0]);
  }

  for (let t = 0; t < YEARS; t++) {
    const y = START + t;
    const usG = govAt(US_GOVS, y);
    const ukG = govAt(UK_GOVS, y);
    const suG = govAt(SU_GOVS, y);
    const pUS = p.us * usG.mult * (y >= 1947 ? 1.15 : 1);
    const pUK = p.uk * ukG.mult;
    const pSU = p.su * suG.mult;
    if (y === 1951 && p.uk > 0.1) say(y, "sponsor", "Churchill returns to office in Britain. London becomes far more willing to quietly arm Europe's resistance.");

    // 1. Weather: correlated harvest shocks with occasional drought.
    const common = gauss(rng) * 0.06;
    const harvest = Array.from({ length: NZONES }, () => clamp(1 + common + gauss(rng) * 0.07 - (rng() < 0.05 ? 0.3 : 0), 0.5, 1.25));

    // 2. Deaths, assassinations and succession in Berlin
    for (const h of HEIRS) {
      if (!heirAlive[h.key] || h.name === ruler.name) continue;
      if (h.key === "heydrich" && !heydrichAlive) continue;
      if (rng() < mortality(y - h.born, h.health)) { heirAlive[h.key] = false; if (h.key === "heydrich") heydrichAlive = false; }
    }
    if (y === 1942 && heydrichAlive && ruler.name !== "Heydrich" && rng() < 0.1 + 0.4 * p.uk) {
      heydrichAlive = false;
      heirAlive.heydrich = false;
      const zi = zoneIndex.prot;
      const ftk = HEYDRICH_REPLACEMENT;
      const tt = govTalent(ftk.competence, ftk.zeal, 0);
      govs.push({ name: ftk.name, faction: ftk.faction, competence: ftk.competence, zeal: ftk.zeal, since: y, oldFighter: false, talent: tt, note: ftk.note });
      zoneGov[zi] = govs.length - 1;
      for (const i of CELLS_OF_REGION[REGION_INDEX.cze]) cAtro[i] = clamp(cAtro[i] + 0.25, 0, 1);
      say(y, "governor", "Exile Czech agents trained in Britain, despite the peace, assassinate Heydrich in Prague. The reprisals destroy whole villages, as at Lidice. Karl Hermann Frank takes over the Protectorate.", "cze");
    }
    {
      const age = y - ruler.born;
      const plot = (0.004 + 0.05 * fac.wehr * (1 - coh) * (prevLosses > 0 ? 1.6 : 1) * ruler.talent.ideology) * (ruler.kind === "founder" ? 1.2 : 1);
      const foreign = 0.002 * (pUS + 0.3 * pUK);
      let cause = "";
      if (rng() < mortality(age, ruler.kind === "founder" ? HITLER.health : (HEIRS.find((h) => h.name === ruler.name)?.health ?? 1.1))) cause = `${ruler.name} dies at ${age}.`;
      else if (rng() < plot) {
        if (rng() < 0.35) cause = `Army conspirators kill ${ruler.name}.`;
        else {
          fac.wehr *= 0.7; normFac();
          say(y, "regime", `A military plot against ${ruler.name} fails. The SS hunts down the conspirators and the army loses influence.`);
        }
      } else if (rng() < foreign && rng() < 0.3) cause = `${ruler.name} is assassinated by a foreign-backed team.`;
      if (cause) succession(y, cause);
    }
    const T = ruler.talent;

    // 3. Factions, fervor and policy
    const cost = prevLosses * 0.5 + REGIONS.reduce((s, r, i) => s + r.value * regR[i], 0);
    for (const f of FACTIONS) fac[f] += 0.08 * T.force * ((rulerPrefers[f] ?? 0) - fac[f]);
    if (T.ideology > 0.75) { fac.ss += 0.02 * cost; fac.party += 0.01 * cost; }
    else { fac.wehr += 0.03 * cost * (1 - T.ideology); fac.tech += 0.02 * cost * (1 - T.ideology); }
    if (y > 1945 && ruler.faction !== "goring") fac.goring *= 0.93;
    for (const f of FACTIONS) fac[f] *= 1 + 0.04 * gauss(rng);
    normFac();
    for (const f of FACTIONS) bench[f] = clamp(bench[f] + 0.015 * (ruler.merit - 0.45) + 0.01 * (T.admin - 0.5), 0.2, 0.9);
    fervor = clamp(fervor - 0.012 + 0.025 * T.force * T.ideology * T.orator + (prevLosses > 0 && T.ideology > 0.7 ? 0.015 : 0), 0.15, 1);
    const ideo = fac.ss + fac.party;
    const pr = fac.wehr + fac.tech;
    // A forceful pragmatist who rejects violence opens a thaw that can unravel the system (the Gorbachev risk).
    const thaw = ruler.kind === "founder" ? 0 : clamp(T.force * (1 - T.violence) * (1 - T.ideology) * 1.6, 0, 1);
    const brutEff = clamp(p.brutality * (0.75 + 0.25 * fervor) / 0.975 + 0.6 * (ideo - ideo0) + 0.35 * (T.violence - 1) * (ruler.kind === "founder" ? 0 : 1) - 0.4 * thaw, 0, 1);
    const colEff = clamp(p.collab + 0.6 * (pr - prag0) + 0.3 * (1 - T.ideology) - 0.2 * (ideo - ideo0) + 0.1 * (T.diplomat - 0.45), 0, 1);
    let extrEff = clamp(p.extraction + 0.4 * (fac.goring - fac0.goring) + 0.15 * (fac.party - fac0.party) - 0.25 * (fac.tech - fac0.tech), 0, 1);

    // 4. Atomic programs
    const usHas = y >= usBomb;
    if (y === usBomb) {
      X = clamp(X - 0.05, 0.05, 0.95);
      say(y, "nuke", deBomb ? "The United States tests an atomic bomb, years after Germany did." : "The United States tests an atomic bomb. American covert help to European resistance grows bolder.");
    }
    const haveInputs = !lost[REGION_INDEX.cze] && !lost[REGION_INDEX.nor];

    // 5. Strategic resources: where Germany's oil, coal, ore, food and metals come from
    const neutralFear = clamp(0.45 * coh * (0.6 + 0.4 * X) + (deBomb !== null && !usHas ? 0.2 : 0) + 0.1 * (T.diplomat - 0.45), 0, 0.85);
    const supplyRes: Record<ResourceId, number> = { oil: 0, coal: 0, iron: 0, food: 0, metals: 0 };
    for (const k of RES) supplyRes[k] = CORE[k] + (k === "oil" ? Math.min(0.2, 0.012 * t) : 0);
    REGIONS.forEach((r, i) => {
      const rr = REGION_RESOURCES[r.id];
      if (!rr || lost[i]) return;
      const work = (contested[i] ? 0.6 : 1) * (1 - 0.6 * regR[i]) * (1 - 0.5 * regNC[i]) * (r.kind === "ally" ? 0.85 : 0.6 + 0.4 * extrEff);
      for (const k of RES) {
        const v = rr[k];
        if (v) supplyRes[k] += v * work * (k === "food" ? harvest[HARVEST_ZONE[r.id]] : 1);
      }
    });
    for (const [nid, tr] of Object.entries(NEUTRAL_TRADE)) {
      const route = nid === "se" ? (lost[REGION_INDEX.nor] ? 0.6 : 1) : 1;
      for (const k of RES) { const v = tr[k as ResourceId]; if (v) supplyRes[k as ResourceId] += v * (0.4 + 0.6 * neutralFear) * route; }
    }
    let S = 0;
    const ratio: Record<ResourceId, number> = { oil: 0, coal: 0, iron: 0, food: 0, metals: 0 };
    for (const k of RES) { ratio[k] = Math.min(1.25, supplyRes[k] / RESOURCE_NEED[k]); S += RESOURCE_WEIGHT[k] * ratio[k]; }
    S *= 1 + 0.1 * (T.admin - 0.5);
    // A hungrier Germany squeezes the occupied food basket harder.
    const foodPressure = 1 + Math.max(0, 1 - ratio.food);
    extrEff = clamp(extrEff + 0.15 * (foodPressure - 1), 0, 1);

    if (deBomb === null && y >= 1947 && haveInputs && rng() < 0.035 * S * coh * (0.5 + 2 * fac.tech) * (0.7 + 0.6 * T.admin)) {
      deBomb = y;
      X = clamp(X + 0.05, 0.05, 0.95);
      say(y, "nuke", usHas ? "Germany tests its own atomic bomb, using Czech uranium and Norwegian heavy water. A nuclear standoff with the United States settles in." : "Germany tests an atomic bomb first. Outside powers grow far more cautious about arming resistance.");
    }
    const usMult = usHas ? 1.3 : 1;
    const deter = (deBomb !== null && !usHas ? 0.5 : 1) * (1 - 0.3 * (T.diplomat - 0.45));

    // 6. The Soviet rump
    let frontDrain = 0;
    if (rumpAlive) {
      K = clamp(K + 0.035 + 0.025 * pSU + 0.03 * pUS - 0.035 * S * coh - 0.02 * (T.general - 0.4) + gauss(rng) * 0.03, 0, 1);
      frontDrain = 0.12 + 0.25 * K;
      if (K < 0.1 && rng() < 0.35) {
        rumpAlive = false;
        K = 0;
        say(y, "gain", "The Soviet rump state disintegrates. Eastern partisans lose their sponsor and their air bridge.");
      } else if (K > 0.7 && !lost[REGION_INDEX.blr] && rng() < 0.2) {
        for (let i = 0; i < NC; i++) if (REGIONS[CELLS[i].r].sovReach > 0.8) cR[i] = clamp(cR[i] + 0.15 * (0.3 + 0.7 * GROUPS[CELLS[i].g].comm), 0, 1);
        K = clamp(K - 0.3, 0, 1);
        X = clamp(X - 0.04, 0.05, 0.95);
        say(y, "loss", `A rebuilt Red Army under ${suG.name} attacks from beyond the Urals and links up with partisans in Belarus and Ukraine. It is thrown back, but the east is in flames.`);
      }
    }

    // 7. Garrisons, plus local auxiliaries recruited from collaborating groups
    const manpower = TUNE.garScale * (1 - frontDrain) * (0.85 + 0.25 * coh) * (0.55 + 0.45 * Math.min(1, ratio.oil));
    const aux = new Float64Array(NR);
    for (let i = 0; i < NC; i++) aux[CELLS[i].r] += cColAct[i] * CELLS[i].share * cPop[i] * 0.5;
    const wReg = REGIONS.map((r, i) => (regR[i] + 0.3 * regA[i] + 0.04) * r.priority * (1 + 3 * r.value) * (r.kind === "ally" ? 0.25 : r.kind === "puppet" ? 0.6 : 1));
    const wsum = wReg.reduce((a, b) => a + b, 0);
    // Divisions go where a rising flares, including a minority's districts inside an otherwise quiet region.
    const flare = REGIONS.map((r, i) => (r.kind === "ally" ? 0 : Math.max(0, Math.max(regR[i], 0.8 * regTop[i]) - 0.2) * r.priority));
    const fsum = flare.reduce((a, b) => a + b, 0);
    const surge = TUNE.surge * (1 - frontDrain) * (0.6 + 0.4 * coh) * Math.min(1, fsum * 2);
    // Reinforcements arrive within the year and stay after the rising is broken, draining away over several years.
    for (let i = 0; i < NR; i++) {
      const want = fsum > 0 ? (surge * flare[i]) / fsum : 0;
      surgeGar[i] = want > surgeGar[i] ? surgeGar[i] + 0.7 * (want - surgeGar[i]) : surgeGar[i] * 0.85;
    }
    const gar = REGIONS.map((_, i) => (lost[i] ? 0.3 : 1) * ((manpower * wReg[i]) / wsum + surgeGar[i]) + aux[i] * 0.15);
    const heli = y >= 1955 ? clamp((y - 1954) * 0.07 * Math.min(1, S), 0, 0.5) : 0;

    // 8. Information from outside. With Britain at peace, the BBC is muted; America carries most of it.
    const radio = clamp(0.2 + 0.008 * t + (y >= 1955 ? 0.025 * (y - 1955) : 0), 0, 0.9);
    const INFO = radio * clamp(0.2 + 0.55 * pUS + 0.25 * pUK, 0, 1);

    // 9. Labor demand, church war, Generalplan Ost
    const laborNeed = p.labor * (y <= 1945 ? 1 : 0.75);
    if (!churchStarted && y >= 1946) {
      const byName: Record<string, number> = { Bormann: 2.5, Himmler: 2, Goebbels: 1.5, Hitler: 1.2, Heydrich: 1.5, "Göring": 0.5, Speer: 0.2 };
      const k = byName[ruler.name] ?? 1.5 * T.ideology * T.ideology;
      if (rng() < 0.05 * k * ideo * fervor) {
        churchStarted = true;
        church = 1;
        coh = clamp(coh - 0.05, 0, 1);
        say(y, "church", "With the war won, Berlin turns on the churches. Clergy are arrested, schools and monasteries closed, Catholic and Orthodox hierarchies broken up. Devout peoples, including Germany's own Catholics and its allies, are shaken.");
      }
    }
    if (church > 0) church = clamp(church - (T.ideology < 0.5 ? 0.15 : 0.04), 0, 1);
    const gpoBase = clamp((fac.ss + 0.6 * fac.party - 0.3) * 1.6, 0, 1) * T.ideology * Math.sqrt(fervor) * (1 - 0.5 * laborNeed);
    const gpo = gpoBase * (y >= 1946 ? 1 : 0.3);
    settlers = clamp(settlers + 0.02 * coh * fac.ss - 0.005, 0, 1);
    if (!gpoLogged && gpo > 0.35 && y >= 1946) {
      gpoLogged = true;
      say(y, "genocide", "Generalplan Ost begins in earnest: mass expulsions and killings in Poland, Belarus, Ukraine and the Baltic, to clear land for German settlers. Its pace is held back by how few Germans are willing to move east and by the Reich's need for Slavic labor.");
    }
    const settlerAvail = clamp(0.3 + settlers, 0, 1);

    // 10. The murder of Europe's Jews: in nearly every plausible victory scenario, the variable is the method
    if (y === 1942) say(y, "genocide", "The murder of Europe's Jews, begun with mass shootings in the occupied Soviet Union in 1941, is extended across the continent. The model does not treat the victims as a resistance movement. Their destruction is treated as a fact of every run. What varies is how quickly their neighbors see it.");
    REGIONS.forEach((r, i) => {
      const js = JEWISH_SHARE[r.id] ?? 0;
      if (!js) return;
      if (r.kind === "ally" && r.id !== "mda") {
        const indep = ALLY_INDEPENDENCE[r.id] ?? 0.5;
        if (!allyDeported[r.id] && y >= 1942 && rng() < 0.08 * ideo * (1.5 - indep) * (1 - 0.5 * thaw)) {
          allyDeported[r.id] = true;
          say(y, "genocide", `${r.name}'s government yields to German pressure and hands over its Jews for deportation.`, r.id);
        }
        if (allyDeported[r.id]) jewGone[i] = clamp(jewGone[i] + 0.4, 0, 1);
      } else {
        const start = r.sovReach > 0.4 ? 1941 : 1942;
        if (y >= start) jewGone[i] = clamp(jewGone[i] + 0.35 * (0.5 + fac.ss), 0, 1);
      }
    });

    // 11. Cells: identity-group psychology inside each region
    let newLosses = 0;
    let newLossVal = 0;
    let newGains = 0;
    let newGainVal = 0;
    const colActNext = new Float64Array(NC);
    for (let r = 0; r < NR; r++) {
      const reg = REGIONS[r];
      const ally = reg.kind === "ally";
      const gov = govOfRegion(r);
      const gt = gov.talent;
      const zeal = ally ? 0.3 : gov.zeal;
      const comp = gov.competence;
      const cs = CELLS_OF_REGION[r];
      const allyKey = allyOfRegion[r];
      // How visible the killing is to neighbors: a threshold, not a slope. Murder in secret is possible; empty streets are not.
      let missing = (JEWISH_SHARE[reg.id] ?? 0) * jewGone[r];
      for (let k = 0; k < cs.length; k++) missing += CELLS[cs[k]].share * (1 - cPop[cs[k]]);
      const visible = Math.pow(clamp(missing * 4, 0, 1), 1.5);
      const hz = harvest[HARVEST_ZONE[reg.id]];

      for (const i of cs) {
        const c = CELLS[i];
        const g = GROUPS[c.g];
        if (g.id === "vdt") {
          cD[i] = 0.05; cA[i] = 0; cR[i] = 0;
          colActNext[i] = clamp(0.6 + 0.3 * colEff, 0, 1);
          if (gpo > 0 && ["pol", "ltu", "lva", "est", "blr", "ukr", "cze"].includes(reg.id)) cPop[i] = Math.min(6, cPop[i] * (1 + 0.06 * gpo * settlerAvail));
          recordCell(t, i, 0, 0, 0, 0);
          continue;
        }
        const titular = reg.titular === g.id;
        // A puppet that serves Berlin wholeheartedly earns its own people little national credit.
        const legit = titular && allyKey ? 1 - allyCommit[allyKey] : 1;
        const leaderIdx = groupLeader[c.g];
        const L = leaderIdx >= 0 ? resLeaders[leaderIdx].talent : null;
        const brutLocal = clamp((ally ? brutEff * 0.25 : brutEff + (zeal - 0.5) * 0.4) * (titular ? 0.75 : 1), 0, 1);
        const indisc = brutLocal * (1 - 0.6 * comp);
        const colLocal = clamp(colEff + 0.15 * comp * (1 - zeal) + 0.1 * (gt.diplomat - 0.4) + (titular ? 0.25 * legit : 0), 0, 1);

        // Victimization by rival groups' collaborators: divide and rule turns neighbors into enforcers.
        let vict = 0;
        for (const [j, k] of RIVALS_OF_CELL[i]) vict += k * Math.max(cColAct[j], cR[j]) * Math.min(1, CELLS[j].share * cPop[j] * 4);
        vict = clamp(vict, 0, 1);

        // Food: German quotas against the harvest. A bad year turns quotas into famine.
        const hungerPlan = y <= 1943 && g.bm >= 0.95 ? 0.3 * fac.ss * p.extraction : 0;
        const hunger = clamp(extrEff * (0.2 + 0.8 * g.bm) * foodPressure * (ally ? 0.3 : 1) - (hz - 1) * 1.5 + hungerPlan - 0.25, 0, 1);
        if (hunger > 0.5) {
          cPop[i] *= 1 - 0.04 * (hunger - 0.4);
          if (y - logged[i].famine > 8) {
            logged[i].famine = y;
            say(y, "famine", `${reg.name}: famine among ${g.name}${hz < 0.85 ? " after a failed harvest" : ""}, as German requisitions take food first.`, reg.id);
          }
        }

        // Forced-labor round-ups push young men into hiding, and hiding into the forests.
        const roundup = clamp(laborNeed * (0.3 + 0.7 * g.bm) * (ally ? 0.1 : reg.kind === "puppet" ? 0.5 : 1) * (1 - 0.4 * colLocal), 0, 1);

        // Generalplan Ost depopulation for the peoples slated for removal.
        const gtarget = GPO_TARGET[g.id] ?? 0;
        let gpoHit = 0;
        if (gtarget > 0 && !lost[r] && !ally && reg.kind !== "puppet") {
          gpoHit = 0.035 * gpo * gtarget * settlerAvail;
          cPop[i] *= 1 - gpoHit;
          if (gpoHit > 0.01 && !regionLogged[r].gpo) {
            regionLogged[r].gpo = true;
            say(y, "genocide", `${reg.name}: ${g.name} are expelled and killed to make room for German settlers.`, reg.id);
          }
        }

        // Knowledge of genocide: mostly hidden until neighbors visibly vanish, then impossible to hide.
        const leak = INFO * 0.4 * clamp((y - 1942) / 10, 0, 1);
        const ownLoss = clamp((1 - cPop[i]) * 4, 0, 1);
        cAware[i] = Math.max(cAware[i], cAware[i] + 0.3 * (clamp(0.7 * visible + ownLoss + leak, 0, 1) - cAware[i]));
        const aware = cAware[i];
        const marked = g.bm >= 0.95 ? 1 : 0;

        // Outside supply, sponsor by sponsor
        const westIdeo = 1 - g.comm * (1 - p.westPrag);
        const exileReach = reg.westReach;
        let sUS = pUS * usMult * (p.aff.us[g.id] ?? 0) * reg.westReach * westIdeo * deter;
        let sUK = pUK * (p.aff.uk[g.id] ?? 0) * reg.westReach * westIdeo * deter;
        let sEX = g.exile * Math.max(pUS * usMult, pUK) * exileReach * 0.6 * deter;
        let sSU = rumpAlive ? pSU * (0.4 + 0.6 * K) * (p.aff.su[g.id] ?? 0) * reg.sovReach * (0.2 + 0.8 * g.comm) : 0;
        let sNE = 0;
        for (const [nid, w] of reg.conduits) {
          const nn = NEUTRALS.find((n) => n.id === nid)!;
          sNE += w * nn.courage * (p.neutral / 0.4) * (1 - neutralFear) * 0.35;
        }
        if (L) { const m = 1 + 0.6 * L.diplomat * L.force; sUS *= m; sUK *= m; sEX *= m; sSU *= m; sNE *= m; }
        const raw = sUS + sUK + sEX + sSU + sNE;
        const supply = clamp(raw, 0, 1) * (1 - clamp(0.2 * S, 0, 0.45));
        const scale = raw > 0 ? supply / raw : 0;
        sUS *= scale; sUK *= scale; sEX *= scale; sSU *= scale; sNE *= scale;

        // Private dissent: what people really think
        if (y >= 1955) cGen[i] += g.bm < 0.5 && brutLocal < 0.6 ? -0.004 : g.bm > 0.7 && brutLocal > 0.6 ? 0.003 : 0;
        const allyLoad = (ally ? frontDrain * 0.3 + extrEff * 0.1 : 0) + (allyKey ? allyShock[allyKey] * 0.3 : 0);
        const dTarget = TUNE.dBase + g.ident * 0.38 + brutLocal * g.bm * 0.38 + extrEff * 0.12 * (0.4 + 0.6 * g.bm)
          + hunger * 0.3 + roundup * 0.18 + cAtro[i] * 0.25 + vict * 0.35 + church * g.rel * 0.2 + aware * (0.05 + 0.1 * marked)
          - colLocal * (0.1 + 0.35 * g.collabP) - X * 0.15 * (1 - g.bm) + cGen[i] - (titular ? 0.15 * legit : 0) + allyLoad
          - 0.05 * (gt.orator - 0.4) * (ally ? 0 : 1);
        // Crisis compresses time: massacres, famine and expulsions change minds in months, not years.
        const shock = clamp(Math.max(vict, hunger, cAtro[i], gpoHit * 10), 0, 1);
        cD[i] += (0.25 + 0.5 * shock) * (clamp(dTarget, 0, 1) - cD[i]);

        // Fear and perceived odds decide whether private dissent becomes public defiance (Kuran; Granovetter).
        const garD = gar[r];
        const fear = clamp(0.05 + brutLocal * g.bm * 0.4 + Math.min(1, garD * 6) * 0.3 - cR[i] * 0.5, 0, 1) * (1 - 0.5 * thaw);
        const odds = clamp(cR[i] * 0.7 + (1 - X) * 0.5 + supply * 0.3 + INFO * 0.15 * regA[r] + 0.2 * thaw, 0, 1);
        // Indiscriminate violence removes the safety of staying passive (Kalyvas).
        const desperation = clamp(cAtro[i] * TUNE.despAtro + indisc * g.bm * TUNE.despBrut + hunger * 0.25 + vict * 0.3
          + aware * marked * 0.2 + roundup * 0.15 + gpoHit * 4, 0, 1) * (0.35 + 0.65 * c.terrain) * (cR[i] > 0.03 ? 1 : 0.4);
        const theta = g.theta - (L ? 0.12 * L.orator * L.force : 0);
        const aTarget = cD[i] * TUNE.aMax * sigmoid((odds + desperation - theta - TUNE.fearW * fear + TUNE.aOffset) / 0.08);
        const prevA = cA[i];
        cA[i] = clamp(cA[i] + (0.35 + 0.5 * desperation) * (aTarget - cA[i]), 0, 1);
        if (!ally && !logged[i].cascade && cA[i] - prevA > 0.12 && cA[i] > 0.3) {
          logged[i].cascade = true;
          say(y, "psych", `${reg.name}: years of outward compliance among ${g.name} break within months. The private hatred was always there; once the Reich looked beatable, people stopped hiding it.`, reg.id);
        }

        // Non-cooperation: strikes, refusal, go-slows. A nonviolent leader turns defiance into this rather than arms.
        const nonviol = L ? clamp((0.35 - L.violence) / 0.35, 0, 1) * L.force : 0;
        cNC[i] = clamp(cA[i] * (0.25 + 0.65 * nonviol), 0, 1);
        if (nonviol > 0.3 && cNC[i] > 0.2) {
          const repress = brutLocal * T.ideology;
          if (repress > 0.5) {
            for (const j of cs) cAtro[j] = clamp(cAtro[j] + 0.06 * cNC[i], 0, 1);
            if (rng() < 0.2) endLeader(c.g, y, `killed when the authorities answer mass non-cooperation with massacres`);
          } else if (!regionLogged[r].nc) {
            regionLogged[r].nc = true;
            say(y, "psych", `${reg.name}: a nonviolent campaign of strikes and mass refusal led by ${resLeaders[groupLeader[c.g]]?.name ?? "a movement"} wins concessions from an occupier unwilling to shoot crowds.`, reg.id);
          }
        }

        // Communist-nationalist infighting inside the group
        const twoSponsors = sSU > 0.03 && sUS + sUK + sEX > 0.03;
        const infight = g.polar * 2 * Math.min(g.comm, 1 - g.comm) * clamp(cR[i] * 2, 0, 1) * (twoSponsors ? 1 : 0.6) * (L ? 1 - 0.7 * L.diplomat * L.force : 1);
        if (!ally && !logged[i].infight && infight > 0.3 && cR[i] > 0.25) {
          logged[i].infight = true;
          say(y, "faction", `${reg.name}: communist and nationalist ${g.name} turn their guns on each other${twoSponsors ? ", each armed by a different sponsor" : ""}. German security services play one off against the other.`, reg.id);
        }
        if (!logged[i].snub && rumpAlive && reg.sovReach >= 0.5 && (p.aff.su[g.id] ?? 0) < 0.35 && cR[i] > 0.2) {
          logged[i].snub = true;
          say(y, "sponsor", `${reg.name}: the Soviet rump state could reach the ${g.name} but refuses to arm them, seeing a future enemy.`, reg.id);
        }
        if (!logged[i].labor && !ally && roundup * cD[i] > 0.3 && c.terrain > 0.3) {
          logged[i].labor = true;
          say(y, "labor", `${reg.name}: labor round-ups send young ${g.name} into hiding. Many end up with the armed bands in the hills and forests.`, reg.id);
        }

        if (!ally) {
          // Without a supplier, fighters arm themselves with captured weapons, with what defecting police and
          // militia bring over (Ukrainian auxiliaries joining the UPA in 1943), and with the stocks dissolved armies
          // left behind in 1939–41, which run down over a decade. Reprisals can burn villages; they cannot undo defections.
          const auxArms = 0.5 * g.collabP * clamp((cD[i] - 0.4) / 0.4, 0, 1);
          const caches = 0.3 * (ARMS_CACHE[reg.id] ?? 0) * Math.max(0, 1 - t / 10);
          const armsCap = Math.min(1, cCap[i] * (0.42 + 0.58 * Math.min(1, supply * 2.5)) + auxArms + caches);
          const gen = L ? 1 + 0.5 * L.general * L.force : 1;
          // Exile-led movements wait for a liberator before fighting in the open (the Home Army, the Chetniks, de Gaulle's
          // networks), unless one is near or the Reich looks beatable. Communist-led ones do not wait.
          const liberator = (rumpAlive && K > 0.6 && reg.sovReach >= 0.4) || X < 0.3 || coh < 0.4;
          const wait = liberator ? 0 : g.exile * (1 - g.comm);
          const growth = (0.55 * cR[i] * (1 - cR[i] / armsCap) * (cA[i] - TUNE.growthThr) * (0.6 + 0.6 * c.terrain) * (1 + 0.3 * cLearn[i]) * gen
            + 0.1 * supply * cA[i] + 0.015 * cA[i] + 0.05 * roundup * cD[i] * c.terrain
            + TUNE.rise * (desperation * cA[i] + Math.max(0, cA[i] - theta)) * Math.max(0, 1 - cR[i] / armsCap)) * (1 - 0.7 * nonviol) * (1 - wait) - 0.06 * infight * cR[i];
          const supp = garD * TUNE.suppW * (1 - 0.55 * c.terrain * (1 - heli)) * (0.75 + 0.5 * brutLocal) * (0.6 + 0.8 * comp)
            * (1 + 0.3 * (gt.general - 0.4)) * (1 + 0.4 * learnG) * (1 + 0.15 * (T.general - 0.4)) * Math.min(1, cR[i] * 4) * (1 - 0.5 * supply)
            * (L ? 1 - 0.3 * L.general * L.force : 1)
            // A rising that holds open territory can be hit by conventional divisions, as the Užice republic was in November 1941.
            * (1 + TUNE.crush * Math.max(0, cR[i] - 0.4));
          cAtro[i] = clamp(cAtro[i] + indisc * g.bm * (cR[i] > 0.1 ? 0.07 : 0.025) - 0.03, 0, 1);
          if (cR[i] > 0.12) cCap[i] = clamp(cCap[i] - indisc * g.bm * 0.035 * (1 - supply) * (1 - c.terrain * 0.4), 0.25, 1);
          else cCap[i] = clamp(cCap[i] + 0.01, 0.25, 1);
          cR[i] = clamp(cR[i] + growth - supp + gauss(rng) * 0.018, 0, 1);
          cLearn[i] = clamp(cLearn[i] + (cR[i] > 0.1 ? 0.03 : -0.02), 0, 1);
          if (L && L.violence > 0.75) for (const [j, k] of RIVALS_OF_CELL[i]) cAtro[j] = clamp(cAtro[j] + 0.03 * k * cR[i], 0, 1);
        } else if (!lost[r]) {
          cR[i] = clamp(cR[i] + 0.1 * (cA[i] * 0.6 - cR[i]) + gauss(rng) * 0.01, 0, 1);
        }
        // A puppet regime's own enforcers (the Ustaše, the Hlinka Guard) act as hard as the regime is committed, whatever the
        // population thinks, unless a competent, unzealous German envoy reins them in because they feed the uprising.
        const restraint = gov.faction === "ally" ? 0 : gov.competence * (1 - gov.zeal);
        colActNext[i] = Math.max(titular && allyKey ? allyCommit[allyKey] * g.collabP * (1 - restraint) : 0, clamp(colLocal * g.collabP * (1 - 0.6 * cD[i]) * (0.5 + 0.5 * X), 0, 1));
        if (cR[i] > groupPeak[c.g]) groupPeak[c.g] = cR[i];
        recordCell(t, i, sUS, sUK, sEX, sSU, sNE, fear, vict, hunger);
      }

      // Region aggregates, weighted by surviving population
      let wt = 0; let rr = 0; let aa = 0; let nn = 0;
      cs.forEach((i, k) => {
        if (GROUPS[CELLS[i].g].id === "vdt") return;
        const w = regW[r][k] * cPop[i];
        wt += w; rr += w * cR[i]; aa += w * cA[i]; nn += w * cNC[i];
      });
      regR[r] = wt > 0 ? rr / wt : 0;
      regA[r] = wt > 0 ? aa / wt : 0;
      regNC[r] = wt > 0 ? nn / wt : 0;

      // Allied governments and puppet armies switch sides when loyalty is low and there is an opening: a strong Soviet
      // rump nearby, a regime coming apart, an outside offer once the Reich looks beatable, a gifted diplomat in
      // charge, or a neighbor that has just switched during a Soviet push (Romania in August 1944, then Slovakia and Bulgaria).
      const defects = (defiance: number): boolean => {
        const majorRel = cs.reduce((m, i) => Math.max(m, GROUPS[CELLS[i].g].rel), 0);
        const loyalty = 0.15 + X * 0.5 + coh * 0.25 + allyCommit[allyKey] * 0.25 - defiance * 0.6 - church * majorRel * 0.1 - allyShock[allyKey] + 0.1 * (T.diplomat - 0.45);
        let sup = 0;
        for (const i of cs) sup = Math.max(sup, cellRec[(t * NC + i) * NCF + CF.S_US] + cellRec[(t * NC + i) * NCF + CF.S_UK] + cellRec[(t * NC + i) * NCF + CF.S_SU]);
        const opening = (sup > 0.12 && (X < 0.4 || coh < 0.55)) || coh < 0.38 || (rumpAlive && K > 0.5 && reg.sovReach >= 0.4)
          || allyDiplomat[allyKey] > 0.8 || (y - lastDefection <= 1 && rumpAlive && K > 0.35 && reg.sovReach >= 0.3);
        return loyalty < 0.3 && opening;
      };

      if (!ally) {
        // A puppet's own army can turn on the Germans, as the Slovak army did in 1944: a defection, not a guerrilla war.
        const tit = reg.kind === "puppet" && allyKey && !lost[r] ? cs.filter((i) => GROUPS[CELLS[i].g].id === reg.titular) : [];
        if (tit.length && defects(cA[tit[0]])) {
          lastDefection = y;
          for (const i of tit) cR[i] = Math.max(cR[i], 0.3 + 0.4 * cD[i]);
          regR[r] = cs.reduce((a, i, k) => a + (GROUPS[CELLS[i].g].id === "vdt" ? 0 : regW[r][k] * cPop[i] * cR[i]), 0) / Math.max(1e-6, cs.reduce((a, i, k) => a + (GROUPS[CELLS[i].g].id === "vdt" ? 0 : regW[r][k] * cPop[i]), 0));
          lost[r] = true; lostByResistance[r] = true; newLosses++; newLossVal += reg.value * (contested[r] ? 0.5 : 1);
          contested[r] = false; streak[r] = 0;
          say(y, "loss", `${reg.name}: the army of ${reg.regime} rises against the Germans, and much of the country goes with it.`, reg.id);
        }
        streak[r] = regR[r] >= 0.6 ? streak[r] + 1 : 0;
        // A minority insurgency cannot take the whole region, but it can hold its own districts (the Serb Krajina, the Bosnian mountains).
        let topR = 0; let topCell = -1;
        for (const i of cs) if (GROUPS[CELLS[i].g].id !== "vdt" && CELLS[i].share >= 0.15 && CELLS[i].share < 0.5 && cR[i] > topR) { topR = cR[i]; topCell = i; }
        cStreak[r] = topR >= 0.6 ? cStreak[r] + 1 : 0;
        regTop[r] = topR;
        if (lost[r] && lastDefection === y && tit.length) {
          // Just defected: the uprising holds for now.
        } else if (!lost[r] && streak[r] >= 2) {
          lost[r] = true; lostByResistance[r] = true; newLosses++; newLossVal += reg.value * (contested[r] ? 0.5 : 1);
          contested[r] = false;
          say(y, "loss", `${reg.name}: resistance forces now hold and govern territory. Germany has effectively lost the region.`, reg.id);
        } else if (lost[r] && regR[r] < 0.35) {
          lost[r] = false; newGains++; newGainVal += reg.value;
          say(y, "gain", `${reg.name}: German forces retake the region after a long counterinsurgency${brutEff > 0.7 ? " of mass reprisals and deportations" : ""}.`, reg.id);
        } else if (!lost[r] && !contested[r] && cStreak[r] >= 2) {
          contested[r] = true; contestedEver[r] = true; newLosses++; newLossVal += reg.value * 0.5;
          say(y, "loss", `${reg.name}: ${GROUPS[CELLS[topCell].g].name} insurgents hold whole districts. The region is contested; German writ ends at the edge of the towns.`, reg.id);
        } else if (contested[r] && topR < 0.35) {
          contested[r] = false; newGains++; newGainVal += reg.value * 0.5;
          say(y, "gain", `${reg.name}: German and auxiliary forces clear the insurgent districts.`, reg.id);
        }
      } else if (!lost[r]) {
        if (defects(regA[r])) {
          lastDefection = y;
          lost[r] = true; lostByResistance[r] = true; newLosses++; newLossVal += reg.value;
          // The national army turns on the German garrisons: the allied people is now armed against the Reich.
          for (const i of cs) if (GROUPS[CELLS[i].g].id !== "vdt") cR[i] = Math.max(cR[i], 0.3 + 0.4 * cD[i]);
          say(y, "loss", `${reg.name} breaks with Germany. Its rulers decide the Reich is no longer the winning side, switch allegiance and turn their army on the German garrisons.`, reg.id);
        }
      }
    }
    cColAct.set(colActNext);

    // 12. Allied rulers age and die; successors are less committed, occasionally exceptional
    for (const a of ALLY_RULERS) {
      allyShock[a.key] *= 0.5;
      if (a.regions.every((rid) => lost[REGION_INDEX[rid]])) continue;
      if (rng() < mortality(y - allyBorn[a.key], allyHealth[a.key])) {
        const tal = drawTalent(rng, { comp: 0.55, violence: 0.5, ideology: allyCommit[a.key] * 0.8 }, 0.03);
        const old = govs[allyGov[a.key]].name;
        const name = tal.exceptional ? `${EXCEPTIONAL_LABEL[topSkill(tal)]} succeeding ${old}` : `a successor to ${old}`;
        allyCommit[a.key] = tal.exceptional ? tal.ideology : allyCommit[a.key] * (0.4 + 0.5 * rng());
        allyDiplomat[a.key] = tal.diplomat;
        allyShock[a.key] = 0.15;
        allyBorn[a.key] = y - 50 - Math.round(10 * rng());
        allyHealth[a.key] = 1;
        govs.push({ name, faction: "ally", competence: tal.competence, zeal: allyCommit[a.key], since: y, oldFighter: false, talent: tal, note: tal.exceptional ? `Exceptional: ${describeAlignment(tal)}.` : "" });
        allyGov[a.key] = govs.length - 1;
        say(y, "ally", `${old} is gone. Power in ${REGIONS[REGION_INDEX[a.regions[0]]].name} passes to ${name}, ${allyCommit[a.key] < 0.4 ? "who is far less committed to the German alliance" : "who keeps faith with Berlin"}.`, a.regions[0]);
      }
    }

    // 13. Governors: assassination, and replacement for failure, unless protected by the leadership
    ZONES.forEach((z, zi) => {
      const gi = zoneGov[zi];
      const g = govs[gi];
      let zr = 0; let zs = 0; let zl = 0;
      for (const rid of z.regions) {
        const r = REGION_INDEX[rid];
        zr += regR[r];
        for (const i of CELLS_OF_REGION[r]) zs = Math.max(zs, cellRec[(t * NC + i) * NCF + CF.S_UK] + cellRec[(t * NC + i) * NCF + CF.S_EX] + cellRec[(t * NC + i) * NCF + CF.S_US]);
        if (lost[r]) zl++;
      }
      zr /= z.regions.length;
      if (rng() < 0.03 * zr * (0.3 + 2 * zs) * (1 - 0.5 * g.competence)) {
        for (const rid of z.regions) for (const i of CELLS_OF_REGION[REGION_INDEX[rid]]) cAtro[i] = clamp(cAtro[i] + 0.15 * brutEff, 0, 1);
        say(y, "governor", `${z.name}: the resistance assassinates ${g.name}. Reprisals follow: hostages shot, villages burned.`, z.regions[0]);
        replaceGov(zi, y, "his predecessor's assassination");
        zoneR[zi] = zr;
        return;
      }
      const failure = Math.max(0, zr - zoneR[zi]) * 3 + zr * 0.3 + zl * 0.5;
      const protection = clamp(ruler.loyalty * (g.oldFighter ? 0.9 : 0.4) + (rulerPrefers[g.faction as FactionId] ?? 0) * 0.5, 0, 0.95);
      const pFire = clamp((failure - 0.08) * 2 * (0.3 + ruler.merit) * (1 - protection), 0, 0.8) + 0.02;
      if (y > START && rng() < pFire) replaceGov(zi, y, failure > 0.2 ? "failure to hold the region" : "routine rotation");
      else if (failure > 0.3 && protection > 0.5 && !protectedLogged.has(gi)) {
        protectedLogged.add(gi);
        say(y, "governor", `${z.name}: the region is slipping, but ${g.name} keeps his post. ${ruler.name} protects his own.`, z.regions[0]);
      }
      zoneR[zi] = zr;
    });

    // 14. Exceptional resistance leaders emerge from crisis, and die
    for (let g = 0; g < NG; g++) {
      if (GROUPS[g].id === "vdt") continue;
      const li = groupLeader[g];
      let maxA = 0; let maxR = 0; let regionName = "";
      for (let i = 0; i < NC; i++) if (CELLS[i].g === g) { if (cA[i] > maxA) { maxA = cA[i]; regionName = REGIONS[CELLS[i].r].name; } maxR = Math.max(maxR, cR[i]); }
      if (li < 0) {
        if (rng() < 0.0003 + 0.0015 * maxA) {
          const tal = drawTalent(rng, { comp: 0.7, violence: 0.5, ideology: 0.5 }, 1);
          const nonv = tal.violence < 0.25;
          const name = `${EXCEPTIONAL_LABEL[topSkill(tal)]} among the ${GROUPS[g].name}`;
          resLeaders.push({ group: GROUPS[g].id, name, talent: tal, since: y, until: null, fate: "" });
          groupLeader[g] = resLeaders.length - 1;
          say(y, "psych", `${regionName}: ${name} emerges at the head of the resistance, ${describeAlignment(tal)}.${nonv ? " The movement turns to mass nonviolent refusal." : ""}`, REGIONS[CELLS.find((c) => c.g === g)!.r].id);
        }
      } else if (rng() < 0.04 + 0.12 * maxR * brutEff * (1 - resLeaders[li].talent.general * 0.5)) {
        endLeader(g, y, "killed by the security services");
      }
    }

    // 15. Cohesion, the home front, and expectations
    // Losses hurt in proportion to what they are worth: Montenegro is not France.
    const lostVal = REGIONS.reduce((s, r, i) => s + (lost[i] ? r.value : contested[i] ? 0.5 * r.value : 0), 0);
    const homeFront = 0.12 * (ratio.food - 1) + 0.06 * (S - 1);
    const cohTarget = 0.78 + homeFront + 0.1 * (fervor - 0.7) + 0.04 * (T.orator - 0.5);
    coh = clamp(coh + 0.035 * (cohTarget - coh) - newLosses * 0.015 - newLossVal * 0.5 + newGains * 0.01 + newGainVal * 0.2 - lostVal * 0.05 - 0.03 * thaw + gauss(rng) * 0.015, 0, 1);
    const xCeil = 0.95 - 0.3 * INFO;
    X = clamp(X + (newLosses === 0 ? 0.03 * (xCeil - X) : 0) - newLosses * 0.02 - newLossVal * 0.5 + newGains * 0.01 + newGainVal * 0.2 - 0.04 * thaw, 0.05, 0.95);
    learnG = clamp(learnG + 0.02 * (regR.reduce((n, v) => n + (v > 0.2 ? 1 : 0), 0) / NR) * (0.5 + T.competence), 0, 1);
    prevLosses = newLosses;

    // 16. War with the US, only while the US alone holds the bomb
    if (usHas && deBomb === null && !usWar && rng() < (0.004 * brutEff + 0.02 * pUS * brutEff) * (1 - 0.4 * (T.diplomat - 0.45))) {
      usWar = true;
      say(y, "regime", `A crisis over atrocities and covert arms shipments escalates into war with the United States under ${usG.name}, which holds an atomic monopoly.`);
    }

    let control = 0;
    REGIONS.forEach((r, i) => { control += r.value * (lost[i] ? 0 : (contested[i] ? 0.5 : 1) * (1 - regR[i]) * (1 - 0.4 * regNC[i])); });
    for (let r = 0; r < NR; r++) {
      const o = (t * NR + r) * NRF;
      regRec[o + RF.LOST] = lost[r] ? 1 : 0;
      regRec[o + RF.R] = regR[r];
      regRec[o + RF.A] = regA[r];
      regRec[o + RF.GOV] = govIdxOfRegion(r);
      regRec[o + RF.GAR] = gar[r];
      regRec[o + RF.CONT] = contested[r] ? 1 : 0;
    }
    const gg = t * NGF;
    glob[gg + GF.S] = S; glob[gg + GF.COH] = coh; glob[gg + GF.X] = X; glob[gg + GF.CTRL] = control * 100;
    glob[gg + GF.K] = rumpAlive ? K : -1; glob[gg + GF.ENDED] = 0; glob[gg + GF.USB] = usHas ? 1 : 0; glob[gg + GF.DEB] = deBomb !== null ? 1 : 0;
    glob[gg + GF.BRUT] = brutEff; glob[gg + GF.COL] = colEff; glob[gg + GF.EXTR] = extrEff;
    glob[gg + GF.SS] = fac.ss; glob[gg + GF.PARTY] = fac.party; glob[gg + GF.WEHR] = fac.wehr; glob[gg + GF.TECH] = fac.tech; glob[gg + GF.GOR] = fac.goring;
    glob[gg + GF.FERV] = fervor; glob[gg + GF.INFO] = INFO; glob[gg + GF.OIL] = ratio.oil; glob[gg + GF.FOOD] = ratio.food;
    glob[gg + GF.CHURCH] = church; glob[gg + GF.GPO] = gpo; glob[gg + GF.LEAD] = rulerIdx;

    if (usWar) {
      outcome = "uswar"; endYear = y;
      say(y, "end", "Germany cannot fight an atomic power. The regime capitulates within the year.");
    } else if (coh < 0.12) {
      outcome = "collapse"; endYear = y;
      say(y, "end", thaw > 0.3
        ? "The thaw becomes a collapse. Once fear lifts, the occupied peoples, the allies and finally the German elites stop pretending, and the empire comes apart."
        : "Regime cohesion collapses. Factions, generals and regional bosses fight over the wreckage, and the occupied countries break free.");
    }
    if (outcome) { lastT = t; break; }
  }

  function recordCell(t: number, i: number, sUS: number, sUK: number, sEX: number, sSU: number, sNE = 0, fear = 0, vict = 0, hunger = 0) {
    const o = (t * NC + i) * NCF;
    cellRec[o + CF.R] = cR[i]; cellRec[o + CF.A] = cA[i]; cellRec[o + CF.D] = cD[i]; cellRec[o + CF.FEAR] = fear;
    cellRec[o + CF.VICT] = vict; cellRec[o + CF.S_US] = sUS; cellRec[o + CF.S_UK] = sUK; cellRec[o + CF.S_EX] = sEX;
    cellRec[o + CF.S_SU] = sSU; cellRec[o + CF.S_NE] = sNE; cellRec[o + CF.HUNG] = hunger; cellRec[o + CF.POP] = cPop[i];
    cellRec[o + CF.NC] = cNC[i]; cellRec[o + CF.AWARE] = cAware[i];
  }

  function endLeader(g: number, y: number, fate: string) {
    const li = groupLeader[g];
    if (li < 0) return;
    resLeaders[li].until = y;
    resLeaders[li].fate = fate;
    groupLeader[g] = -1;
    say(y, "psych", `${resLeaders[li].name} is ${fate}.`);
  }

  // After an early end, the empire is gone: carry the final state forward with every region freed.
  for (let t = lastT + 1; t < YEARS; t++) {
    cellRec.copyWithin(t * NC * NCF, lastT * NC * NCF, (lastT + 1) * NC * NCF);
    regRec.copyWithin(t * NR * NRF, lastT * NR * NRF, (lastT + 1) * NR * NRF);
    for (let r = 0; r < NR; r++) { regRec[(t * NR + r) * NRF + RF.LOST] = 1; regRec[(t * NR + r) * NRF + RF.CONT] = 0; }
    glob.copyWithin(t * NGF, lastT * NGF, (lastT + 1) * NGF);
    const gd = t * NGF;
    glob[gd + GF.COH] = 0; glob[gd + GF.X] = 0; glob[gd + GF.CTRL] = 0; glob[gd + GF.ENDED] = 1;
    glob[gd + GF.USB] = START + t >= usBomb ? 1 : 0;
    glob[gd + GF.LEAD] = -1;
  }

  if (!outcome) {
    let heldVal = 0;
    REGIONS.forEach((r, i) => { if (!lost[i] && regR[i] < 0.5) heldVal += r.value * (contested[i] ? 0.5 : 1); });
    outcome = heldVal >= 0.8 && coh > 0.4 ? "hegemony" : heldVal >= 0.5 ? "fraying" : "rollback";
    const text: Record<string, string> = {
      hegemony: "The Reich still holds Europe from the Atlantic to the Urals. Resistance survives only in pockets.",
      fraying: "Germany still rules most of Europe, but some regions have broken away and garrisons are stretched thin.",
      rollback: "German control has been rolled back across much of Europe. What remains is a besieged core.",
    };
    say(END, "end", text[outcome]);
  }
  for (const l of resLeaders) if (l.until === null) l.fate = "still leading at the end of the run";

  return {
    id, outcome, endYear, cells: cellRec, regions: regRec, glob, govs, rulers, resLeaders, events,
    lostByResistance, contestedEver, groupPeak, heydrichAlive,
  };
}

export function runBatch(p: Params): RunResult[] {
  const rng = mulberry32(p.seed);
  const runs: RunResult[] = [];
  for (let k = 0; k < p.runs; k++) runs.push(simulate(p, rng, k));
  return runs;
}

export { GROUP_INDEX };
