import { interpolateRgb, scaleBand } from "d3";
import { fmtInt, pct } from "../format";
import { useWidth } from "../hooks";
import { fitText, textWidth } from "../measure";
import { seriesColor, useTheme } from "../theme";
import { useTooltip } from "../Tooltip";

export interface HeatRow<C extends string> {
  readonly id: string;
  readonly label: string;
  readonly n: number;
  readonly values: Readonly<Partial<Record<C, number>>>;
}

/** Row-normalised shares as a heatmap: each row is a distribution over the columns. */
export function Heatmap<C extends string>(props: { readonly rows: readonly HeatRow<C>[]; readonly cols: readonly C[]; readonly colLabel: (c: C) => string; readonly cellH?: number }) {
  const { rows, cols, colLabel, cellH = 22 } = props;
  const [ref, w] = useWidth<HTMLDivElement>(320);
  const tip = useTooltip(ref);
  const theme = useTheme();
  const top = 30;
  const h = rows.length * cellH + top + 4;
  const L = Math.min(Math.max(0, ...rows.map((r) => textWidth(r.label))), w * 0.34) + 10;
  const x = scaleBand<C>().domain(cols).range([L, w]).padding(0.06);
  const ramp = interpolateRgb(theme.panel, seriesColor(theme, 0));
  return (
    <div className="chart" ref={ref}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Share heatmap">
        {cols.map((c) => <text key={c} x={(x(c) ?? 0) + x.bandwidth() / 2} y={top - 10} textAnchor="middle" fill={theme.fgMuted}>{fitText(colLabel(c), x.bandwidth() - 2)}</text>)}
        {rows.map((r, i) => (
          <g key={r.id} transform={`translate(0,${top + i * cellH})`}>
            <text x={L - 10} y={cellH / 2} dy="0.35em" textAnchor="end" fill={theme.fg}>{fitText(r.label, L - 10)}</text>
            {cols.map((c) => {
              const v = r.values[c] ?? 0;
              return (
                <g key={c}>
                  <rect x={x(c) ?? 0} y={2} width={x.bandwidth()} height={cellH - 4} rx={2} fill={ramp(Math.min(1, v * 1.4))}
                    onMouseMove={(e) => tip.show(e, { title: r.label, lines: [`${colLabel(c)}: ${pct(v)} of ${fmtInt(r.n)} tickets`] })} onMouseLeave={tip.hide} />
                  {v >= 0.05 && x.bandwidth() >= 30 && (
                    <text x={(x(c) ?? 0) + x.bandwidth() / 2} y={cellH / 2} dy="0.35em" textAnchor="middle" pointerEvents="none" fill={v > 0.45 ? theme.bg : theme.fg}>{pct(v)}</text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      {tip.node}
    </div>
  );
}
