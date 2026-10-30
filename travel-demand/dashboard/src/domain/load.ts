import { parseCensus, parseIntents, parseSpace, parseTicketIntents, parseTickets, parseTransitions } from "./parse";
import type { Dataset } from "./types";

async function fetchJson(base: string, name: string, optional: true): Promise<unknown | null>;
async function fetchJson(base: string, name: string, optional?: false): Promise<unknown>;
async function fetchJson(base: string, name: string, optional = false): Promise<unknown | null> {
  const res = await fetch(`${base}${name}.json`);
  if (!res.ok) {
    if (optional && res.status === 404) return null;
    throw new Error(`${name}.json: HTTP ${res.status}`);
  }
  const body: unknown = await res.json();
  return body;
}

/** Loads and validates every dataset the dashboard reads; any shape mismatch rejects with the offending path. */
export async function loadDataset(base: string): Promise<Dataset> {
  const [tickets, ticketIntents, intents, transitions, space, census] = await Promise.all([
    fetchJson(base, "tickets"), fetchJson(base, "ticket_intents"), fetchJson(base, "intents"),
    fetchJson(base, "transitions"), fetchJson(base, "intent_space"), fetchJson(base, "census", true),
  ]);
  return {
    tickets: parseTickets(tickets),
    ticketIntents: parseTicketIntents(ticketIntents),
    intents: parseIntents(intents),
    transitions: parseTransitions(transitions),
    space: parseSpace(space),
    census: census === null ? null : parseCensus(census),
  };
}
