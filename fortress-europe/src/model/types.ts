export type SponsorId = "us" | "uk" | "su";
export type RegionKind = "occupied" | "annexed" | "puppet" | "ally";
export type Outcome = "hegemony" | "fraying" | "rollback" | "collapse" | "uswar";
export type FactionId = "ss" | "party" | "wehr" | "tech" | "goring";
export type NeutralId = "se" | "ch" | "es" | "pt" | "tr";

/** An identity group: the unit of psychology. */
export interface Group {
  id: string;
  name: string;
  /** How Nazi racial ideology classified the group. */
  classLabel: string;
  /** Severity of that classification: 0.15 for allies, 0.25 for "Germanic" peoples, 1 for peoples slated for removal. */
  bm: number;
  /** Strength of national identity and prior state tradition. */
  ident: number;
  /** Pool of potential collaborators: separatists, anti-Soviet or anti-rival feeling, local fascists. */
  collabP: number;
  /** Mobilization threshold: lower means people join resistance on less evidence it can win. */
  theta: number;
  /** Share of the group's resistance that is communist-led. */
  comm: number;
  /** Hostility between the communist and nationalist camps inside the group. */
  polar: number;
  /** Religiosity and church strength: the institution the regime meant to break after the war. */
  rel: number;
  /** Strength of an exile government or diaspora that funds the group's resistance. */
  exile: number;
  exileName: string;
  /** Where the group lives: [region id, share of that region's population]. */
  presence: [string, number][];
  notes: string;
}

/** A region: the unit of geography, logistics and garrisons. */
export interface Region {
  id: string;
  name: string;
  kind: RegionKind;
  /** Country names as they appear in Natural Earth (world-atlas) data. */
  countries: string[];
  value: number;
  terrain: number;
  westReach: number;
  sovReach: number;
  conduits: [NeutralId, number][];
  /** Strategic weight in German garrison planning. */
  priority: number;
  /** For puppet states: the group the puppet regime claims to represent. */
  titular?: string;
  regime?: string;
}

export interface Neutral {
  id: NeutralId;
  name: string;
  courage: number;
  stance: string;
}

export interface Rivalry {
  a: string;
  b: string;
  k: number;
  note: string;
}

/** Personal qualities shared by rulers, governors and resistance leaders. All 0 to 1. */
export interface Talent {
  force: number;
  competence: number;
  orator: number;
  diplomat: number;
  general: number;
  admin: number;
  /** Willingness to use violence, from principled nonviolence to extreme terror. */
  violence: number;
  /** Commitment to an ideological mission, from pragmatist to true believer. */
  ideology: number;
  exceptional: boolean;
}

export interface Governor {
  name: string;
  faction: FactionId | "ally";
  competence: number;
  zeal: number;
  since: number;
  oldFighter: boolean;
  talent: Talent;
  note: string;
}

/** Whoever holds supreme power in Berlin in a given year. */
export interface Ruler {
  name: string;
  faction: FactionId;
  born: number;
  talent: Talent;
  loyalty: number;
  merit: number;
  since: number;
  kind: "founder" | "known" | "cohort" | "exceptional";
  note: string;
}

/** A leader who emerges inside an identity group's resistance. */
export interface ResLeader {
  group: string;
  name: string;
  talent: Talent;
  since: number;
  until: number | null;
  fate: string;
}

export interface Params {
  brutality: number;
  extraction: number;
  collab: number;
  rump: number;
  pragmatism: number;
  bombYear: number;
  us: number;
  uk: number;
  su: number;
  westPrag: number;
  labor: number;
  neutral: number;
  aff: Record<SponsorId, Record<string, number>>;
  runs: number;
  seed: number;
}

export type EventKind = "start" | "regime" | "loss" | "gain" | "nuke" | "psych" | "faction" | "ethnic" | "sponsor" | "governor" | "berlin" | "famine" | "church" | "genocide" | "labor" | "ally" | "end";

export interface SimEvent {
  y: number;
  kind: EventKind;
  text: string;
  region?: string;
}

/** Per cell (group within region) per year fields. */
export const CF = { R: 0, A: 1, D: 2, FEAR: 3, VICT: 4, S_US: 5, S_UK: 6, S_EX: 7, S_SU: 8, S_NE: 9, HUNG: 10, POP: 11, NC: 12, AWARE: 13 } as const;
export const NCF = 14;

/** Per region per year fields. */
export const RF = { LOST: 0, R: 1, A: 2, GOV: 3, GAR: 4 } as const;
export const NRF = 5;

/** Global per year fields. */
export const GF = {
  S: 0, COH: 1, X: 2, CTRL: 3, K: 4, ENDED: 5, USB: 6, DEB: 7,
  BRUT: 8, COL: 9, EXTR: 10, SS: 11, PARTY: 12, WEHR: 13, TECH: 14, GOR: 15,
  FERV: 16, INFO: 17, OIL: 18, FOOD: 19, CHURCH: 20, GPO: 21, LEAD: 22,
} as const;
export const NGF = 23;

export interface RunResult {
  id: number;
  outcome: Outcome;
  endYear: number;
  cells: Float32Array;
  regions: Float32Array;
  glob: Float32Array;
  govs: Governor[];
  rulers: Ruler[];
  resLeaders: ResLeader[];
  events: SimEvent[];
  /** Regions taken by resistance or defection before the run ended. */
  lostByResistance: boolean[];
  /** Highest armed strength each group reached anywhere. */
  groupPeak: number[];
  heydrichAlive: boolean;
}

export interface Band {
  med: number[];
  p10: number[];
  p90: number[];
}

export interface Aggregate {
  total: number;
  counts: Record<Outcome, number>;
  control: Band;
  strength: Band;
  /** [year][cell][field] medians. */
  cellMed: Float32Array;
  /** [year][region] median armed strength. */
  regionR: number[][];
  /** [year][region] share of runs where Germany holds the region. */
  heldShare: number[][];
  lostShare: number[];
  /** [group] share of runs where the group's resistance becomes a major force (strength ≥ 0.5). */
  groupMajor: number[];
  hitlerDead: number[];
  churchWar: number[];
  usBomb: number[];
  deBomb: number[];
  rumpAlive: number[];
  ended: number[];
  /** [year][field] medians of the global fields. */
  globMed: number[][];
  /** [year] share of runs in which the founder generation is gone (no ruler born before 1906). */
  newGeneration: number[];
}
