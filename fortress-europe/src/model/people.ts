import type { FactionId } from "./types";

export interface Zone {
  id: string;
  name: string;
  regions: string[];
  /** How closely Berlin watches the governor: 1 for annexed districts next door, 0.3 for the far East. */
  oversight: number;
}

export interface GovernorSeed {
  name: string;
  faction: FactionId;
  competence: number;
  zeal: number;
  oldFighter: boolean;
  note: string;
}

/** German administrative zones. Allies keep their own governments and are not listed. */
export const ZONES: Zone[] = [
  { id: "rkno", name: "Reichskommissariat Norway", regions: ["nor"], oversight: 0.5 },
  { id: "den", name: "Plenipotentiary for Denmark", regions: ["den"], oversight: 0.8 },
  { id: "rknl", name: "Reichskommissariat Netherlands", regions: ["nld"], oversight: 0.8 },
  { id: "mbb", name: "Military Administration Belgium", regions: ["bel"], oversight: 0.8 },
  { id: "mbf", name: "Military Administration France", regions: ["fra"], oversight: 0.7 },
  { id: "gauw", name: "Gau Moselland (annexed Luxembourg)", regions: ["lux"], oversight: 0.9 },
  { id: "gg", name: "General Government", regions: ["pol"], oversight: 0.7 },
  { id: "prot", name: "Protectorate of Bohemia and Moravia", regions: ["cze"], oversight: 0.9 },
  { id: "ost", name: "Reichskommissariat Ostland", regions: ["ltu", "lva", "est", "blr"], oversight: 0.35 },
  { id: "rku", name: "Reichskommissariat Ukraine", regions: ["ukr"], oversight: 0.3 },
  { id: "gaus", name: "Annexed Slovenian districts", regions: ["svn"], oversight: 0.85 },
  { id: "se", name: "Military Commander Southeast", regions: ["srb", "grc", "mne", "mkd"], oversight: 0.45 },
  { id: "env", name: "German envoys to the puppet states", regions: ["svk", "hrv", "bih", "alb", "kos"], oversight: 0.5 },
];

export const ZONE_OF: Record<string, string> = Object.fromEntries(ZONES.flatMap((z) => z.regions.map((r) => [r, z.id])));

export const INITIAL_GOVERNORS: Record<string, GovernorSeed> = {
  rkno: { name: "Josef Terboven", faction: "party", competence: 0.5, zeal: 0.85, oldFighter: true, note: "A Gauleiter who ruled Norway by terror and despised Quisling." },
  den: { name: "Werner Best", faction: "ss", competence: 0.9, zeal: 0.35, oldFighter: false, note: "A brilliant SS lawyer who ran Denmark with a light touch because it worked." },
  rknl: { name: "Arthur Seyss-Inquart", faction: "party", competence: 0.7, zeal: 0.7, oldFighter: false, note: "Capable and committed; oversaw deportations and, late in the war, the Hunger Winter." },
  mbb: { name: "Alexander von Falkenhausen", faction: "wehr", competence: 0.75, zeal: 0.15, oldFighter: false, note: "An old-school general who restrained the SS and later joined the anti-Hitler opposition." },
  mbf: { name: "Carl-Heinrich von Stülpnagel", faction: "wehr", competence: 0.7, zeal: 0.2, oldFighter: false, note: "Military governor of France and a July 1944 conspirator." },
  gauw: { name: "Gustav Simon", faction: "party", competence: 0.4, zeal: 0.85, oldFighter: true, note: "Forced Germanization and conscription, which triggered a general strike." },
  gg: { name: "Hans Frank", faction: "party", competence: 0.45, zeal: 0.9, oldFighter: true, note: "Hitler's old lawyer, presiding over plunder and murder in occupied Poland." },
  prot: { name: "Reinhard Heydrich", faction: "ss", competence: 0.95, zeal: 0.9, oldFighter: false, note: "Brilliant and ruthless: terror for elites, extra rations for workers. Assassinated in 1942 by a British-trained team in our history." },
  ost: { name: "Hinrich Lohse", faction: "party", competence: 0.3, zeal: 0.7, oldFighter: true, note: "An old Gauleiter out of his depth, feuding with the SS and Rosenberg's ministry." },
  rku: { name: "Erich Koch", faction: "party", competence: 0.25, zeal: 0.95, oldFighter: true, note: "Treated Ukrainians as slaves and squandered early goodwill. Protected by Hitler and Bormann throughout." },
  gaus: { name: "Friedrich Rainer", faction: "party", competence: 0.45, zeal: 0.8, oldFighter: true, note: "Gauleiter overseeing the Germanization of annexed Slovenia." },
  se: { name: "Alexander Löhr", faction: "wehr", competence: 0.6, zeal: 0.5, oldFighter: false, note: "A capable commander who still presided over savage reprisal policy in the Balkans." },
  env: { name: "Siegfried Kasche", faction: "party", competence: 0.35, zeal: 0.7, oldFighter: true, note: "An SA man as envoy to Croatia who backed the Ustaše whatever they did." },
};

