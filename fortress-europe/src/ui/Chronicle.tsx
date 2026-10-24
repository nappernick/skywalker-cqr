import { useStore } from "../store";
import { START, YEARS } from "../model/regions";
import type { View } from "./view";
import { KIND_LABEL } from "./format";

/** First year in which a share of runs passes one half, if it ever does. */
const crosses = (s: number[]) => { const k = s.findIndex((x) => x >= 0.5); return k < 0 ? null : START + k; };

export function Chronicle({ v }: { v: View }) {
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);
  const setPlaying = useStore((s) => s.setPlaying);
  const agg = useStore((s) => s.agg)!;
  if (v.mode === "avg") {
    const m: [string, number | null][] = [
      ["Hitler is dead or gone in most runs", crosses(agg.hitlerDead)],
      ["A post-founder generation rules in most runs", crosses(agg.newGeneration)],
      ["The United States has the bomb in most runs", crosses(agg.usBomb)],
      ["A church war has begun in most runs", crosses(agg.churchWar)],
      ["Germany has the bomb in most runs", crosses(agg.deBomb)],
      ["Most runs have already ended in collapse or war", crosses(agg.ended)],
    ];
    return (
      <section className="panel">
        <div className="panel-head"><h2>Chronicle</h2><span className="status">milestones across all runs</span></div>
        <ul className="chron">
          {m.map(([text, y]) => (
            <li key={text} className={y === null ? "future" : ""}>
              <span className="yr">{y ?? "never"}</span><span>{text}{y === null ? " (does not happen by 1970)" : "."}</span>
            </li>
          ))}
          <li><span className="yr">{START + YEARS - 1}</span><span>The Soviet rump survives in {Math.round(agg.rumpAlive[YEARS - 1] * 100)}% of runs. Pick one history above to read its full chronicle.</span></li>
        </ul>
      </section>
    );
  }
  const y = START + t;
  return (
    <section className="panel">
      <div className="panel-head"><h2>Chronicle</h2><span className="status">{v.events.length} events · later years dimmed · click a year to jump</span></div>
      <ul className="chron">
        {v.events.map((e, k) => (
          <li key={k} className={`k-${e.kind}${e.y > y ? " future" : ""}${e.y === y ? " now" : ""}`}>
            <button className="yr" onClick={() => { setPlaying(false); setT(e.y - START); }} aria-label={`Jump to ${e.y}`} title={KIND_LABEL[e.kind]}>{e.y}</button>
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
