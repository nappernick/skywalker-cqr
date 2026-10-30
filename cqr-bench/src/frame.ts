/**
 * Builds the compact conversational frame the rewrite model sees: the immediately preceding user turn
 * and the current turn, not the whole transcript.
 */
export function buildFrame(previousQuery: string, currentQuery: string): string {
  const prev = previousQuery.trim();
  const cur = currentQuery.trim();
  if (!prev) return `Follow-up: ${cur}`;
  return `Conversation:\nUser: ${prev}\n\nFollow-up: ${cur}\n\nStandalone JSON:`;
}
