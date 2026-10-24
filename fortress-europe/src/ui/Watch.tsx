import { useEffect } from "react";
import { useStore } from "../store";
import { START, YEARS } from "../model/regions";
import { OUTCOMES, OUTCOME_LABEL } from "./format";
import type { Outcome } from "../model/types";

export function Watch() {
  const s = useStore();
  const { mode, t, playing, speed, summaries, runId, outcomeFilter } = s;
  useEffect(() => {
    if (!playing) return;
    const h = setInterval(() => {
      const cur = useStore.getState().t;
      if (cur >= YEARS - 1) useStore.getState().setPlaying(false);
      else useStore.getState().setT(cur + 1);
    }, speed);
    return () => clearInterval(h);
  }, [playing, speed]);
  const pool = summaries.filter((x) => outcomeFilter === "all" || x.outcome === outcomeFilter);
  const run = summaries[runId];
  return (
    <section className="panel watch" aria-label="Watch">
      <div className="panel-head">
        <h2>Watch</h2>
        <div className="chips" role="group" aria-label="View">
          <button className="chip" aria-pressed={mode === "avg"} onClick={() => s.setMode("avg")}>Average of all runs</button>
          <button className="chip" aria-pressed={mode === "run"} onClick={() => s.setMode("run")}>One history</button>
        </div>
      </div>
      {mode === "run" && (
        <div className="row">
          <label className="status" htmlFor="ofilter">Outcome</label>
          <select id="ofilter" value={outcomeFilter} onChange={(e) => s.setFilter(e.target.value as Outcome | "all")}>
            <option value="all">Any</option>
            {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <label className="status" htmlFor="runpick">Run</label>
          <select id="runpick" value={pool.some((p) => p.id === runId) ? runId : ""} onChange={(e) => s.pickRun(Number(e.target.value))}>
            {!pool.some((p) => p.id === runId) && <option value="">Choose a run</option>}
            {pool.map((p) => <option key={p.id} value={p.id}>#{p.id + 1} · {OUTCOME_LABEL[p.outcome]} {p.outcome === "collapse" || p.outcome === "uswar" ? p.endYear : ""}</option>)}
          </select>
          <button className="btn ghost" onClick={s.randomRun} disabled={!pool.length}>Random</button>
          {run && <span className="status">Run #{run.id + 1}: {OUTCOME_LABEL[run.outcome]}{run.endYear < 1970 ? ` in ${run.endYear}` : ""}, last ruler {run.lastRuler}</span>}
        </div>
      )}
      <div className="player">
        <button className="btn" onClick={() => { if (t >= YEARS - 1) s.setT(0); s.setPlaying(!playing); }} aria-label={playing ? "Pause" : "Play"}>{playing ? "Pause" : "Play"}</button>
        <input id="year" type="range" min={0} max={YEARS - 1} value={t} aria-label="Year" onChange={(e) => { s.setPlaying(false); s.setT(Number(e.target.value)); }} />
        <span className="year">{START + t}</span>
      </div>
      <div className="row">
        <span className="status">Speed</span>
        {[[900, "Slow"], [450, "Normal"], [180, "Fast"]].map(([v, l]) => (
          <button key={v} className="chip" aria-pressed={speed === v} onClick={() => s.setSpeed(v as number)}>{l}</button>
        ))}
      </div>
    </section>
  );
}
