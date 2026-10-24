import { useStore } from "../store";
import { REGIONS } from "../model/regions";
import { W, H, REGION_PATHS, REGION_CENTROIDS, REICH_PATH, NEUTRAL_PATHS, SOVIET_PATH, OTHER_PATH } from "./geo";
import { GF } from "../model/types";
import type { View } from "./view";
import { pct, f2 } from "./format";

/** Region fill: Reich-held olive shading to resistance amber with armed strength; red as it is lost. */
function fill(v: View, t: number, r: number): string {
  const R = Math.min(1, v.regR(t, r) / 0.6);
  const base = `color-mix(in oklab, var(--resist) ${Math.round(R * 100)}%, var(--reich))`;
  const lost = v.lost(t, r);
  const ally = REGIONS[r].kind === "ally";
  const held = ally ? `color-mix(in oklab, ${base} 55%, var(--surface))` : base;
  return lost > 0 ? `color-mix(in oklab, var(--danger) ${Math.round(lost * 100)}%, ${held})` : held;
}

export function MapView({ v }: { v: View }) {
  const t = useStore((s) => s.t);
  const sel = useStore((s) => s.region);
  const setRegion = useStore((s) => s.setRegion);
  const K = v.glob(t, GF.K);
  const rumpFill = K < 0 ? "var(--neutral)" : `color-mix(in oklab, var(--danger) ${Math.round(25 + 60 * K)}%, var(--neutral))`;
  return (
    <div className="map" style={{ display: "grid", gap: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Map of Europe in ${1941 + t}`}>
        <path d={OTHER_PATH} className="other" />
        <path d={SOVIET_PATH} style={{ fill: rumpFill, stroke: "var(--surface)", strokeWidth: 0.6 }}>
          <title>{K < 0 ? "No Soviet state survives" : `Soviet rump state, strength ${f2(K)}`}</title>
        </path>
        {NEUTRAL_PATHS.map((n) => <path key={n.name} d={n.d} className="neutral"><title>{n.name} (outside German Europe)</title></path>)}
        <path d={REICH_PATH} className="reich"><title>Greater German Reich</title></path>
        {REGIONS.map((reg, r) => {
          const lost = v.lost(t, r);
          return (
            <path key={reg.id} d={REGION_PATHS[r]} className={`rg${sel === r ? " sel" : ""}`} style={{ fill: fill(v, t, r) }}
              tabIndex={0} role="button" aria-label={`${reg.name}: ${v.mode === "avg" ? `lost in ${pct(lost)} of runs` : lost > 0.5 ? "lost" : "held"}`}
              onClick={() => setRegion(sel === r ? null : r)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRegion(sel === r ? null : r); } }}>
              <title>{`${reg.name} · armed strength ${f2(v.regR(t, r))} · ${v.mode === "avg" ? `lost in ${pct(lost)} of runs` : lost > 0.5 ? "lost" : v.contested(t, r) ? "contested" : "held"}`}</title>
            </path>
          );
        })}
        {REGIONS.map((reg, r) => {
          const [x, y] = REGION_CENTROIDS[r];
          const lost = v.lost(t, r);
          return (
            <g key={reg.id}>
              {lost >= 0.5 && <circle cx={x} cy={y} r={7} className="lostmark" />}
              {v.contested(t, r) && lost < 0.5 && <circle cx={x} cy={y} r={3.5} className="cont" />}
            </g>
          );
        })}
      </svg>
      <div className="maplegend">
        <span><i className="ramp" />held → armed resistance</span>
        <span><i style={{ background: "var(--danger)" }} />{v.mode === "avg" ? "share of runs lost" : "lost"}</span>
        <span><i style={{ background: "var(--core)" }} />Reich core</span>
        <span><i style={{ background: "var(--neutral)" }} />neutral</span>
        {v.mode === "run" && <span><i style={{ background: "var(--resist)", borderRadius: 6, width: 8, height: 8 }} />contested by a minority</span>}
        <span>Allies drawn fainter</span>
      </div>
    </div>
  );
}
