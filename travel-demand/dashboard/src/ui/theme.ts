import { interpolateRgb } from "d3";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CensusLabel, Channel, Coverage } from "../domain/types";

/** The four page themes (v5_themes). */
export const PALETTE_IDS = ["33", "43", "44", "60"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

type Series = readonly [string, string, string, string, string, string, string, string, string, string, string, string];

/** Six roles per theme: page frame, content block, primary and secondary text, rules, flag accents. */
interface PaletteRoles {
  readonly frame: string;
  readonly block: string;
  readonly text: string;
  readonly text2: string;
  readonly rule: string;
  readonly flag: string;
}

const PALETTES: Readonly<Record<PaletteId, PaletteRoles>> = {
  "33": { frame: "#dcd7bb", block: "#fa9f3d", text: "#0724a6", text2: "#691b78", rule: "#435658", flag: "#484a5a" },
  "43": { frame: "#9dee77", block: "#fa9f3d", text: "#691b78", text2: "#0724a6", rule: "#ed2ba0", flag: "#28591c" },
  "44": { frame: "#91d1db", block: "#b6a1e3", text: "#0724a6", text2: "#691b78", rule: "#28591c", flag: "#435658" },
  "60": { frame: "#cac0d4", block: "#dae41f", text: "#484a5a", text2: "#691b78", rule: "#521291", flag: "#0724a6" },
};

export interface Theme extends PaletteRoles {
  readonly id: PaletteId;
  /** Chart colours: the exact palette colours other than the panel, repeated in order. */
  readonly series: Series;
  /** Aliases the charts use, all derived from the six roles. */
  readonly bg: string;
  readonly panel: string;
  readonly fg: string;
  readonly fgMuted: string;
  readonly border: string;
  readonly grid: string;
  readonly axis: string;
  readonly reference: string;
  readonly muted: string;
  readonly popover: string;
  readonly ok: string;
  readonly warn: string;
  readonly bad: string;
}

function themeOf(id: PaletteId): Theme {
  const p = PALETTES[id];
  // Charts use the theme's four ink colours first, then lighter and darker variants of those same inks.
  // The frame and panel colours never appear inside a chart: on a panel they read as holes.
  const tint = (c: string, k: number) => interpolateRgb(c, "#ffffff")(k);
  const shade = (c: string, k: number) => interpolateRgb(c, "#000000")(k);
  const inks = [p.text, p.text2, p.rule, p.flag] as const;
  const series: Series = [
    inks[0], inks[1], inks[2], inks[3],
    tint(inks[0], 0.4), tint(inks[1], 0.4), tint(inks[2], 0.4), tint(inks[3], 0.4),
    shade(inks[0], 0.35), shade(inks[1], 0.35), shade(inks[2], 0.35), shade(inks[3], 0.35),
  ];
  return {
    ...p, id, series, bg: p.frame, panel: p.block, fg: p.text, fgMuted: p.text2, border: p.rule, grid: p.rule, axis: p.rule,
    reference: p.flag, muted: tint(p.text, 0.55), popover: p.frame, ok: p.text, warn: p.text2, bad: p.rule,
  };

}

export const FONT_FAMILY = '"Rubik", system-ui, -apple-system, "Segoe UI", sans-serif';

/** The two dominant channels take the theme's two text inks; rarer ones take rule, flag and light variants. */
const CHANNEL_INDEX: Readonly<Record<Channel, number>> = {
  answer: 0, agent_action: 1, engineering_fix: 2, human_investigation: 3, agent_prep_human_decision: 5, intake_and_route: 6,
};
const CENSUS_INDEX: Readonly<Record<CensusLabel, number | "muted">> = {
  fact_answer: 0, self_serve: 7, answer_then_action: 4, action: 1, defect: 3, feedback: 5, unclear: "muted",
};

export const seriesColor = (t: Theme, i: number): string => t.series[i % t.series.length] ?? t.muted;
export const channelColor = (t: Theme, c: Channel): string => seriesColor(t, CHANNEL_INDEX[c]);
export const coverageColor = (t: Theme, c: Coverage | null): string => (c === "full" ? t.ok : c === "partial" ? t.warn : c === "none" ? t.bad : t.muted);
export const censusColor = (t: Theme, c: CensusLabel): string => {
  const i = CENSUS_INDEX[c];
  return i === "muted" ? t.muted : seriesColor(t, i);
};

export const ThemeContext = createContext<Theme>(themeOf("33"));
export const useTheme = (): Theme => useContext(ThemeContext);

const STORAGE_KEY = "skywalker.palette";
const isPaletteId = (v: string | null): v is PaletteId => PALETTE_IDS.some((p) => p === v);

function readStored(): PaletteId {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isPaletteId(v) ? v : "33";
  } catch {
    return "33";
  }
}

export interface PaletteApi {
  readonly theme: Theme;
  readonly setPalette: (id: PaletteId) => void;
}

/** The selected page theme, remembered per browser, written to CSS custom properties so CSS and canvas share one source. */
export function usePalette(): PaletteApi {
  const [id, setId] = useState<PaletteId>(readStored);
  const theme = useMemo(() => themeOf(id), [id]);
  const setPalette = useCallback((next: PaletteId) => {
    setId(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this visit only.
    }
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset["palette"] = theme.id;
    const vars: Readonly<Record<string, string>> = {
      "--frame": theme.frame, "--block": theme.block, "--text": theme.text, "--text-2": theme.text2, "--rule": theme.rule, "--flag": theme.flag,
      "--grid": theme.grid, "--border": theme.border, "--muted": theme.muted, "--ok": theme.ok, "--warn": theme.warn, "--bad": theme.bad, "--font": FONT_FAMILY,
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  }, [theme]);
  return { theme, setPalette };
}
