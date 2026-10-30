# CQR bench

Measures the follow-up handling path: exact-match cache, then a rewrite model that turns a follow-up into a standalone query plus filters. TypeScript port of the original Java scaffold.

```bash
bun run bench                                  # from the repo root
bun cqr-bench/src/cli.ts --model-latency 45 --cache-latency 2 --budget 75 --json
```

- `src/runner.ts` runs every turn of every conversation in `data/eval/gold_standard_eval_set.json` (50 conversations, 150 turns) and reports routes, latency percentiles and exact-match against the gold rewrite by failure mode.
- `src/cache.ts` keys on the previous turn plus the current turn, so "And for London?" in one conversation never reuses another conversation's rewrite.
- `src/model-client.ts` defines `RewriteModel`. The shipped `SimulatedModel` sleeps a fixed latency and returns the gold rewrite: it measures routing and cache behaviour only, and its quality numbers are 100% by construction. Plug a real endpoint in by implementing `RewriteModel`.
- `python/` holds the SageMaker fine-tuning and Bedrock data-generation scaffolds (stubs).
