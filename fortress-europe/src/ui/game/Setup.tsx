import { useState } from "react";
import { useStore } from "../../store";
import { GROUPS } from "../../model/groups";
import { PRESETS } from "../../model/presets";
import { Rail } from "../Rail";
import { CHAPTERS } from "../../game/chapters";
import type { Mode } from "../../game/game";

const MODES: { id: Mode; title: string; text: string }[] = [
  { id: "spymaster", title: "Spymaster", text: "Run the covert networks that London and Washington will not admit to. Each year their appetite sets your influence; you spend it on arms drops, radios and operations anywhere in Europe, and the peoples you arm take your orders." },
  { id: "people", title: "One people", text: "Lead a single people's movement from 1941 to 1970. Decide when to rise and when to wait, whether to make peace with your neighbors, which sponsor to court, and what to risk for your leaders." },
  { id: "campaign", title: "Story", text: `One history in ${CHAPTERS.length} chapters, each a real role: a partisan commander at Užice, an officer running exile networks from London, a forest army in Volhynia, the Home Army, Washington's new spies, a radio network, Slovak army plotters, and the endgame.` },
];

export function Setup() {
  const start = useStore((s) => s.startGame);
  const preset = useStore((s) => s.preset);
  const agg = useStore((s) => s.agg);
  const running = useStore((s) => s.running);
  const [mode, setMode] = useState<Mode>("campaign");
  const [group, setGroup] = useState("ser");
  const held = agg ? Math.round(((agg.counts.hegemony + agg.counts.fraying) / agg.total) * 100) : null;
  return (
    <div className="g-setup">
      <header className="g-bar">
        <div className="g-year"><span className="g-yr">1941</span><span className="g-roleline">Fortress Europe</span></div>
        <p className="g-lede">Britain made peace in 1940. The Soviet state is breaking. The United States stays out but keeps sending aid. Nazi Germany rules from the Atlantic to the Volga. Can the peoples of Europe wear the empire down, and at what cost?</p>
      </header>
      <section className="g-modes" aria-label="Choose how to play">
        {MODES.map((m) => (
          <button key={m.id} className="g-mode" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            <span className="g-mode-t">{m.title}</span>
            <span>{m.text}</span>
          </button>
        ))}
      </section>
      <section className="g-start" aria-label="Start">
        {mode === "people" && (
          <div className="g-row">
            <label htmlFor="pick-people">Your people</label>
            <select id="pick-people" value={group} onChange={(e) => setGroup(e.target.value)}>
              {GROUPS.filter((g) => g.id !== "vdt").map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        <p className="g-note">
          World: {PRESETS.find((p) => p.id === preset)?.label ?? "your own settings"}.
          {held !== null && !running ? ` Played without you, Germany still rules Europe in 1970 in ${held}% of histories.` : " Simulating the world without you…"}
        </p>
        <button className="g-end" onClick={() => start(mode, mode === "people" ? group : null)}>Begin in 1941</button>
      </section>
      <details className="g-world">
        <summary>Change the world before you begin</summary>
        <p className="g-note">Every setting of the model: occupation policy, Berlin's factions, the outside powers and each sponsor's attitude to each people.</p>
        <div className="g-rail"><Rail /></div>
      </details>
    </div>
  );
}
