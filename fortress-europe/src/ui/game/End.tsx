import { useStore } from "../../store";
import { GF, type Aggregate } from "../../model/types";
import { glob, type Game } from "../../game/game";
import { OUTCOME_LABEL, OUTCOMES } from "../format";

/** The verdict on a finished history, set against the same world played without you. */
export function End({ g }: { g: Game }) {
  const agg = useStore((s) => s.agg);
  const quit = useStore((s) => s.quitGame);
  const r = g.sim.live();
  const ctrl = glob(g, GF.CTRL);
  const base = agg ? agg.control.med[29] : null;
  const better = agg ? Math.round(100 * (1 - pctBelow(agg, ctrl))) : null;
  return (
    <section className="g-endscreen" aria-label="The verdict">
      <p className="g-kicker">The verdict, {r.endYear}</p>
      <h2 className="g-verdict">{OUTCOME_LABEL[r.outcome]}</h2>
      <p>{OUTCOMES.find((o) => o.id === r.outcome)!.desc}</p>
      <dl className="g-facts">
        <dt>Reich control at the end</dt><dd>{Math.round(ctrl)}%</dd>
        {base !== null && <><dt>The same world without you</dt><dd>median {Math.round(base)}% in 1970; you held the Reich lower than {better}% of those histories</dd></>}
        <dt>Orders that brought reprisals</dt><dd>{g.reprisals}: each year a rising you ordered stood, and each assassination or sabotage</dd>
        <dt>Decisions taken</dt><dd>{g.decisions.length}</dd>
      </dl>
      {g.chapterResults.length > 0 && (
        <ol className="g-chapters">
          {g.chapterResults.map((c) => <li key={c.title}><strong>{c.title}</strong> {c.met ? "achieved" : "not achieved"}. {c.text}</li>)}
        </ol>
      )}
      <button className="g-end" onClick={quit}>Play again</button>
    </section>
  );
}

/** Share of baseline runs whose 1970 control was below this run's final control. */
function pctBelow(agg: Aggregate, ctrl: number): number {
  const b = agg.control;
  // The batch keeps quantiles, not every run: interpolate between p10, median and p90.
  const pts: [number, number][] = [[0, 0], [0.1, b.p10[29]], [0.5, b.med[29]], [0.9, b.p90[29]], [1, 100]];
  for (let k = 1; k < pts.length; k++) if (ctrl <= pts[k][1]) {
    const [q0, v0] = pts[k - 1]; const [q1, v1] = pts[k];
    return v1 === v0 ? q1 : q0 + ((ctrl - v0) / (v1 - v0)) * (q1 - q0);
  }
  return 1;
}
