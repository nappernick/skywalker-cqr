// The game's look: any of the gallery's palettes by number, and three Typewolf-sourced type options.
// Palettes come from design/palettes.json (route B draws from Nick's Khroma favourites); colors are named by role.
import palettes from "../../../design/palettes.json";

export interface Palette { n: number; frame: string; block: string; text: string; text2: string; rule: string; flag: string }
export const PALETTES = palettes as Palette[];

export const TYPES = [
  { id: "chivo", label: "Chivo", note: "One grotesque family, 400 to 900" },
  { id: "rubik", label: "Rubik", note: "One rounded family, 400 to 900" },
  { id: "barlow", label: "Barlow Condensed + Work Sans", note: "Condensed display, open text" },
] as const;
export type TypeId = (typeof TYPES)[number]["id"];

/** Provisional choice until a palette is picked from the gallery. */
export const DEFAULT_PALETTE = 1;

const KEY = "fortress-europe-look";
export function loadLook(): { palette: number; type: TypeId } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && PALETTES.some((p) => p.n === v.palette) && TYPES.some((t) => t.id === v.type)) return v;
  } catch { /* storage can be unavailable; the defaults still work */ }
  return { palette: DEFAULT_PALETTE, type: "chivo" };
}
export function saveLook(v: { palette: number; type: TypeId }) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* not remembered, still applied */ }
}

export function lookStyle(n: number): Record<string, string> {
  const p = PALETTES.find((x) => x.n === n) ?? PALETTES[0];
  return { "--frame": p.frame, "--block": p.block, "--text": p.text, "--text-2": p.text2, "--rule": p.rule, "--flag": p.flag };
}
