import type { RewriteResult } from "./types";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Exact-match rewrite cache. The key is the preceding turn plus the current turn: a follow-up such as
 * "And for London?" means different things in different conversations, so the turn text alone is not a safe key.
 */
export class QueryCache {
  readonly #entries = new Map<string, RewriteResult>();

  static key(previousQuery: string, query: string): string {
    return `${norm(previousQuery)}␞${norm(query)}`;
  }

  get(previousQuery: string, query: string): RewriteResult | undefined {
    return this.#entries.get(QueryCache.key(previousQuery, query));
  }

  put(previousQuery: string, query: string, result: RewriteResult): void {
    this.#entries.set(QueryCache.key(previousQuery, query), result);
  }

  get size(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
  }
}
