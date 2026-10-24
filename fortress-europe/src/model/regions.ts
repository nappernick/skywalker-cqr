import type { Region } from "./types";

export const START = 1941;
export const END = 1970;
export const YEARS = END - START + 1;

const R = (r: Region): Region => r;

export const REGIONS: Region[] = [
  R({ id: "nor", name: "Norway", kind: "occupied", countries: ["Norway"], value: 0.03, terrain: 0.65, westReach: 0.7, sovReach: 0.1, conduits: [["se", 0.7]], priority: 1.6 }),
  R({ id: "den", name: "Denmark", kind: "occupied", countries: ["Denmark"], value: 0.025, terrain: 0.1, westReach: 0.5, sovReach: 0.05, conduits: [["se", 0.65]], priority: 1 }),
  R({ id: "nld", name: "Netherlands", kind: "occupied", countries: ["Netherlands"], value: 0.05, terrain: 0.1, westReach: 0.7, sovReach: 0.05, conduits: [], priority: 1 }),
  R({ id: "bel", name: "Belgium", kind: "occupied", countries: ["Belgium"], value: 0.04, terrain: 0.15, westReach: 0.7, sovReach: 0.05, conduits: [], priority: 1 }),
  R({ id: "lux", name: "Luxembourg", kind: "annexed", countries: ["Luxembourg"], value: 0.005, terrain: 0.3, westReach: 0.5, sovReach: 0.05, conduits: [], priority: 0.8 }),
  R({ id: "fra", name: "France", kind: "occupied", countries: ["France"], value: 0.18, terrain: 0.35, westReach: 0.8, sovReach: 0.05, conduits: [["ch", 0.4], ["es", 0.3]], priority: 1.2 }),
  R({ id: "pol", name: "Poland", kind: "occupied", countries: ["Poland"], value: 0.06, terrain: 0.4, westReach: 0.25, sovReach: 0.5, conduits: [], priority: 1.2 }),
  R({ id: "cze", name: "Bohemia & Moravia", kind: "occupied", countries: ["Czechia"], value: 0.07, terrain: 0.45, westReach: 0.3, sovReach: 0.3, conduits: [], priority: 1.2 }),
  R({ id: "svk", name: "Slovakia", kind: "puppet", countries: ["Slovakia"], value: 0.015, terrain: 0.65, westReach: 0.25, sovReach: 0.45, conduits: [], priority: 1, titular: "slk", regime: "Tiso's clerical-fascist state" }),
  R({ id: "ltu", name: "Lithuania", kind: "occupied", countries: ["Lithuania"], value: 0.01, terrain: 0.45, westReach: 0.3, sovReach: 0.55, conduits: [["se", 0.2]], priority: 1 }),
  R({ id: "lva", name: "Latvia", kind: "occupied", countries: ["Latvia"], value: 0.01, terrain: 0.5, westReach: 0.3, sovReach: 0.55, conduits: [["se", 0.25]], priority: 1 }),
  R({ id: "est", name: "Estonia", kind: "occupied", countries: ["Estonia"], value: 0.01, terrain: 0.5, westReach: 0.35, sovReach: 0.55, conduits: [["se", 0.4]], priority: 1 }),
  R({ id: "blr", name: "Belarus", kind: "occupied", countries: ["Belarus"], value: 0.02, terrain: 0.8, westReach: 0.05, sovReach: 0.9, conduits: [], priority: 1 }),
  R({ id: "ukr", name: "Ukraine", kind: "occupied", countries: ["Ukraine"], value: 0.1, terrain: 0.45, westReach: 0.05, sovReach: 0.9, conduits: [], priority: 1.3 }),
  R({ id: "mda", name: "Bessarabia", kind: "ally", countries: ["Moldova"], value: 0.005, terrain: 0.3, westReach: 0.1, sovReach: 0.6, conduits: [["tr", 0.1]], priority: 0.8, regime: "Romanian administration" }),
  R({ id: "svn", name: "Slovenia", kind: "annexed", countries: ["Slovenia"], value: 0.01, terrain: 0.75, westReach: 0.5, sovReach: 0.2, conduits: [["ch", 0.1]], priority: 1 }),
  R({ id: "hrv", name: "Croatia", kind: "puppet", countries: ["Croatia"], value: 0.02, terrain: 0.7, westReach: 0.55, sovReach: 0.25, conduits: [], priority: 1, titular: "cro", regime: "Pavelić's Ustaše state" }),
  R({ id: "bih", name: "Bosnia", kind: "puppet", countries: ["Bosnia and Herz."], value: 0.01, terrain: 0.9, westReach: 0.5, sovReach: 0.25, conduits: [], priority: 1, titular: "cro", regime: "Pavelić's Ustaše state" }),
  R({ id: "srb", name: "Serbia", kind: "occupied", countries: ["Serbia"], value: 0.025, terrain: 0.7, westReach: 0.4, sovReach: 0.35, conduits: [], priority: 1 }),
  R({ id: "mne", name: "Montenegro", kind: "occupied", countries: ["Montenegro"], value: 0.003, terrain: 0.95, westReach: 0.6, sovReach: 0.25, conduits: [], priority: 0.9 }),
  R({ id: "mkd", name: "Macedonia", kind: "occupied", countries: ["Macedonia"], value: 0.004, terrain: 0.8, westReach: 0.4, sovReach: 0.3, conduits: [["tr", 0.2]], priority: 0.9 }),
  R({ id: "kos", name: "Kosovo", kind: "puppet", countries: ["Kosovo"], value: 0.003, terrain: 0.75, westReach: 0.45, sovReach: 0.25, conduits: [], priority: 0.9, titular: "alb", regime: "Greater Albania under Axis protection" }),
  R({ id: "alb", name: "Albania", kind: "puppet", countries: ["Albania"], value: 0.005, terrain: 0.9, westReach: 0.65, sovReach: 0.2, conduits: [], priority: 0.9, titular: "alb", regime: "an Axis protectorate government" }),
  R({ id: "grc", name: "Greece", kind: "occupied", countries: ["Greece"], value: 0.015, terrain: 0.8, westReach: 0.65, sovReach: 0.15, conduits: [["tr", 0.5]], priority: 1.1 }),
  R({ id: "ita", name: "Italy", kind: "ally", countries: ["Italy"], value: 0.11, terrain: 0.55, westReach: 0.6, sovReach: 0.05, conduits: [["ch", 0.35]], priority: 1, regime: "Mussolini's Fascist regime" }),
  R({ id: "hun", name: "Hungary", kind: "ally", countries: ["Hungary"], value: 0.045, terrain: 0.3, westReach: 0.2, sovReach: 0.4, conduits: [], priority: 1, regime: "Horthy's regency" }),
  R({ id: "rom", name: "Romania", kind: "ally", countries: ["Romania"], value: 0.07, terrain: 0.5, westReach: 0.2, sovReach: 0.5, conduits: [["tr", 0.2]], priority: 1.2, regime: "Antonescu's dictatorship" }),
  R({ id: "bgr", name: "Bulgaria", kind: "ally", countries: ["Bulgaria"], value: 0.025, terrain: 0.6, westReach: 0.25, sovReach: 0.35, conduits: [["tr", 0.4]], priority: 1, regime: "Tsar Boris III's monarchy" }),
  R({ id: "fin", name: "Finland", kind: "ally", countries: ["Finland"], value: 0.025, terrain: 0.7, westReach: 0.3, sovReach: 0.5, conduits: [["se", 0.6]], priority: 1, regime: "Finland's elected government, a co-belligerent rather than a satellite" }),
];

export const REGION_INDEX: Record<string, number> = Object.fromEntries(REGIONS.map((r, i) => [r.id, i]));

/** Countries drawn on the map that are not modeled regions. */
export const REICH_CORE = ["Germany", "Austria", "Liechtenstein"];
export const NEUTRAL_COUNTRIES: Record<string, string> = {
  Sweden: "se", Switzerland: "ch", Spain: "es", Portugal: "pt", Turkey: "tr", Ireland: "ie", "United Kingdom": "uk", Iceland: "is", Andorra: "es",
};
export const SOVIET = ["Russia"];