export const HEYDRICH_REPLACEMENT: GovernorSeed = {
  name: "Karl Hermann Frank", faction: "ss", competence: 0.55, zeal: 0.85, oldFighter: false,
  note: "A Sudeten German zealot who ran the Protectorate after Heydrich's assassination.",
};

/** Kinds of appointee each faction sends out when Berlin replaces a governor. */
export const ARCHETYPES: Record<FactionId, { name: string; comp: number; zeal: number; oldFighter: boolean }[]> = {
  ss: [
    { name: "an SS police general", comp: 0.55, zeal: 0.85, oldFighter: false },
    { name: "an SS technocrat", comp: 0.8, zeal: 0.65, oldFighter: false },
  ],
  party: [
    { name: "an old-guard Gauleiter", comp: 0.35, zeal: 0.9, oldFighter: true },
    { name: "a Party administrator", comp: 0.55, zeal: 0.6, oldFighter: false },
  ],
  wehr: [{ name: "a Wehrmacht governor", comp: 0.65, zeal: 0.25, oldFighter: false }],
  tech: [{ name: "a ministry technocrat", comp: 0.75, zeal: 0.3, oldFighter: false }],
  goring: [{ name: "a Göring crony", comp: 0.35, zeal: 0.5, oldFighter: false }],
};

/** How a ruler governs, separate from who they are. */
export interface Figure {
  key: string;
  name: string;
  born: number;
  /** Mortality multiplier over a 1940s male baseline. */
  health: number;
  faction: FactionId;
  /** Charisma and will: the power of a person to bend institutions toward them. */
  force: number;
  competence: number;
  ideology: number;
  /** How much personal loyalty and Party seniority protect a failing governor. */
  loyalty: number;
  /** How much results decide promotions and firings. */
  merit: number;
  prefers: Partial<Record<FactionId, number>>;
  note: string;
}

export const HITLER: Figure = {
  key: "hitler", name: "Hitler", born: 1889, health: 3, faction: "party", force: 1, competence: 0.55, ideology: 1, loyalty: 0.75, merit: 0.25,
  prefers: { party: 0.32, ss: 0.33, wehr: 0.12, tech: 0.1, goring: 0.13 },
  note: "Rules by setting rivals against each other and protects old comrades whatever their record.",
};

/** The founding generation's heirs. Each can die, be purged or be assassinated before a succession. */
export const HEIRS: Figure[] = [
  { key: "goring", name: "Göring", born: 1893, health: 2.5, faction: "goring", force: 0.6, competence: 0.35, ideology: 0.5, loyalty: 0.6, merit: 0.15,
    prefers: { goring: 0.55, party: 0.2, wehr: 0.25 },
    note: "The designated heir. Once capable, now corrupt and addicted, governing through cronies and rival fiefdoms." },
  { key: "himmler", name: "Himmler", born: 1900, health: 1.2, faction: "ss", force: 0.35, competence: 0.65, ideology: 1, loyalty: 0.4, merit: 0.45,
    prefers: { ss: 0.8, party: 0.1, tech: 0.1 },
    note: "A bureaucratic zealot. SS men replace Party governors and racial resettlement accelerates." },
  { key: "heydrich", name: "Heydrich", born: 1904, health: 1, faction: "ss", force: 0.8, competence: 0.95, ideology: 0.85, loyalty: 0.15, merit: 0.85,
    prefers: { ss: 0.75, tech: 0.25 },
    note: "Ruthless, intelligent and efficient: terror becomes targeted, and failures are fired." },
  { key: "goebbels", name: "Goebbels", born: 1897, health: 1.3, faction: "party", force: 0.85, competence: 0.8, ideology: 0.95, loyalty: 0.55, merit: 0.4,
    prefers: { party: 0.65, ss: 0.25, tech: 0.1 },
    note: "The regime's great orator after Hitler. Mobilizes the Party rank and file and renews the faith." },
  { key: "bormann", name: "Bormann", born: 1900, health: 1, faction: "party", force: 0.35, competence: 0.75, ideology: 0.9, loyalty: 0.65, merit: 0.35,
    prefers: { party: 0.8, ss: 0.2 },
    note: "A master of bureaucratic infighting who rules through the Gauleiters and wants the churches broken." },
  { key: "speer", name: "Speer", born: 1905, health: 0.9, faction: "tech", force: 0.5, competence: 0.9, ideology: 0.35, loyalty: 0.2, merit: 0.8,
    prefers: { tech: 0.5, wehr: 0.4, ss: 0.1 },
    note: "The armaments minister. Runs the empire as a production problem and has no taste for the racial mission." },
];

