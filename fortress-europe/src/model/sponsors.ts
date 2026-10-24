import type { Neutral, SponsorId } from "./types";

export interface Sponsor {
  id: SponsorId;
  name: string;
  short: string;
  stance: string;
}

export const SPONSORS: Sponsor[] = [
  { id: "us", name: "United States", short: "US",
    stance: "Not at war, so help is covert and deniable. Closest to peoples with large American diasporas and democratic exile governments. Wary of arming communists." },
  { id: "uk", name: "Britain", short: "UK",
    stance: "Bound by a peace treaty, so help risks war. Strongest ties to the exile governments it hosts: Norwegians, Dutch, Poles, Greeks, Czechs." },
  { id: "su", name: "Soviet rump state", short: "USSR",
    stance: "Exists only if the USSR survives beyond the Urals. Arms communist and Soviet-loyal partisans and refuses nationalists it means to crush later, as it did the Polish Home Army in 1944." },
];

/** Default willingness of each sponsor to back each identity group's resistance, 0 to 1. */
export const DEFAULT_AFF: Record<SponsorId, Record<string, number>> = {
  us: { nor: 0.75, dan: 0.65, dut: 0.75, fle: 0.6, wal: 0.65, lux: 0.6, fre: 0.85, als: 0.5, pol: 0.6, cze: 0.5, slk: 0.35, lit: 0.35, lat: 0.3, est: 0.3, bel: 0.1, wuk: 0.25, euk: 0.15, rus: 0.1, slv: 0.45, cro: 0.35, ser: 0.5, bos: 0.25, mon: 0.35, mac: 0.25, alb: 0.35, gre: 0.75, ita: 0.75, hun: 0.3, rom: 0.3, bul: 0.2, fin: 0.4 },
  uk: { nor: 0.9, dan: 0.8, dut: 0.9, fle: 0.75, wal: 0.8, lux: 0.7, fre: 0.85, als: 0.5, pol: 0.8, cze: 0.65, slk: 0.45, lit: 0.25, lat: 0.25, est: 0.25, bel: 0.05, wuk: 0.1, euk: 0.05, rus: 0.05, slv: 0.55, cro: 0.45, ser: 0.7, bos: 0.35, mon: 0.5, mac: 0.35, alb: 0.5, gre: 0.9, ita: 0.45, hun: 0.25, rom: 0.35, bul: 0.2, fin: 0.4 },
  su: { nor: 0.25, dan: 0.2, dut: 0.2, fle: 0.15, wal: 0.35, lux: 0.1, fre: 0.5, als: 0.1, pol: 0.15, cze: 0.7, slk: 0.6, lit: 0.05, lat: 0.1, est: 0.05, bel: 0.95, wuk: 0.05, euk: 0.8, rus: 0.95, slv: 0.7, cro: 0.6, ser: 0.75, bos: 0.5, mon: 0.8, mac: 0.6, alb: 0.4, gre: 0.55, ita: 0.45, hun: 0.3, rom: 0.35, bul: 0.9, fin: 0.05 },
};

export const NEUTRALS: Neutral[] = [
  { id: "se", name: "Sweden", courage: 0.5, stance: "Traded with Germany and let troops transit, but sheltered Norwegian and Danish refugees and became bolder as risk fell." },
  { id: "ch", name: "Switzerland", courage: 0.35, stance: "Armed, strict neutrality. A hub for intelligence and escape lines, and very cautious about anything more." },
  { id: "es", name: "Spain", courage: 0.15, stance: "Franco leaned toward the Axis but stayed out of the war. Escape lines crossed the Pyrenees despite the regime." },
  { id: "pt", name: "Portugal", courage: 0.3, stance: "Britain's oldest ally and Europe's main exit port, reachable only through Spain." },
  { id: "tr", name: "Turkey", courage: 0.4, stance: "Balanced between both camps; its border and coast were the back door into the Balkans." },
];
