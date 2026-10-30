import type {
  Basis, CensusSummary, Channel, Dataset, IntentRecord, IntentSpaceRecord, Month, Origin, Region, TicketRecord, TransitionRecord,
} from "./types";

/** One need: a ticket–intent row, with direct references to its intent's metadata and its ticket. */
export interface Need {
  readonly meta: IntentRecord;
  readonly channel: Channel;
  readonly basis: Basis;
  readonly ticket: Ticket;
}

export interface Ticket extends TicketRecord {
  readonly needs: readonly Need[];
  readonly anyAnswer: boolean;
}

export interface Index {
  readonly tickets: readonly Ticket[];
  readonly meta: ReadonlyMap<string, IntentRecord>;
  readonly months: readonly Month[];
  readonly regions: readonly Region[];
  readonly domains: readonly string[];
  readonly transitions: readonly TransitionRecord[];
  readonly space: ReadonlyMap<string, IntentSpaceRecord>;
  readonly census: CensusSummary | null;
}

export interface Filters {
  readonly region: Region | null;
  readonly origin: Origin | null;
  readonly from: Month | null;
  readonly to: Month | null;
  readonly domain: string | null;
  readonly channel: Channel | null;
  readonly intent: string | null;
}

export const NO_FILTERS: Filters = { region: null, origin: null, from: null, to: null, domain: null, channel: null, intent: null };

/** The filtered view every chart reads. `needs` holds only the rows that pass the need-level filters. */
export interface Model {
  readonly index: Index;
  readonly filters: Filters;
  readonly tickets: readonly Ticket[];
  readonly needs: readonly Need[];
  /** Months inside the from/to filter. */
  readonly months: readonly Month[];
}

export function buildIndex(data: Dataset): Index {
  const meta = new Map(data.intents.map((r) => [r.intent, r]));
  const rowsByK = new Map<number, Dataset["ticketIntents"][number][]>();
  for (const r of data.ticketIntents) {
    if (!meta.has(r.intent)) continue; // excluded intents (tests, internal tracking) are not demand
    const list = rowsByK.get(r.k);
    if (list) list.push(r);
    else rowsByK.set(r.k, [r]);
  }
  const tickets: Ticket[] = [];
  for (const rec of data.tickets) {
    const rows = rowsByK.get(rec.k) ?? [];
    const needs: Need[] = [];
    const ticket: Ticket = { ...rec, needs, anyAnswer: rows.some((r) => r.channel === "answer") };
    for (const r of rows) {
      const m = meta.get(r.intent);
      if (m) needs.push({ meta: m, channel: r.channel, basis: r.basis, ticket });
    }
    tickets.push(ticket);
  }
  const uniqSorted = <T extends string>(xs: Iterable<T>): T[] => [...new Set(xs)].sort();
  return {
    tickets, meta,
    months: uniqSorted(tickets.map((t) => t.month)),
    regions: uniqSorted(tickets.map((t) => t.region)),
    domains: uniqSorted(data.intents.map((r) => r.domain)),
    transitions: data.transitions,
    space: new Map(data.space.map((r) => [r.intent, r])),
    census: data.census,
  };
}

export function applyFilters(index: Index, f: Filters): Model {
  const needOk = (n: Need) => (f.domain === null || n.meta.domain === f.domain)
    && (f.channel === null || n.channel === f.channel) && (f.intent === null || n.meta.intent === f.intent);
  const needFilter = f.domain !== null || f.channel !== null || f.intent !== null;
  const tickets: Ticket[] = [];
  const needs: Need[] = [];
  for (const t of index.tickets) {
    if (f.region !== null && t.region !== f.region) continue;
    if (f.origin !== null && t.origin !== f.origin) continue;
    if (f.from !== null && t.month < f.from) continue;
    if (f.to !== null && t.month > f.to) continue;
    const keep = needFilter ? t.needs.filter(needOk) : t.needs;
    if (!keep.length) continue;
    tickets.push(t);
    needs.push(...keep);
  }
  const months = index.months.filter((m) => (f.from === null || m >= f.from) && (f.to === null || m <= f.to));
  return { index, filters: f, tickets, needs, months };
}