/** Generic successors from later cohorts. Names are never invented: the model cannot know who they would be. */
export const COHORT_LABEL: Record<FactionId, string[]> = {
  ss: ["an SS general", "an RSHA intellectual of the 'uncompromising generation'", "an SS police chief from the East"],
  party: ["a Gauleiter", "a Party apparatchik", "a Hitler Youth leader grown old in office"],
  wehr: ["a field marshal", "a General Staff officer", "an Eastern Front commander"],
  tech: ["an armaments technocrat", "a planning-ministry manager", "an industrialist-administrator"],
  goring: ["a Luftwaffe chief", "a Four-Year Plan official", "a Göring protégé"],
};

export const FACTION_IDEOLOGY: Record<FactionId, number> = { ss: 0.9, party: 0.8, wehr: 0.35, tech: 0.35, goring: 0.5 };

export const FACTION_LABEL: Record<FactionId, string> = {
  ss: "SS", party: "Party", wehr: "Wehrmacht", tech: "Technocrats", goring: "Göring network",
};

/** Allied and puppet rulers, whose deaths open a window for defection. */
export interface AllyRuler {
  key: string;
  name: string;
  born: number;
  health: number;
  regions: string[];
  /** Personal commitment to the German alliance. Successors start lower. */
  commit: number;
}

export const ALLY_RULERS: AllyRuler[] = [
  { key: "ita", name: "Mussolini", born: 1883, health: 1.5, regions: ["ita"], commit: 0.7 },
  { key: "hun", name: "Horthy", born: 1868, health: 1, regions: ["hun"], commit: 0.45 },
  { key: "rom", name: "Antonescu", born: 1882, health: 1, regions: ["rom", "mda"], commit: 0.7 },
  { key: "bgr", name: "Tsar Boris III", born: 1894, health: 1.5, regions: ["bgr"], commit: 0.45 },
  { key: "fin", name: "Ryti's government", born: 1889, health: 1, regions: ["fin"], commit: 0.4 },
  { key: "svk", name: "Tiso", born: 1887, health: 1, regions: ["svk"], commit: 0.7 },
  { key: "cro", name: "Pavelić", born: 1889, health: 1, regions: ["hrv", "bih"], commit: 0.85 },
  { key: "alb", name: "the Albanian collaborationist cabinet", born: 1890, health: 1, regions: ["alb", "kos"], commit: 0.5 },
];

/** Annual death probability for a man of a given age in the 1940s–60s, times a health multiplier (Gompertz). */
export const mortality = (age: number, health: number): number => Math.min(0.6, Math.exp(-9.6 + 0.085 * age) * health);

/** Skills and alignment of the known figures, judged from their records. */
export const FIGURE_TALENT: Record<string, { orator: number; diplomat: number; general: number; admin: number; violence: number }> = {
  hitler: { orator: 1, diplomat: 0.45, general: 0.35, admin: 0.25, violence: 1 },
  goring: { orator: 0.6, diplomat: 0.5, general: 0.3, admin: 0.3, violence: 0.6 },
  himmler: { orator: 0.2, diplomat: 0.2, general: 0.15, admin: 0.7, violence: 1 },
  heydrich: { orator: 0.4, diplomat: 0.35, general: 0.4, admin: 0.9, violence: 0.95 },
  goebbels: { orator: 0.95, diplomat: 0.35, general: 0.2, admin: 0.6, violence: 0.85 },
  bormann: { orator: 0.2, diplomat: 0.25, general: 0.1, admin: 0.8, violence: 0.8 },
  speer: { orator: 0.4, diplomat: 0.45, general: 0.3, admin: 0.95, violence: 0.4 },
};

/** Descriptions for exceptional people, by their strongest skill. Never personal names. */
export const EXCEPTIONAL_LABEL: Record<"orator" | "diplomat" | "general" | "admin", string> = {
  orator: "a spellbinding orator",
  diplomat: "a gifted diplomat",
  general: "a brilliant commander",
  admin: "an extraordinary organizer",
};
