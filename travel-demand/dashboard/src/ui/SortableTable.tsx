import { useState, type ReactNode } from "react";

export interface Column<T, K extends string> {
  readonly key: K;
  readonly label: string;
  readonly numeric?: boolean;
  readonly render: (row: T) => ReactNode;
  /** Omit to make the column unsortable. */
  readonly sort?: (row: T) => number | string;
}

interface SortState<K extends string> {
  readonly key: K;
  readonly dir: 1 | -1;
}

export function SortableTable<T, K extends string>(props: {
  readonly rows: readonly T[];
  readonly columns: readonly Column<T, K>[];
  readonly rowKey: (row: T) => string;
  readonly initial: SortState<K>;
  readonly onRowClick?: (row: T) => void;
  readonly empty?: ReactNode;
}) {
  const { rows, columns, rowKey, onRowClick } = props;
  const [sort, setSort] = useState<SortState<K>>(props.initial);
  const col = columns.find((c) => c.key === sort.key);
  const by = col?.sort;
  const sorted = by === undefined ? rows : [...rows].sort((a, b) => {
    const x = by(a);
    const y = by(b);
    return sort.dir * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
  });
  const click = (c: Column<T, K>) => {
    if (c.sort === undefined) return;
    setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.numeric ? -1 : 1 }));
  };
  if (!rows.length) return <div className="empty">{props.empty ?? "Nothing matches"}</div>;
  return (
    <div className="scroll">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? "num" : undefined} aria-sort={c.key === sort.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                {c.sort === undefined ? c.label : (
                  <button type="button" onClick={() => click(c)}>{c.label}{c.key === sort.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "clickable" : undefined}>
              {columns.map((c) => <td key={c.key} className={c.numeric ? "num" : undefined}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InlineBar(props: { readonly share: number; readonly color: string }) {
  return <div className="inline-bar" style={{ width: `${Math.max(0, Math.min(1, props.share)) * 100}%`, background: props.color }} />;
}
