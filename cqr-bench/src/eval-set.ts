import { FAILURE_MODES, type Conversation, type FailureMode, type Turn } from "./types";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFailureMode = (v: unknown): v is FailureMode => (FAILURE_MODES as readonly unknown[]).includes(v);

function parseTurn(v: unknown, where: string): Turn {
  if (!isRecord(v)) throw new Error(`${where}: turn is not an object`);
  const { role, text, gold_rewrite, failure_mode } = v;
  if (role !== "user") throw new Error(`${where}: role must be "user"`);
  if (typeof text !== "string" || !text.trim()) throw new Error(`${where}: text must be a non-empty string`);
  if (typeof gold_rewrite !== "string" || !gold_rewrite.trim()) throw new Error(`${where}: gold_rewrite must be a non-empty string`);
  if (!isFailureMode(failure_mode)) throw new Error(`${where}: unknown failure_mode ${JSON.stringify(failure_mode)}`);
  return { role, text, gold_rewrite, failure_mode };
}

/** Validates the eval set shape so a malformed file fails loudly instead of skewing the bench. */
export function parseEvalSet(raw: unknown): Conversation[] {
  if (!Array.isArray(raw)) throw new Error("eval set must be a JSON array of conversations");
  return raw.map((c, i) => {
    if (!isRecord(c)) throw new Error(`conversation ${i} is not an object`);
    const { conversation_id, domain, turns } = c;
    if (typeof conversation_id !== "string") throw new Error(`conversation ${i}: conversation_id must be a string`);
    if (typeof domain !== "string") throw new Error(`${conversation_id}: domain must be a string`);
    if (!Array.isArray(turns) || !turns.length) throw new Error(`${conversation_id}: turns must be a non-empty array`);
    return { conversation_id, domain, turns: turns.map((t, j) => parseTurn(t, `${conversation_id} turn ${j}`)) };
  });
}

export async function loadEvalSet(path: string): Promise<Conversation[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`eval set not found: ${path}`);
  return parseEvalSet(await file.json());
}
