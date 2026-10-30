import type { ReactNode } from "react";
import type { Coverage } from "../domain/types";
import { COVERAGE_LABEL } from "./format";

export function Card(props: { readonly title: string; readonly sub?: ReactNode; readonly wide?: boolean; readonly children: ReactNode }) {
  return (
    <article className={props.wide ? "card wide" : "card"}>
      <h2>{props.title}</h2>
      {props.sub !== undefined && <p className="sub">{props.sub}</p>}
      {props.children}
    </article>
  );
}

export function Kpi(props: { readonly label: string; readonly value: string; readonly note: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{props.label}</span>
      <span className="kpi-value">{props.value}</span>
      <span className="kpi-note">{props.note}</span>
    </div>
  );
}

export function Empty(props: { readonly children: ReactNode }) {
  return <div className="empty">{props.children}</div>;
}

export interface SegOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export function Segmented<T extends string>(props: { readonly label: string; readonly options: readonly SegOption<T>[]; readonly value: T; readonly onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      <span className="seg-label">{props.label}</span>
      {props.options.map((o) => (
        <button key={o.value} type="button" className="btn" aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function CoveragePill(props: { readonly coverage: Coverage | null }) {
  if (props.coverage === null) return <span>—</span>;
  return <span className={`pill ${props.coverage}`}>{COVERAGE_LABEL[props.coverage]}</span>;
}

export interface LegendItem {
  readonly key: string;
  readonly label: string;
  readonly color: string;
}

export function Legend(props: { readonly label: string; readonly items: readonly LegendItem[] }) {
  return (
    <ul className="legend" aria-label={props.label}>
      {props.items.map((i) => <li key={i.key}><span className="swatch" style={{ background: i.color }} />{i.label}</li>)}
    </ul>
  );
}
