import {
  ANSWER_CLASSES, BASES, CENSUS_LABELS, CHANNELS, COVERAGES, ORIGINS, REGIONS, RESOLUTIONS,
  type CensusSummary, type IntentRecord, type IntentSpaceRecord, type IsoDate, type Month, type Neighbour,
  type TicketIntentRecord, type TicketRecord, type TransitionRecord,
} from "./types";

/** Thrown with the JSON path of the first value that does not match the expected shape. */
export class ParseError extends Error {
  override readonly name = "ParseError";
}

type Obj = Readonly<Record<string, unknown>>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function obj(v: unknown, path: string): Obj {
  if (!isObj(v)) throw new ParseError(`${path}: expected an object`);
  return v;
}

function str(o: Obj, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new ParseError(`${path}.${key}: expected a string`);
  return v;
}

/** Empty strings and nulls become null; anything else must be a string. */
function optStr(o: Obj, key: string, path: string): string | null {
  const v = o[key];
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") throw new ParseError(`${path}.${key}: expected a string or null`);
  return v;
}

function num(o: Obj, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ParseError(`${path}.${key}: expected a finite number`);
  return v;
}

function int(o: Obj, key: string, path: string): number {
  const v = num(o, key, path);
  if (!Number.isInteger(v)) throw new ParseError(`${path}.${key}: expected an integer`);
  return v;
}

/** Booleans exported by pandas as true/false or 0/1. */
function flag(o: Obj, key: string, path: string): boolean {
  const v = o[key];
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  throw new ParseError(`${path}.${key}: expected a boolean or 0/1`);
}

function oneOf<const T extends readonly string[]>(values: T, o: Obj, key: string, path: string): T[number] {
  const v = o[key];
  const hit = values.find((x) => x === v);
  if (hit === undefined) throw new ParseError(`${path}.${key}: ${JSON.stringify(v)} is not one of ${values.join(", ")}`);
  return hit;
}

function optOneOf<const T extends readonly string[]>(values: T, o: Obj, key: string, path: string): T[number] | null {
  const v = o[key];
  return v === null || v === undefined || v === "" ? null : oneOf(values, o, key, path);
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isMonth(v: string): v is Month {
  return MONTH.test(v);
}
function isIsoDate(v: string): v is IsoDate {
  return DATE.test(v);
}

function month(o: Obj, key: string, path: string): Month {
  const v = str(o, key, path);
  if (!isMonth(v)) throw new ParseError(`${path}.${key}: expected YYYY-MM, got ${JSON.stringify(v)}`);
  return v;
}

/** Accepts a month or a full date and keeps the month part. */
function optMonthPrefix(o: Obj, key: string, path: string): Month | null {
  const v = optStr(o, key, path);
  if (v === null) return null;
  const m = v.slice(0, 7);
  if (!isMonth(m)) throw new ParseError(`${path}.${key}: expected a date starting YYYY-MM, got ${JSON.stringify(v)}`);
  return m;
}

function isoDate(o: Obj, key: string, path: string): IsoDate {
  const v = str(o, key, path);
  if (!isIsoDate(v)) throw new ParseError(`${path}.${key}: expected YYYY-MM-DD, got ${JSON.stringify(v)}`);
  return v;
}

function list<T>(raw: unknown, name: string, row: (o: Obj, path: string) => T): T[] {
  if (!Array.isArray(raw)) throw new ParseError(`${name}: expected an array`);
  return raw.map((v, i) => {
    const path = `${name}[${i}]`;
    return row(obj(v, path), path);
  });
}

export const parseTickets = (raw: unknown): TicketRecord[] =>
  list(raw, "tickets", (o, p) => ({
    k: int(o, "k", p),
    month: month(o, "month", p),
    week: isoDate(o, "week", p),
    region: oneOf(REGIONS, o, "region", p),
    country: str(o, "country", p),
    origin: oneOf(ORIGINS, o, "origin", p),
    resolution: oneOf(RESOLUTIONS, o, "resolution", p),
    tier2plus: flag(o, "tier2plus", p),
    third_party: flag(o, "third_party", p),
    days: num(o, "days", p),
    repeat30: flag(o, "repeat30", p),
    not_on_river: flag(o, "not_on_river", p),
    channel: oneOf(CHANNELS, o, "channel", p),
    n_intents: int(o, "n_intents", p),
    topic: optStr(o, "topic", p),
    census: optOneOf(CENSUS_LABELS, o, "census", p),
  }));

export const parseTicketIntents = (raw: unknown): TicketIntentRecord[] =>
  list(raw, "ticket_intents", (o, p) => ({
    k: int(o, "k", p),
    intent: str(o, "intent", p),
    channel: oneOf(CHANNELS, o, "channel", p),
    basis: oneOf(BASES, o, "basis", p),
  }));

export const parseIntents = (raw: unknown): IntentRecord[] =>
  list(raw, "intents", (o, p) => ({
    intent: str(o, "intent", p),
    name: str(o, "name", p),
    domain: str(o, "domain", p),
    faq_question: str(o, "faq_question", p),
    answer_class: oneOf(ANSWER_CLASSES, o, "answer_class", p),
    best_channel: oneOf(CHANNELS, o, "best_channel", p),
    agent_capability: optStr(o, "agent_capability", p),
    coverage: optOneOf(COVERAGES, o, "coverage", p),
    gap: optStr(o, "gap", p) ?? "",
    faq_titles: optStr(o, "faq_titles", p) ?? "",
    faq_available_from: optMonthPrefix(o, "faq_available_from", p),
  }));

export const parseTransitions = (raw: unknown): TransitionRecord[] =>
  list(raw, "transitions", (o, p) => ({
    from_intent: str(o, "from_intent", p),
    next_intent_30d: str(o, "next_intent_30d", p),
    transitions: int(o, "transitions", p),
    same_intent: flag(o, "same_intent", p),
  }));

function parseNeighbour(v: unknown, path: string): Neighbour {
  const o = obj(v, path);
  return { intent: str(o, "intent", path), sim: num(o, "sim", path) };
}

export const parseSpace = (raw: unknown): IntentSpaceRecord[] =>
  list(raw, "intent_space", (o, p) => {
    const terms = o["terms"];
    const nearest = o["nearest"];
    if (!Array.isArray(terms) || !terms.every((t): t is string => typeof t === "string")) throw new ParseError(`${p}.terms: expected string[]`);
    if (!Array.isArray(nearest)) throw new ParseError(`${p}.nearest: expected an array`);
    return { intent: str(o, "intent", p), x: num(o, "x", p), y: num(o, "y", p), terms, nearest: nearest.map((n, i) => parseNeighbour(n, `${p}.nearest[${i}]`)) };
  });

export function parseCensus(raw: unknown): CensusSummary {
  const p = "census";
  const o = obj(raw, p);
  return {
    tickets: int(o, "tickets", p), signatures: int(o, "signatures", p),
    answerable: int(o, "answerable", p), answerable_share: num(o, "answerable_share", p),
    strict_answerable: int(o, "strict_answerable", p), loose_answerable: int(o, "loose_answerable", p),
    agreement_signatures: num(o, "agreement_signatures", p), agreement_tickets: num(o, "agreement_tickets", p),
    kappa: num(o, "kappa", p), adjudicated_signatures: int(o, "adjudicated_signatures", p),
  };
}

/** Validating constructor for month constants in code. */
export function toMonth(v: string): Month {
  if (!isMonth(v)) throw new ParseError(`invalid month constant ${JSON.stringify(v)}`);
  return v;
}
