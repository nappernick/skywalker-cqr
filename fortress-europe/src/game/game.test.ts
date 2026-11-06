import { describe, expect, test } from "bun:test";
import { DEFAULT_PARAMS, PRESETS, cloneAff } from "../model/presets";
import { CARDS } from "./cards";
import { CHAPTERS } from "./chapters";
import { addMission, available, choose, commandable, endYear, finished, income, newGame, setInfo, setOrder, setSupply, type Game, type Mode } from "./game";

const params = () => ({ ...DEFAULT_PARAMS, ...PRESETS[0].vals, aff: cloneAff(), seed: 21 });

/** A simple automatic player: answers every card with its first choice and spends what it has. */
function autoplay(g: Game) {
  let guard = 0;
  while (!finished(g) && guard++ < 40) {
    while (g.pending.length) choose(g, g.pending[0].id, 0);
    setSupply(g, "pol", 0.3);
    setSupply(g, "ser", 0.3);
    setInfo(g, "fra", 0.2);
    addMission(g, { kind: "broadcast" });
    for (const id of commandable(g)) setOrder(g, id, "rise");
    expect(available(g)).toBeGreaterThanOrEqual(0);
    endYear(g);
  }
}

describe("game", () => {
  for (const mode of ["spymaster", "people", "campaign"] as Mode[]) {
    test(`a ${mode} game plays to the end`, () => {
      const g = newGame(mode, params(), "wuk");
      expect(income(g)).toBeGreaterThan(0);
      autoplay(g);
      expect(finished(g)).toBe(true);
      expect(g.decisions.length).toBeGreaterThan(0);
      if (mode === "campaign") expect(g.chapterResults.length).toBeGreaterThan(0);
    });
  }

  test("the year cannot end with an unanswered card", () => {
    const g = newGame("spymaster", params());
    for (let k = 0; k < 5 && !g.pending.length; k++) endYear(g);
    if (!g.pending.length) return;
    const t = g.sim.t;
    endYear(g);
    expect(g.sim.t).toBe(t);
  });

  test("spending never exceeds the year's capital", () => {
    const g = newGame("spymaster", params());
    for (const id of ["pol", "ser", "gre", "fre", "nor", "cze", "dut"]) setSupply(g, id, 0.6);
    expect(available(g)).toBeGreaterThanOrEqual(0);
  });

  test("story data is well formed", () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) expect(c.choices.length).toBeGreaterThanOrEqual(2);
    for (let k = 1; k < CHAPTERS.length; k++) expect(CHAPTERS[k].from).toBe(CHAPTERS[k - 1].to + 1);
    expect(CHAPTERS[0].from).toBe(1941);
    expect(CHAPTERS[CHAPTERS.length - 1].to).toBe(1970);
  });
});
