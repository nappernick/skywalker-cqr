import { useCallback, useEffect, useState } from "react";
import { NO_FILTERS, type Filters, type Index } from "../domain/model";
import { CHANNELS, ORIGINS, REGIONS, type Month } from "../domain/types";

export type FilterKey = keyof Filters;
export const FILTER_KEYS: readonly FilterKey[] = ["region", "origin", "from", "to", "domain", "channel", "intent"];

const pick = <const T extends readonly string[]>(values: T, v: string | null): T[number] | null => values.find((x) => x === v) ?? null;

/** Reads filters from the URL query, dropping any value the data does not contain. */
export function readFilters(search: string, index: Index): Filters {
  const q = new URLSearchParams(search);
  const month = (v: string | null): Month | null => index.months.find((m) => m === v) ?? null;
  const domain = q.get("domain");
  const intent = q.get("intent");
  return {
    region: pick(REGIONS, q.get("region")),
    origin: pick(ORIGINS, q.get("origin")),
    from: month(q.get("from")),
    to: month(q.get("to")),
    domain: domain !== null && index.domains.includes(domain) ? domain : null,
    channel: pick(CHANNELS, q.get("channel")),
    intent: intent !== null && index.meta.has(intent) ? intent : null,
  };
}

function writeFilters(f: Filters): void {
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v !== null) q.set(k, v);
  }
  const s = q.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}${window.location.hash}`);
}

export interface FilterApi {
  readonly filters: Filters;
  readonly set: (patch: Partial<Filters>) => void;
  /** Sets the key to `value`, or clears it if it already has that value. */
  readonly toggle: <K extends FilterKey>(key: K, value: Filters[K]) => void;
  readonly reset: () => void;
}

export function useFilters(index: Index): FilterApi {
  const [filters, setFilters] = useState<Filters>(() => readFilters(window.location.search, index));
  useEffect(() => writeFilters(filters), [filters]);
  const set = useCallback((patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })), []);
  const toggle = useCallback(<K extends FilterKey>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }));
  }, []);
  const reset = useCallback(() => setFilters(NO_FILTERS), []);
  return { filters, set, toggle, reset };
}
