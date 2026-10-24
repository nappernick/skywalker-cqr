import { useStore } from "../store";
import { START } from "../model/regions";
import { FACTION_LABEL } from "../model/people";
import { GF, type FactionId, type Talent } from "../model/types";
import type { View } from "./view";
import { f2, pct } from "./format";

export function Meter({ label, v, max = 1, fmt = f2, color }: { label: string; v: number; max?: number; fmt?: (x: number) => string; color?: string }) {
  return (
    <div className="meter">
      <span>{label}</span>
      <span className="bar"><span style={{ width: `${Math.max(0, Math.min(1, v / max)) * 100}%`, background: color }} /></span>
      <span className="v">{fmt(v)}</span>
    </div>
  );
}

export function TalentBars({ t }: { t: Talent }) {
  return (
    <div className="meters">
      <Meter label="Force" v={t.force} />
      <Meter label="Competence" v={t.competence} />
      <Meter label="Oratory" v={t.orator} />
      <Meter label="Diplomacy" v={t.diplomat} />
      <Meter label="Generalship" v={t.general} />
      <Meter label="Administration" v={t.admin} />
      <Meter label="Violence" v={t.violence} color="var(--danger)" />
      <Meter label="Ideology" v={t.ideology} color="var(--war)" />
    </div>
  );
}

const FACS: [FactionId, number][] = [["ss", GF.SS], ["party", GF.PARTY], ["wehr", GF.WEHR], ["tech", GF.TECH], ["goring", GF.GOR]];

export function YearPanel({ v }: { v: View }) {
  const t = useStore((s) => s.t);
  const agg = useStore((s) => s.agg)!;
  const y = START + t;
  const g = (f: number) => v.glob(t, f);
  const ended = v.ended(t) > 0.5;
  const ruler = v.ruler(t);
  const evs = v.events.filter((e) => e.y === y);
  return (
    <section className="panel" aria-label={`The year ${y}`}>
      <div className="panel-head">
        <h3>{y}</h3>
        <span className="status">{v.mode === "avg" ? "Medians across all runs" : ended ? "The empire is gone" : "This history"}</span>
      </div>
      {ended && v.mode === "run" ? <p>The run ended before this year. What follows is the final state, with every region freed.</p> : (
        <>
          <div className="meters">
            <Meter label="Control" v={g(GF.CTRL)} max={100} fmt={(x) => `${Math.round(x)}%`} />
            <Meter label="Strength" v={g(GF.S)} max={1.25} />
            <Meter label="Oil" v={g(GF.OIL)} max={1.25} />
            <Meter label="Food" v={g(GF.FOOD)} max={1.25} />
            <Meter label="Cohesion" v={g(GF.COH)} />
            <Meter label="Permanence" v={g(GF.X)} />
            <Meter label="Fervor" v={g(GF.FERV)} color="var(--war)" />
            <Meter label="Brutality" v={g(GF.BRUT)} color="var(--danger)" />
            <Meter label="Collaboration" v={g(GF.COL)} />
          </div>
          <p className="hint">Strength is oil, coal, ore, food and metals against need (1 = fully supplied). Permanence is the shared belief that German rule will last.</p>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="facbar" role="img" aria-label={FACS.map(([k, f]) => `${FACTION_LABEL[k]} ${pct(g(f))}`).join(", ")}>
              {FACS.map(([k, f]) => <span key={k} className={`f-${k}`} style={{ width: `${g(f) * 100}%` }} />)}
            </div>
            <div className="facleg">{FACS.map(([k, f]) => <span key={k}><i className={`f-${k}`} />{FACTION_LABEL[k]} {pct(g(f))}</span>)}</div>
          </div>
          {ruler && (
            <div className="ruler">
              <span className="eyebrow">Ruling Berlin since {ruler.since}</span>
              <span className="nm">{ruler.name}</span>
              <span className="note">{ruler.note}</span>
              <TalentBars t={ruler.talent} />
            </div>
          )}
          <div className="flags">
            {v.mode === "run" ? (
              <>
                {g(GF.USB) > 0.5 && <span className="pill info">US bomb</span>}
                {g(GF.DEB) > 0.5 && <span className="pill war">German bomb</span>}
                {g(GF.CHURCH) > 0.05 && <span className="pill lost">Church war</span>}
                {g(GF.GPO) > 0.35 && <span className="pill lost">Generalplan Ost</span>}
                <span className="pill held">{g(GF.K) < 0 ? "No Soviet rump" : `Soviet rump ${f2(g(GF.K))}`}</span>
              </>
            ) : (
              <>
                <span className="pill war">Founder gone {pct(agg.hitlerDead[t])}</span>
                <span className="pill info">US bomb {pct(agg.usBomb[t])}</span>
                <span className="pill war">German bomb {pct(agg.deBomb[t])}</span>
                <span className="pill lost">Church war {pct(agg.churchWar[t])}</span>
                <span className="pill held">Rump alive {pct(agg.rumpAlive[t])}</span>
                <span className="pill lost">Ended {pct(agg.ended[t])}</span>
              </>
            )}
          </div>
        </>
      )}
      {evs.length > 0 && <ul className="yevents">{evs.map((e, k) => <li key={k}>{e.text}</li>)}</ul>}
    </section>
  );
}
