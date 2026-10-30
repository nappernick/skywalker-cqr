import { useCallback, useState, type ReactNode, type RefObject } from "react";

export interface TipContent {
  readonly title: string;
  readonly lines: readonly string[];
}

interface TipState extends TipContent {
  readonly x: number;
  readonly y: number;
}

export interface TooltipApi {
  readonly show: (e: { readonly clientX: number; readonly clientY: number }, content: TipContent) => void;
  readonly hide: () => void;
  readonly node: ReactNode;
}

/** A tooltip positioned inside `anchor`, which must be `position: relative`. */
export function useTooltip(anchor: RefObject<HTMLElement>): TooltipApi {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback((e: { readonly clientX: number; readonly clientY: number }, c: TipContent) => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const x = Math.max(0, Math.min(box.width - 280, e.clientX - box.left + 12));
    setTip({ ...c, x, y: e.clientY - box.top + 14 });
  }, [anchor]);
  const hide = useCallback(() => setTip(null), []);
  const node = tip ? (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="status">
      <div className="tip-title">{tip.title}</div>
      {tip.lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  ) : null;
  return { show, hide, node };
}
