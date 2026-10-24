import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useStore } from "../store";
import { START, YEARS } from "../model/regions";
import { GROUPS } from "../model/groups";
import { CELLS_OF_GROUP } from "../model/cells";
import { CF, GF } from "../model/types";
import type { View } from "./view";
import { pct } from "./format";

const years = Array.from({ length: YEARS }, (_, t) => t);

export function ControlChart({ v }: { v: View }) {
  const agg = useStore((s) => s.agg)!;
  const t = useStore((s) => s.t);
  const setT = useStore((s) => s.setT);
  const W = 720, H = 240, m = { l: 40, r: 14, t: 12, b: 26 };
  const x = scaleLinear().domain([0, YEARS - 1]).range([m.l, W - m.r]);
  const y = scaleLinear().domain([0, 100]).range([H - m.b, m.t]);
  const band = area<number>().x((d) => x(d)).y0((d) => y(agg.control.p10[d])).y1((d) => y(agg.control.p90[d]))(years) ?? "";
  const med = line<number>().x((d) => x(d)).y((d) => y(agg.control.med[d]))(years) ?? "";
  const runLine = v.mode === "run" ? line<number>().x((d) => x(d)).y((d) => y(v.glob(d, GF.CTRL)))(years) ?? "" : "";
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Reich control of Europe</h2>
        <span className="status">median, with the middle 80% of runs shaded{v.mode === "run" ? "; this history in amber" : ""}</span>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Median control falls from ${Math.round(agg.control.med[0])}% in 1941 to ${Math.round(agg.control.med[YEARS - 1])}% in 1970`}
          onClick={(e) => {
            const b = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            setT(Math.max(0, Math.min(YEARS - 1, Math.round(x.invert(((e.clientX - b.left) / b.width) * W)))));
          }}>
          {[0, 25, 50, 75, 100].map((g) => <g key={g}><line className="grid" x1={m.l} x2={W - m.r} y1={y(g)} y2={y(g)} /><text x={m.l - 6} y={y(g) + 4} textAnchor="end">{g}%</text></g>)}
          {[0, 9, 19, 29].map((k) => <text key={k} x={x(k)} y={H - 6} textAnchor="middle">{START + k}</text>)}
          <path className="band" d={band} />
          <path className="line" d={med} />
          {runLine && <path className="line run" d={runLine} />}
          <line className="cursor" x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} />
        </svg>
      </div>
      <p className="chart-note">Control is the value-weighted share of Europe that Germany holds, discounted where armed resistance or strikes are strong. A run that collapses drops to zero. Click the chart to jump to a year.</p>
    </section>
  );
}

export function GroupMultiples({ v }: { v: View }) {
  const agg = useStore((s) => s.agg)!;
  const t = useStore((s) => s.t);
  const W = 140, H = 40;
  const x = scaleLinear().domain([0, YEARS - 1]).range([1, W - 1]);
  const y = scaleLinear().domain([0, 1]).range([H - 1, 1]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>How each people moves</h2>
        <span className="status">peak armed strength across the regions it lives in; dashed line marks a major force</span>
      </div>
      <div className="multiples">
        {GROUPS.map((g, gi) => {
          if (g.id === "vdt") return null;
          const series = years.map((k) => Math.max(...CELLS_OF_GROUP[gi].map((i) => v.cell(k, i, CF.R))));
          const d = line<number>().x((_, k) => x(k)).y((s) => y(s))(series) ?? "";
          const a = area<number>().x((_, k) => x(k)).y0(H - 1).y1((s) => y(s))(series) ?? "";
          return (
            <div key={g.id} className="mini">
              <div className="row"><span className="nm" title={g.name}>{g.name}</span><span className="meta">{series[t].toFixed(2)}</span></div>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                <path className="rb" d={a} />
                <line className="thr" x1={0} x2={W} y1={y(0.5)} y2={y(0.5)} />
                <path className="r" d={d} />
                <line className="cursor" x1={x(t)} x2={x(t)} y1={0} y2={H} />
              </svg>
              <span className="meta">major by 1945 in {pct(agg.groupBy1945[gi])}, ever in {pct(agg.groupMajor[gi])}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
