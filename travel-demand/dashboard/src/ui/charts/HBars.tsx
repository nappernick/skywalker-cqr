import { scaleLinear } from "d3";
import { useWidth } from "../hooks";
import { fitText, textWidth } from "../measure";
import { fmtInt, pct } from "../format";
import { useTooltip, type TipContent } from "../Tooltip";
import { useTheme } from "../theme";

export interface Segment<K extends string> {
  readonly key: K;
  readonly v: number;
}

export interface BarItem<K extends string, Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly total: number;
  readonly segs: readonly Segment<K>[];
  readonly tip?: TipContent;
}

export interface HBarsProps<K extends string, Id extends string> {
  readonly items: readonly BarItem<K, Id>[];
  readonly keys: readonly K[];
  readonly color: (k: K) => string;
  readonly keyLabel: (k: K) => string;
  readonly rowH?: number;
  readonly value?: (d: BarItem<K, Id>) => string;
  readonly max?: number;
  readonly picked?: Id | null;
  readonly onPick?: (id: Id) => void;
  readonly labelShare?: number;
}

/** Horizontal bars, optionally stacked by segment key, with click-to-filter rows. */
export function HBars<K extends string, Id extends string = string>(props: HBarsProps<K, Id>) {
  const { items, keys, color, keyLabel, rowH = 24, max, picked = null, onPick, labelShare = 0.42 } = props;
  const value = props.value ?? ((d: BarItem<K, Id>) => fmtInt(d.total));
  const [ref, w] = useWidth<HTMLDivElement>();
  const tip = useTooltip(ref);
  const theme = useTheme();
  const h = items.length * rowH + 4;
  const longest = Math.max(0, ...items.map((d) => textWidth(d.label)));
  const L = Math.min(longest, w * labelShare) + 10;
  const valW = Math.max(0, ...items.map((d) => textWidth(value(d))));
  const x = scaleLinear().domain([0, max ?? Math.max(1, ...items.map((d) => d.total))]).range([L, w - valW - 10]);
  const defaultTip = (d: BarItem<K, Id>): TipContent => ({
    title: d.label,
    lines: d.segs.filter((s) => s.v).map((s) => `${keyLabel(s.key)}: ${fmtInt(s.v)} (${pct(s.v / (d.total || 1))})`),
  });
  return (
    <div className="chart" ref={ref}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={items.map((d) => `${d.label} ${value(d)}`).join("; ")}>
        {items.map((d, i) => {
          let acc = 0;
          return (
            <g key={d.id} transform={`translate(0,${i * rowH})`}>
              <text x={L - 10} y={rowH / 2} dy="0.35em" textAnchor="end" fill={theme.fg} fontWeight={d.id === picked ? 600 : 400}>{fitText(d.label, L - 10)}</text>
              {keys.map((k) => {
                const seg = d.segs.find((s) => s.key === k);
                if (!seg || !seg.v) return null;
                const x0 = x(acc);
                acc += seg.v;
                return <rect key={k} x={x0} y={4} height={rowH - 8} width={Math.max(0, x(acc) - x0)} fill={color(k)} />;
              })}
              <text x={x(d.total) + 6} y={rowH / 2} dy="0.35em" fill={theme.fgMuted}>{value(d)}</text>
              <rect className="hit" x={0} y={0} width={w} height={rowH} style={{ cursor: onPick ? "pointer" : "default" }}
                onMouseMove={(e) => tip.show(e, d.tip ?? defaultTip(d))} onMouseLeave={tip.hide} onClick={() => onPick?.(d.id)} />
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}
