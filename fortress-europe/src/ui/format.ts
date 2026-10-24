import type { EventKind, Outcome } from "../model/types";

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const f2 = (x: number) => x.toFixed(2);

export const OUTCOMES: { id: Outcome; label: string; desc: string }[] = [
  { id: "hegemony", label: "Hegemony", desc: "In 1970 Germany still holds at least 80% of Europe's value, with a cohesive regime." },
  { id: "fraying", label: "Fraying", desc: "Germany holds at least half, but regions have broken away and garrisons are stretched." },
  { id: "rollback", label: "Rollback", desc: "The regime survives to 1970 but holds less than half of Europe." },
  { id: "collapse", label: "Collapse", desc: "Regime cohesion breaks before 1970 and the empire comes apart." },
  { id: "uswar", label: "War with the US", desc: "A crisis during the American atomic monopoly ends in capitulation." },
];
export const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.id, o.label])) as Record<Outcome, string>;

export const KIND_LABEL: Record<EventKind, string> = {
  start: "Start", regime: "Berlin", loss: "Loss", gain: "Gain", nuke: "Atomic", psych: "Society", faction: "Infighting",
  ethnic: "Ethnic", sponsor: "Sponsors", governor: "Governors", berlin: "Berlin", famine: "Famine", church: "Churches",
  genocide: "Genocide", labor: "Labor", ally: "Allies", end: "End",
};
