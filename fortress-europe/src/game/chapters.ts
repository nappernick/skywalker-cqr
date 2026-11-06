// Story mode: one history from 1941 to 1970, told in chapters. Each chapter hands the player a different role,
// grounded in a real one, with a brief and an objective judged at the chapter's end.
import { GF } from "../model/types";
import { CF } from "../model/types";
import { CELLS, CELLS_OF_GROUP } from "../model/cells";
import { GROUP_INDEX } from "../model/groups";
import { REGIONS } from "../model/regions";
import { cell, glob, groupR, regionLost, type Game } from "./game";

export interface Chapter {
  title: string;
  from: number;
  to: number;
  /** The people you lead; absent means you run the spymaster's network. */
  group?: string;
  role: string;
  brief: string;
  goal: string;
  objective: (g: Game) => { met: boolean; text: string };
}

const fmt = (x: number) => x.toFixed(2);
const meanA = (g: Game, ids: string[]) => ids.reduce((a, id) => a + Math.max(...CELLS_OF_GROUP[GROUP_INDEX[id]].map((i) => cell(g, i, CF.A))), 0) / ids.length;

export const CHAPTERS: Chapter[] = [
  {
    title: "Užice", from: 1941, to: 1942, group: "ser", role: "A partisan commander in western Serbia",
    brief: "The Yugoslav army dissolved in April and its soldiers went home with their rifles. In Croatia and Bosnia the Ustaše are massacring Serbs. Across Serbia and Montenegro, villages are rising.",
    goal: "Keep the Serb rising alive: armed strength of at least 0.3 somewhere at the end of 1942.",
    objective: (g) => { const r = groupR(g, "ser"); return { met: r >= 0.3, text: `Serb armed strength at the end of 1942: ${fmt(r)}.` }; },
  },
  {
    title: "London", from: 1943, to: 1944, role: "An intelligence officer running the exile networks from London",
    brief: "Britain is at peace with Germany and its government wants no incidents. The exile governments in London do not accept the peace. Your job is to keep their networks alive without starting a war.",
    goal: "By the end of 1944, at least three peoples have armed strength of 0.2 or more.",
    objective: (g) => {
      const ids = ["nor", "dut", "fre", "pol", "cze", "gre", "ser", "slv", "bel"].filter((id) => groupR(g, id) >= 0.2);
      return { met: ids.length >= 3, text: `${ids.length} peoples at armed strength 0.2 or more.` };
    },
  },
  {
    title: "The forest army", from: 1945, to: 1947, group: "wuk", role: "A commander of the Ukrainian Insurgent Army",
    brief: "Your movement has no foreign sponsor. Its weapons come from the enemy, from police who desert with their rifles, and from the stocks a collapsing Red Army left in 1941. The Poles of Volhynia are your neighbors and your enemies.",
    goal: "Become a major force (armed strength 0.5) by the end of 1947.",
    objective: (g) => { const r = groupR(g, "wuk"); return { met: r >= 0.5, text: `Western Ukrainian armed strength at the end of 1947: ${fmt(r)}.` }; },
  },
  {
    title: "The long wait", from: 1948, to: 1950, group: "pol", role: "A commander of the Home Army",
    brief: "Poland's underground state has its own courts, schools and army. Its doctrine is to wait for a liberator and then rise. In this world no liberator is coming, and the settlers are.",
    goal: "Keep the underground army intact: armed strength of at least 0.25, and Poland's population above 85% of pre-war, at the end of 1950.",
    objective: (g) => {
      const i = CELLS_OF_GROUP[GROUP_INDEX.pol].find((k) => REGIONS[CELLS[k].r].id === "pol")!;
      const r = groupR(g, "pol"); const pop = cell(g, i, CF.POP);
      return { met: r >= 0.25 && pop >= 0.85, text: `Polish armed strength ${fmt(r)}, population ${Math.round(pop * 100)}% of pre-war.` };
    },
  },
  {
    title: "Aerodynamic", from: 1951, to: 1954, role: "A case officer of America's new intelligence service",
    brief: "Washington has a peacetime intelligence service, a budget, and a president who believes in covert action. The East is where the occupation is cruelest and the forests are deepest.",
    goal: "Two peoples of the East (Ukrainians, Belarusians, Russians, Balts) at armed strength 0.4 by the end of 1954.",
    objective: (g) => {
      const ids = ["wuk", "euk", "bel", "rus", "lit", "lat", "est"].filter((id) => groupR(g, id) >= 0.4);
      return { met: ids.length >= 2, text: `${ids.length} eastern peoples at armed strength 0.4 or more.` };
    },
  },
  {
    title: "Transistor Europe", from: 1955, to: 1958, role: "The director of a radio network for occupied Europe",
    brief: "Cheap transistor radios can hear foreign stations in any kitchen. The quietest peoples of the West have complied for fifteen years. Compliance is not consent.",
    goal: "Average defiance among the French, Dutch, Belgians, Danes and Norwegians above 0.3 at the end of 1958.",
    objective: (g) => { const a = meanA(g, ["fre", "dut", "fle", "wal", "dan", "nor"]); return { met: a >= 0.3, text: `Average western defiance: ${fmt(a)}.` }; },
  },
  {
    title: "The officers' plot", from: 1959, to: 1964, group: "slk", role: "A Slovak staff officer",
    brief: "Slovakia got its state from Hitler and its army from him too. The army is the one Slovak institution with weapons, and its officers have been talking.",
    goal: "Slovakia breaks with Germany by the end of 1964.",
    objective: (g) => { const lost = regionLost(g, "svk"); return { met: lost, text: lost ? "Slovakia has broken with Germany." : "Slovakia is still a German satellite." }; },
  },
  {
    title: "Endgame", from: 1965, to: 1970, role: "The coordinator of every network still standing",
    brief: "A quarter century after the conquest, a generation has grown up under the occupation. Whatever the Reich still holds in 1970, it holds because of what happened in these last years.",
    goal: "Reich control below 60% in 1970, or the regime gone.",
    objective: (g) => { const c = glob(g, GF.CTRL); return { met: c < 60, text: `Reich control at the end: ${Math.round(c)}%.` }; },
  },
];
