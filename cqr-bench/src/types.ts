export const FAILURE_MODES = ["none", "anaphora", "ellipsis", "topic_continuation", "topic_shift", "comparative", "clarification"] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];

export interface Turn {
  readonly role: "user";
  readonly text: string;
  readonly gold_rewrite: string;
  readonly failure_mode: FailureMode;
}

export interface Conversation {
  readonly conversation_id: string;
  readonly domain: string;
  readonly turns: readonly Turn[];
}

/** Structured rewrite the fine-tuned model is trained to emit: a standalone query plus metadata filters. */
export interface RewriteResult {
  readonly query: string;
  readonly filters: Readonly<Record<string, string>>;
}

export type Route = "cache" | "model";

export interface TurnRecord {
  readonly conversationId: string;
  readonly turnIndex: number;
  readonly failureMode: FailureMode;
  readonly route: Route;
  readonly latencyMs: number;
  readonly rewrite: string;
  readonly gold: string;
  readonly exactMatch: boolean;
}
