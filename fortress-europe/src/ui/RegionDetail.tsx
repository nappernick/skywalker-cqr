import { useStore } from "../store";
import { REGIONS, START } from "../model/regions";
import { GROUPS, RIVALRIES } from "../model/groups";
import { CELLS, CELLS_OF_REGION } from "../model/cells";
import { REGION_RESOURCES, RESOURCE_NOTES } from "../model/resources";
import { NEUTRALS } from "../model/sponsors";
import { FACTION_LABEL } from "../model/people";
import { CF, type FactionId } from "../model/types";
import type { View } from "./view";
import { Meter, TalentBars } from "./YearPanel";
import { f2, pct } from "./format";

const KIND: Record<string, string> = { occupied: "Occupied", annexed: "Annexed to the Reich", puppet: "Puppet state", ally: "Allied state" };
const SUP: [string, number, string][] = [["us", CF.S_US, "US"], ["uk", CF.S_UK, "Britain"], ["ex", CF.S_EX, "Exiles"], ["su", CF.S_SU, "Soviet rump"], ["ne", CF.S_NE, "Neutrals"]];

export function RegionDetail({ v }: { v: View }) {
  const t = useStore((s) => s.t);
  const r = useStore((s) => s.region);
  const setRegion = useStore((s) => s.setRegion);
  const agg = useStore((s) => s.agg)!;
  const run = useStore((s) => s.run);
  const picker = (
    <select id="regionpick" aria-label="Region" value={r ?? ""} onChange={(e) => setRegion(e.target.value === "" ? null : Number(e.target.value))}>
      <option value="">Choose a region</option>
      {REGIONS.map((x, i) => <option key={x.id} value={i}>{x.name}</option>)}
    </select>
  );
  if (r === null) return <section className="panel"><div className="panel-head"><h3>Region</h3>{picker}</div><p className="hint">Select a region on the map to see its governor, garrison and every people living there.</p></section>;
  const reg = REGIONS[r];
  const gov = v.gov(t, r);
  const gar = v.garrison(t, r);
  const lost = v.lost(t, r);
  const cs = CELLS_OF_REGION[r];
  const gids = new Set(cs.map((i) => GROUPS[CELLS[i].g].id));
  const rivals = RIVALRIES.filter((x) => gids.has(x.a) && gids.has(x.b));
  const res = REGION_RESOURCES[reg.id];
  const leaders = run && v.mode === "run" ? run.resLeaders.filter((l) => gids.has(l.group) && l.since <= START + t && (l.until === null || l.until >= START + t)) : [];
  return (
    <section className="panel" aria-label={reg.name}>
      <div className="panel-head"><h3>{reg.name}</h3>{picker}</div>
      <div className="flags">
        <span className="pill info">{KIND[reg.kind]}</span>
        {v.mode === "avg"
          ? <><span className="pill lost">Lost in {pct(lost)} of runs this year</span><span className="pill lost">Ever lost {pct(agg.lostShare[r])}</span>{agg.contestedShare[r] > 0 && <span className="pill contested">Contested {pct(agg.contestedShare[r])}</span>}</>
          : <span className={`pill ${lost > 0.5 ? "lost" : v.contested(t, r) ? "contested" : "held"}`}>{lost > 0.5 ? "Lost" : v.contested(t, r) ? "Contested" : "Held"}</span>}
      </div>
      <dl className="kv">
        {reg.regime && <><dt>Regime</dt><dd>{reg.regime}</dd></>}
        <dt>Terrain</dt><dd>{f2(reg.terrain)} (rougher ground favors guerrillas)</dd>
        <dt>Reach</dt><dd>West {f2(reg.westReach)} · Soviet {f2(reg.sovReach)}{reg.conduits.length ? ` · via ${reg.conduits.map(([n]) => NEUTRALS.find((x) => x.id === n)!.name).join(", ")}` : ""}</dd>
        {res && <><dt>Resources</dt><dd>{RESOURCE_NOTES[reg.id] ?? Object.keys(res).join(", ")}</dd></>}
        {gar !== null && <><dt>Garrison</dt><dd>{f2(gar)} (share of German manpower, plus local auxiliaries)</dd></>}
      </dl>
      {gov && (
        <div className="ruler" style={{ borderColor: "var(--reich)" }}>
          <span className="eyebrow">{gov.faction === "ally" ? "Ruler" : `Governor · ${FACTION_LABEL[gov.faction as FactionId]}`} · since {gov.since}{gov.oldFighter ? " · old fighter" : ""}</span>
          <span className="nm">{gov.name}</span>
          {gov.note && <span className="note">{gov.note}</span>}
          <TalentBars t={gov.talent} />
        </div>
      )}
      {v.mode === "avg" && <p className="hint">Governors and rulers differ from run to run. Pick one history to see who governs.</p>}
      {leaders.map((l) => (
        <div key={l.name + l.since} className="ruler" style={{ borderColor: "var(--resist)" }}>
          <span className="eyebrow">Resistance leader since {l.since}</span>
          <span className="nm">{l.name}</span>
          <TalentBars t={l.talent} />
        </div>
      ))}
      <div className="cells">
        {cs.map((i) => {
          const g = GROUPS[CELLS[i].g];
          const c = (f: number) => v.cell(t, i, f);
          const sup = SUP.map(([k, f, l]) => [k, c(f), l] as const);
          const tot = sup.reduce((a, [, x]) => a + x, 0);
          return (
            <div key={i} className="cellcard">
              <div className="row"><strong>{g.name}</strong><span className="status">{pct(CELLS[i].share)} of the region · {g.classLabel}</span></div>
              {g.id === "vdt" ? <p className="hint">Ethnic Germans never resist. They supply auxiliaries, and settlers swell their numbers. Population {f2(c(CF.POP))}× pre-war.</p> : (
                <>
                  <div className="cellgrid">
                    <Meter label="Dissent" v={c(CF.D)} />
                    <Meter label="Defiance" v={c(CF.A)} />
                    <Meter label="Fear" v={c(CF.FEAR)} color="var(--war)" />
                    <Meter label="Armed" v={c(CF.R)} color="var(--resist)" />
                    <Meter label="Strikes" v={c(CF.NC)} />
                    <Meter label="Hunger" v={c(CF.HUNG)} color="var(--danger)" />
                    <Meter label="Victimized" v={c(CF.VICT)} color="var(--danger)" />
                    <Meter label="Aware" v={c(CF.AWARE)} color="var(--ink)" />
                    <Meter label="Population" v={c(CF.POP)} fmt={(x) => pct(x)} />
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="status" style={{ minWidth: 70 }}>Supply {f2(tot)}</span>
                    <span className="supply" style={{ flex: 1 }} role="img" aria-label={sup.map(([, x, l]) => `${l} ${f2(x)}`).join(", ")}>
                      {sup.map(([k, x]) => <span key={k} className={`s-${k}`} style={{ width: `${Math.min(1, x) * 100}%` }} />)}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div className="facleg">{SUP.map(([k, , l]) => <span key={k}><i className={`s-${k}`} />{l}</span>)}</div>
      </div>
      {rivals.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">Rivalries here</span>
          {rivals.map((x) => <p key={x.a + x.b} className="hint">{GROUPS.find((g) => g.id === x.a)!.name} and {GROUPS.find((g) => g.id === x.b)!.name} ({f2(x.k)}): {x.note}</p>)}
        </div>
      )}
    </section>
  );
}
