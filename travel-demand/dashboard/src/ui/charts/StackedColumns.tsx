import { scaleBand, scaleLinear, stack } from "d3";
import { useState, type PointerEvent } from "react";
import type { Month } from "../../domain/types";
import { fmtInt, fmtMonth } from "../format";
import { useWidth } from "../hooks";
import { textWidth } from "../measure";
import { useTooltip } from "../Tooltip";
import { useTheme } from "../theme";

export interface MonthMarker {
  readonly month: Month;
  readonly label: string;
}

export interface StackedColumnsProps<K extends string> {
  readonly months: readonly Month[];
  readonly keys: readonly K[];
  readonly value: (month: Month, key: K) => number;
  readonly color: (k: K) => string;
  readonly keyLabel: (k: K) => string;
  readonly unit: string;
  readonly height?: number;
  readonly markers?: readonly MonthMarker[];
  /** When set, dragging across months selects a range. */
  readonly onBrush?: (from: Month, to: Month) => void;
}

/** Monthly stacked columns with event markers, hover detail and an optional drag-to-select range. */
export function StackedColumns<K extends string>(props: StackedColumnsProps<K>) {
  const { months, keys, value, color, keyLabel, unit, height = 280, markers = [], onBrush } = props;
  const [ref, w] = useWidth<HTMLDivElement>(300);
  const tip = useTooltip(ref);
  const theme = useTheme();
  const [drag, setDrag] = useState<{ readonly a: number; readonly b: number } | null>(null);

  const totals = months.map((m) => keys.reduce((s, k) => s + value(m, k), 0));
  const ymax = Math.max(1, ...totals);
  const left = textWidth(fmtInt(ymax)) + 10;
  const top = markers.length ? 34 : 14;
  const bottom = height - 24;
  const x = scaleBand<Month>().domain(months).range([left, w - 4]).padding(0.25);
  const y = scaleLinear().domain([0, ymax]).range([bottom, top]).nice();
  const series = stack<Month, K>().keys(keys).value((m, k) => value(m, k))(months);
  const every = Math.ceil(months.length / Math.max(1, Math.floor(w / 64)));
  const centre = (m: Month) => (x(m) ?? 0) + x.bandwidth() / 2;
  const at = (px: number): Month | undefined => months.find((m) => px >= (x(m) ?? 0) && px <= (x(m) ?? 0) + x.bandwidth());
  const localX = (e: PointerEvent<SVGRectElement>) => e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left ?? 0);

  const placed: { x1: number; x2: number; row: number }[] = [];
  const markerEls = markers.filter((mk) => months.includes(mk.month)).map((mk) => {
    const cx = centre(mk.month);
    const tw = textWidth(mk.label);
    const tx = Math.max(0, Math.min(w - tw, cx - tw / 2));
    let row = 0;
    while (placed.some((p) => p.row === row && tx < p.x2 + 8 && tx + tw > p.x1 - 8)) row += 1;
    placed.push({ x1: tx, x2: tx + tw, row });
    return (
      <g key={mk.month}>
        <line x1={cx} x2={cx} y1={top - 6} y2={bottom} stroke={theme.reference} strokeDasharray="3 3" />
        <text x={tx} y={12 + row * 14} fill={theme.fgMuted}>{mk.label}</text>
      </g>
    );
  });

  const showTip = (e: PointerEvent<SVGRectElement>) => {
    const m = at(localX(e));
    if (m === undefined) { tip.hide(); return; }
    const i = months.indexOf(m);
    tip.show(e, { title: `${fmtMonth(m)} · ${fmtInt(totals[i] ?? 0)} ${unit}`, lines: keys.filter((k) => value(m, k)).map((k) => `${keyLabel(k)}: ${fmtInt(value(m, k))}`) });
  };

  return (
    <div className="chart" ref={ref}>
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`${unit} per month`}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={left} x2={w} y1={y(t)} y2={y(t)} stroke={theme.grid} />
            <text x={left - 6} y={y(t)} dy="0.35em" textAnchor="end" fill={theme.fgMuted}>{fmtInt(t)}</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.key} fill={color(s.key)}>
            {s.map((d) => <rect key={d.data} x={x(d.data) ?? 0} width={x.bandwidth()} y={y(d[1])} height={Math.max(0, y(d[0]) - y(d[1]))} />)}
          </g>
        ))}
        {months.filter((_, i) => i % every === 0).map((m) => <text key={m} x={centre(m)} y={height - 6} textAnchor="middle" fill={theme.fgMuted}>{fmtMonth(m)}</text>)}
        {markerEls}
        {drag && <rect x={Math.min(drag.a, drag.b)} width={Math.abs(drag.b - drag.a)} y={top} height={bottom - top} fill={theme.reference} fillOpacity={0.15} stroke={theme.reference} />}
        <rect x={left} y={top} width={Math.max(0, w - 4 - left)} height={bottom - top} fill="transparent" style={{ cursor: onBrush ? "crosshair" : "default", touchAction: "none" }}
          onPointerDown={(e) => { if (!onBrush) return; e.currentTarget.setPointerCapture(e.pointerId); const px = localX(e); setDrag({ a: px, b: px }); }}
          onPointerMove={(e) => { showTip(e); if (drag) setDrag({ a: drag.a, b: localX(e) }); }}
          onPointerUp={() => {
            if (drag && onBrush && Math.abs(drag.b - drag.a) > 4) {
              const [a, b] = [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)];
              const picked = months.filter((m) => centre(m) >= a && centre(m) <= b);
              const first = picked[0];
              const last = picked.at(-1);
              if (first !== undefined && last !== undefined) onBrush(first, last);
            }
            setDrag(null);
          }}
          onPointerLeave={tip.hide} />
      </svg>
      {tip.node}
    </div>
  );
}
