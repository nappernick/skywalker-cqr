import { useMemo } from "react";
import { useStore } from "../../store";
import { START } from "../../model/regions";
import { GROUPS, GROUP_INDEX } from "../../model/groups";
import type { SimEvent } from "../../model/types";
import { makeView } from "../view";
import { MapView } from "../MapView";
import { YearPanel } from "../YearPanel";
import { RegionDetail } from "../RegionDetail";
import { ControlChart, GroupMultiples } from "../Charts";
import { Chronicle } from "../Chronicle";
import { available, endYear, finished, lastT, role, year, type Game } from "../../game/game";
import { CHAPTERS } from "../../game/chapters";
import { Decide } from "./Decide";
import { End } from "./End";

function roleLine(g: Game): string {
  const r = role(g);
  if (g.mode === "campaign") { const ch = CHAPTERS[g.chapter]; return ch ? `${ch.title}: ${ch.role}` : "The history is complete"; }
  return r.kind === "spymaster" ? "Spymaster of the Western networks" : `Leading the ${GROUPS[GROUP_INDEX[r.group]].name}`;
}

export function Play({ g }: { g: Game }) {
  const gv = useStore((s) => s.gv);
  const agg = useStore((s) => s.agg);
  const act = useStore((s) => s.act);
  const done = finished(g);
  const lt = lastT(g);
  const v = useMemo(() => {
    const extra: SimEvent[] = g.decisions.map((d) => ({ y: d.y, kind: "story", text: `${d.title}: ${d.choice}. ${d.consequence}` }));
    return makeView("run", agg, g.sim.live(), Math.max(0, lt), extra);
    // The game object is mutable; gv changes whenever it does.
  }, [gv, agg]);
  const left = available(g);
  const blocked = g.pending.length > 0;
  return (
    <>
      <header className="g-bar">
        <div className="g-year" aria-live="polite">
          <span className="g-yr">{done ? (g.sim.live().endYear) : year(g)}</span>
          <span className="g-roleline">{done ? "The history is complete" : roleLine(g)}</span>
        </div>
        {!done && (
          <div className="g-turn">
            <p className="g-cap"><strong>{g.capital}</strong> {role(g).kind === "spymaster" ? "influence" : "organization"} · <strong>{left}</strong> left</p>
            <button className="g-end" disabled={blocked} onClick={() => act(endYear)}>
              {blocked ? `Answer ${g.pending.length === 1 ? "the decision" : "the decisions"} first` : `End ${year(g)}`}
            </button>
            <p className="g-note">Unspent influence carries over at half value.</p>
          </div>
        )}
      </header>
      {done && <End g={g} />}
      <div className={`g-cols${done ? " g-two" : ""}`}>
        {!done && <Decide g={g} />}
        <div className="g-mapcol">
          <MapView v={v} />
          {lt < 0 && <p className="g-note g-onblock">Europe in the spring of 1941. Nothing has been played yet: your first year's choices shape what follows.</p>}
        </div>
        <div className="g-ledger">
          {lt >= 0 ? <YearPanel v={v} /> : (
            <section className="panel" aria-label="Europe in 1941">
              <h3>{START}</h3>
              <p>Britain has made peace. The Soviet state is breaking under the German advance. The United States stays out but keeps sending aid. From the Atlantic to the Volga, Europe is ruled from Berlin.</p>
            </section>
          )}
          <RegionDetail v={v} />
        </div>
      </div>
      {lt >= 0 && (
        <div className="g-below">
          {agg && <ControlChart v={v} />}
          <Chronicle v={v} />
          {agg && <GroupMultiples v={v} />}
        </div>
      )}
    </>
  );
}
