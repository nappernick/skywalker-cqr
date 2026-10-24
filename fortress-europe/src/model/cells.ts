import { GROUPS } from "./groups";
import { REGIONS, REGION_INDEX } from "./regions";
import { GROUP_INDEX, RIVALRIES } from "./groups";

/** A cell is one identity group living in one region. */
export interface Cell {
  g: number;
  r: number;
  share: number;
}

export const CELLS: Cell[] = GROUPS.flatMap((grp, g) =>
  grp.presence.filter(([, s]) => s > 0.02).map(([rid, share]) => ({ g, r: REGION_INDEX[rid], share })),
);
export const NC = CELLS.length;

export const CELLS_OF_REGION: number[][] = REGIONS.map((_, r) => CELLS.flatMap((c, i) => (c.r === r ? [i] : [])));
export const CELLS_OF_GROUP: number[][] = GROUPS.map((_, g) => CELLS.flatMap((c, i) => (c.g === g ? [i] : [])));

/** For each cell, the rival cells in the same region and the strength of the rivalry. */
export const RIVALS_OF_CELL: [number, number][][] = CELLS.map((c) => {
  const out: [number, number][] = [];
  for (const rv of RIVALRIES) {
    const ga = GROUP_INDEX[rv.a];
    const gb = GROUP_INDEX[rv.b];
    const other = c.g === ga ? gb : c.g === gb ? ga : -1;
    if (other < 0) continue;
    for (const j of CELLS_OF_REGION[c.r]) if (CELLS[j].g === other) out.push([j, rv.k]);
  }
  return out;
});

/**
 * Approximate pre-war Jewish share of each region's population. Used only for how visible the
 * murder is to neighbors; the victims are not modeled as a movement.
 */
export const JEWISH_SHARE: Record<string, number> = {
  pol: 0.1, ltu: 0.07, lva: 0.05, est: 0.005, blr: 0.07, ukr: 0.05, mda: 0.07, cze: 0.03, svk: 0.03,
  hun: 0.05, rom: 0.04, nld: 0.015, bel: 0.008, lux: 0.01, fra: 0.008, grc: 0.01, srb: 0.01, hrv: 0.01,
  bih: 0.01, mkd: 0.01, ita: 0.001, bgr: 0.007, den: 0.002, nor: 0.0005,
};

/** How far each ally resisted handing over its Jews: Finland and Bulgaria largely refused, Romania did not. */
export const ALLY_INDEPENDENCE: Record<string, number> = { fin: 1, ita: 0.8, bgr: 0.8, hun: 0.6, rom: 0.4 };

/** Share of each group that Generalplan Ost meant to expel or kill. */
export const GPO_TARGET: Record<string, number> = {
  pol: 0.8, bel: 0.75, wuk: 0.65, euk: 0.65, rus: 0.9, lit: 0.85, lat: 0.5, cze: 0.5,
};

/** Harvest zones that share weather. */
export const HARVEST_ZONE: Record<string, number> = {
  nor: 0, den: 0, nld: 0, bel: 0, lux: 0, fra: 0, fin: 0,
  pol: 1, cze: 1, svk: 1, ltu: 1, lva: 1, est: 1, blr: 1, ukr: 1, mda: 1, hun: 1, rom: 1,
  svn: 2, hrv: 2, bih: 2, srb: 2, mne: 2, mkd: 2, kos: 2, alb: 2, grc: 2, ita: 2, bgr: 2,
};
export const NZONES = 3;
