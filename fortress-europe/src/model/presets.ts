import { DEFAULT_AFF } from "./sponsors";
import type { Params } from "./types";

const cloneAff = () => ({ us: { ...DEFAULT_AFF.us }, uk: { ...DEFAULT_AFF.uk }, su: { ...DEFAULT_AFF.su } });

export const DEFAULT_PARAMS: Params = {
  brutality: 0.9,
  extraction: 0.75,
  collab: 0.2,
  rump: 0.5,
  pragmatism: 0.3,
  bombYear: 1958,
  us: 0.35,
  uk: 0.25,
  su: 0.8,
  westPrag: 0.4,
  labor: 0.7,
  neutral: 0.4,
  aff: cloneAff(),
  runs: 400,
  seed: 1940,
};

export type PresetValues = Omit<Params, "aff" | "runs" | "seed">;

export interface Preset {
  id: string;
  label: string;
  vals: PresetValues;
}

const base: PresetValues = {
  brutality: 0.9, extraction: 0.75, collab: 0.2, rump: 0.5, pragmatism: 0.3, bombYear: 1958,
  us: 0.35, uk: 0.25, su: 0.8, westPrag: 0.4, labor: 0.7, neutral: 0.4,
};

export const PRESETS: Preset[] = [
  { id: "historical", label: "Nazi policy as it was", vals: { ...base } },
  { id: "pragmatic", label: "Pragmatic occupier", vals: { ...base, brutality: 0.35, extraction: 0.4, collab: 0.6, pragmatism: 0.5, labor: 0.35 } },
  { id: "isolated", label: "Resistance abandoned", vals: { ...base, us: 0, uk: 0, su: 0, neutral: 0, rump: 0, bombYear: 1965 } },
  { id: "coldwar", label: "Cold War backing", vals: { ...base, us: 0.8, uk: 0.5, su: 0.9, rump: 0.7, westPrag: 0.6, neutral: 0.6, bombYear: 1950 } },
];

export { cloneAff };
