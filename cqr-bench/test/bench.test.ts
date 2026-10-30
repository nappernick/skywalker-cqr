import { describe, expect, test } from "bun:test";
import { QueryCache } from "../src/cache";
import { parseEvalSet } from "../src/eval-set";
import { buildFrame } from "../src/frame";
import { SimulatedModel, type RewriteModel } from "../src/model-client";
import { percentile, runBench } from "../src/runner";
import type { Conversation } from "../src/types";

const conv = (id: string, turns: [string, string, Conversation["turns"][number]["failure_mode"]][]): Conversation => ({
  conversation_id: id, domain: "travel",
  turns: turns.map(([text, gold_rewrite, failure_mode]) => ({ role: "user", text, gold_rewrite, failure_mode })),
});

describe("buildFrame", () => {
  test("first turn has no conversation block", () => expect(buildFrame("  ", "Per diem in NYC?")).toBe("Follow-up: Per diem in NYC?"));
  test("follow-up carries the previous turn", () =>
    expect(buildFrame("Per diem in NYC?", "And London?")).toBe("Conversation:\nUser: Per diem in NYC?\n\nFollow-up: And London?\n\nStandalone JSON:"));
});

describe("QueryCache", () => {
  test("normalizes case and whitespace", () => {
    const c = new QueryCache();
    c.put("a", "And  for London?", { query: "q", filters: {} });
    expect(c.get("A", " and for london? ")?.query).toBe("q");
  });
  test("same follow-up in a different context is a miss", () => {
    const c = new QueryCache();
    c.put("Per diem in NYC?", "And for London?", { query: "Per diem in London?", filters: {} });
    expect(c.get("Hotel cap in NYC?", "And for London?")).toBeUndefined();
  });
});

describe("percentile", () => {
  test("nearest rank", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 95)).toBe(4);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("parseEvalSet", () => {
  test("rejects unknown failure modes", () =>
    expect(() => parseEvalSet([{ conversation_id: "c", domain: "d", turns: [{ role: "user", text: "x", gold_rewrite: "y", failure_mode: "bogus" }] }])).toThrow(/failure_mode/));
  test("the shipped eval set is valid", async () => {
    const raw: unknown = await Bun.file(new URL("../data/eval/gold_standard_eval_set.json", import.meta.url).pathname).json();
    const set = parseEvalSet(raw);
    expect(set.length).toBe(50);
    expect(set.flatMap((c) => c.turns).length).toBe(150);
  });
});

describe("runBench", () => {
  test("repeats in the same context hit the cache; model sees the frame", async () => {
    const frames: string[] = [];
    const model: RewriteModel = { name: "spy", rewrite: async (frame, turn) => (frames.push(frame), { query: turn.gold_rewrite, filters: {} }) };
    const set = [
      conv("c1", [["Per diem NYC?", "Per diem NYC?", "none"], ["And London?", "Per diem London?", "ellipsis"]]),
      conv("c2", [["Per diem NYC?", "Per diem NYC?", "none"], ["And London?", "Per diem London?", "ellipsis"]]),
      conv("c3", [["Hotel cap NYC?", "Hotel cap NYC?", "none"], ["And London?", "Hotel cap London?", "ellipsis"]]),
    ];
    const r = await runBench(set, { model });
    expect(r.byRoute).toEqual({ model: 4, cache: 2 });
    expect(r.exactMatch).toBe(1);
    expect(frames[1]).toContain("User: Per diem NYC?");
    expect(r.records.at(-1)?.rewrite).toBe("Hotel cap London?");
  });
  test("simulated model on the shipped set", async () => {
    const raw: unknown = await Bun.file(new URL("../data/eval/gold_standard_eval_set.json", import.meta.url).pathname).json();
    const r = await runBench(parseEvalSet(raw), { model: new SimulatedModel(0) });
    expect(r.turns).toBe(150);
    expect(r.byRoute.model + r.byRoute.cache).toBe(150);
    expect(r.exactMatch).toBe(1);
  });
});
