import { useStore } from "../store";
import { OUTCOMES, pct } from "./format";

export function Verdict() {
  const agg = useStore((s) => s.agg);
  if (!agg) return <section className="panel verdict"><p className="status">Simulating the first batch…</p></section>;
  const n = agg.total;
  const held = (agg.counts.hegemony + agg.counts.fraying) / n;
  const collapse = agg.counts.collapse / n;
  return (
    <section className="panel verdict" aria-live="polite">
      <p className="eyebrow">Verdict across {n} histories</p>
      <p className="big">Germany still rules Europe in 1970 in <em>{pct(held)}</em> of runs. The regime collapses in {pct(collapse)}.</p>
      <div className="stack" role="img" aria-label={OUTCOMES.map((o) => `${o.label} ${pct(agg.counts[o.id] / n)}`).join(", ")}>
        {OUTCOMES.map((o) => <div key={o.id} className={`o-${o.id}`} style={{ width: `${(agg.counts[o.id] / n) * 100}%` }} />)}
      </div>
      <div className="legend">
        {OUTCOMES.map((o) => (
          <div key={o.id} className="item">
            <span className={`sw o-${o.id}`} />
            <span>{o.label}</span>
            <span className="pct">{pct(agg.counts[o.id] / n)}</span>
            <span className="desc">{o.desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
