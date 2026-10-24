/**
 * Where the Reich's strategic resources come from, as shares of what it needs (1.0 = fully supplied).
 * Approximate and judgment-based, anchored to the best-known sources of each material.
 */
export type ResourceId = "oil" | "coal" | "iron" | "food" | "metals";

export const RESOURCE_LABEL: Record<ResourceId, string> = {
  oil: "Oil", coal: "Coal", iron: "Iron ore", food: "Grain & food", metals: "Strategic metals",
};

/** Weight of each resource in material strength. Oil is the binding constraint. */
export const RESOURCE_WEIGHT: Record<ResourceId, number> = { oil: 0.3, coal: 0.25, iron: 0.2, food: 0.15, metals: 0.1 };
export const RESOURCE_NEED: Record<ResourceId, number> = { oil: 1, coal: 1, iron: 1, food: 1.2, metals: 1 };

/** Produced inside Germany and Austria. Synthetic fuel from coal grows over time. */
export const CORE: Record<ResourceId, number> = { oil: 0.3, coal: 0.55, iron: 0.1, food: 0.45, metals: 0.15 };

export const REGION_RESOURCES: Record<string, Partial<Record<ResourceId, number>>> = {
  rom: { oil: 0.35, food: 0.1 },
  hun: { oil: 0.05, food: 0.1, metals: 0.1 },
  alb: { oil: 0.02, metals: 0.03 },
  ukr: { oil: 0.04, coal: 0.12, iron: 0.15, food: 0.3, metals: 0.12 },
  pol: { coal: 0.15, food: 0.08 },
  cze: { coal: 0.06, iron: 0.03, metals: 0.03 },
  bel: { coal: 0.05 },
  fra: { coal: 0.07, iron: 0.25, food: 0.1, metals: 0.05 },
  nld: { coal: 0.02, food: 0.04 },
  nor: { iron: 0.02, metals: 0.08 },
  svk: { iron: 0.02, metals: 0.03 },
  den: { food: 0.06 },
  srb: { food: 0.04, metals: 0.14 },
  bgr: { food: 0.03 },
  fin: { metals: 0.15 },
  kos: { metals: 0.06 },
  hrv: { metals: 0.04 },
  bih: { metals: 0.04 },
  mkd: { metals: 0.04 },
  grc: { metals: 0.05 },
  svn: { metals: 0.03 },
};

/** Imports from neutrals, which flow while those neutrals fear Germany. */
export const NEUTRAL_TRADE: Record<string, Partial<Record<ResourceId, number>>> = {
  se: { iron: 0.35 },
  tr: { metals: 0.12 },
  es: { metals: 0.06 },
  pt: { metals: 0.06 },
};

export const RESOURCE_NOTES: Record<string, string> = {
  rom: "Ploiești oilfields, Germany's main natural oil supply",
  ukr: "Donbas coal, Krivoy Rog iron, Nikopol manganese and the grain belt",
  pol: "Upper Silesian coal",
  cze: "Škoda arms works, coal, and Joachimsthal uranium",
  fra: "Lorraine iron ore, northern coal and farmland",
  nor: "Molybdenum, the Narvik route for Swedish ore, and Vemork heavy water",
  fin: "Petsamo nickel",
  srb: "Bor copper",
  kos: "Trepča lead and zinc",
  hun: "Bauxite, grain and a little oil",
  svn: "Idrija mercury",
  den: "Dairy, meat and bacon",
};

/** Bomb inputs: Czech uranium and Norwegian heavy water. */
export const BOMB_INPUTS = { uranium: "cze", heavyWater: "nor" };
