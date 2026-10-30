# Skywalker CQR Benchmark

A local-runnable Java harness that measures end-to-end latency, retrieval quality, and rewrite quality for **three competing conversational query rewriting (CQR) architectures** in front of a Cohere + OpenSearch + Bedrock RAG stack.

The goal: produce a defensible, measured comparison of three architectures so the Skywalker team can pick one for production. This is not the production system. This is the bench.

---

## What this measures

Three architectures, each handling the "and what about my hotel room?"-style follow-up problem differently. Each is exercised against a fixed eval set of 50 three-turn conversations spanning the six failure-mode categories (anaphora, ellipsis, topic continuation, topic shift, comparative, clarification).

For each (architecture × conversation × turn), we record:

- **Latency**: P50, P95, P99 per stage (gate, cache, rewrite, embed, retrieve, rerank) and end-to-end.
- **Retrieval quality**: NDCG@5, Recall@10, MRR against hand-labeled relevant FAQ IDs.
- **Rewrite quality**: ROUGE-1/2/L and BLEU vs. hand-authored gold rewrites (where applicable).
- **Cost**: per-query Bedrock spend (input + output tokens, cached vs. uncached).
- **Failure-mode breakdown**: per-turn-type metrics, so we can see whether one architecture wins on topic shifts but loses on ellipsis.

Budget target for end-to-end retrieval: **400ms P50, 600ms P99**.

---

## The three architectures

### Arch A — `history-concat-baseline`

The cheapest viable baseline. No rewriter. No gate. Concatenate the last 2 user turns to the current turn, embed the concatenation, retrieve, rerank with conversation-context-augmented query string.

**Components**:
- Cohere Embed v4 (Bedrock, `cohere.embed-v4`)
- OpenSearch Serverless hybrid (k-NN + BM25)
- Cohere Rerank 3.5 (Bedrock, `cohere.rerank-v3-5:0`) with query format: `"[Recent context: <last user turn>] <current turn>"`

**Hypothesis**: Wins on latency (no rewrite stage). Loses on topic shifts (history poisons embedding). Sets the floor; anything more complex must beat this on quality by enough to justify added complexity.

### Arch B — `gate-plus-flant5-inferentia`

The "optimal serial" architecture from the design discussion. Heuristic gate routes standalone turns around the rewriter; fine-tuned FLAN-T5-base on Inferentia2 handles follow-ups; DynamoDB exact-match cache short-circuits repeats.

**Components**:
- Lambda gate: pronoun regex + length + named-entity presence (Comprehend, async-cached) + cosine-to-previous-turn for topic-shift detection
- DynamoDB cache: `(sessionId, sha256(last_2_turns + current))` → rewritten query, 5-min TTL
- SageMaker real-time endpoint, ml.inf2.xlarge, FLAN-T5-base (~250M params) fine-tuned on synthetic CANARD/QReCC + Sonnet-4.6-generated Skywalker-domain triples
- Cohere Embed v4 → OpenSearch → Rerank 3.5

**Hypothesis**: Best balance of latency and quality. ~25-40ms rewrite warm; cache hits ~5ms. Critical path ~190-220ms P50.

### Arch C — `parallel-haiku-speculative`

The "frontier-model rewriter" architecture, with parallelism hiding its latency. Raw-query retrieval fires immediately; Claude Haiku 4.5 rewrite runs concurrently with prompt caching; whichever returns useful results inside budget wins. Rewrites are persisted for the next turn.

**Components**:
- Same gate as Arch B (skip when standalone)
- Branch A (always): raw-query → Embed v4 → OpenSearch → Rerank 3.5
- Branch B (parallel): Bedrock Converse with `claude-haiku-4-5`, `performanceConfig.latency = "optimized"`, system prompt + few-shot examples cached with `cache_control` 1-hour TTL
- Race/merge: if rewrite arrives before the Branch A reranker finishes, swap in rewritten query and re-rerank. Otherwise persist rewrite to DynamoDB cache for turn N+1 (predictive pre-fetch).

**Hypothesis**: Highest rewrite quality. P50 latency comparable to Arch A because the rewrite is off the critical path. P99 risk: tail latency of Bedrock blows the merge window. Cost: pays per-call Bedrock pricing on every follow-up.

---

## Architecture comparison summary

| Dimension | Arch A | Arch B | Arch C |
|---|---|---|---|
| Rewriter | None | FLAN-T5-base on inf2 | Claude Haiku 4.5 on Bedrock |
| Rewrite latency P50 | 0ms | ~30ms | ~700-900ms (off critical path) |
| Critical-path P50 estimate | ~150ms | ~195ms | ~155ms (raw branch) |
| Critical-path P99 estimate | ~250ms | ~290ms | ~350ms (race window) |
| Rewrite quality | N/A | ~80% of frontier | ~95% of frontier |
| Per-query cost (follow-up) | ~$0.0008 | ~$0.0008 + $0.025/hr endpoint | ~$0.003-0.005 |
| Ops complexity | Low | Medium (SageMaker endpoint, fine-tuning) | Low (managed) |

---

## Repository layout

```
cqr-bench/
├── README.md                          # this file
├── pom.xml                            # Java 21, Maven, AWS SDK v2
├── infra/
│   ├── cdk/                           # AWS CDK (Java) for: OpenSearch Serverless,
│   │                                  # DynamoDB tables, IAM roles, SageMaker endpoint
│   ├── opensearch/
│   │   ├── index-mapping.json         # 1536-dim vector + BM25 fields + metadata
│   │   └── search-pipeline.json       # hybrid normalization processor
│   └── sagemaker/
│       ├── flant5-finetune.ipynb      # JumpStart fine-tune notebook (Python; one-time)
│       ├── deploy-inf2.py             # Deploy to ml.inf2.xlarge with Neuron compile
│       └── model_artifacts/           # output of fine-tune (gitignored)
├── data-gen/
│   ├── corpus/
│   │   └── synthetic-te-faqs.jsonl    # 200 synthetic T&E FAQ entries (gen by Sonnet 4.6)
│   ├── eval/
│   │   ├── conversations.jsonl        # 50 three-turn conversations + gold rewrites + relevant doc IDs
│   │   └── README.md                  # how the eval set was constructed
│   └── generate.py                    # one-shot script to produce both above via Bedrock
├── src/main/java/com/skywalker/cqr/
│   ├── App.java                       # entrypoint; CLI: --arch {A|B|C} --eval-set <path>
│   ├── arch/
│   │   ├── Architecture.java          # interface: handleTurn(Conversation, Turn) -> Result
│   │   ├── ArchA_HistoryConcat.java
│   │   ├── ArchB_GateFlanT5.java
│   │   └── ArchC_ParallelHaiku.java
│   ├── retrieval/
│   │   ├── BedrockEmbedder.java       # cohere.embed-v4 invocation
│   │   ├── OpenSearchClient.java      # hybrid k-NN + BM25 via _msearch
│   │   └── BedrockReranker.java       # cohere.rerank-v3-5:0
│   ├── rewrite/
│   │   ├── HeuristicGate.java         # pronoun/length/NE/cosine logic
│   │   ├── DynamoCache.java           # exact-match (sessionId, history-digest)
│   │   ├── FlanT5Client.java          # SageMaker runtime invocation
│   │   ├── HaikuRewriter.java         # Bedrock Converse with prompt caching
│   │   └── ComprehendEntities.java    # entity extraction with session-state caching
│   ├── eval/
│   │   ├── EvalRunner.java            # loops eval set × architecture, records per-stage timings
│   │   ├── Metrics.java               # NDCG@5, Recall@10, MRR, ROUGE, BLEU
│   │   └── ResultsWriter.java         # CSV + JSON output for downstream analysis
│   └── instrumentation/
│       ├── StageTimer.java            # nanoTime per stage; X-Ray segments optional
│       └── BedrockUsageTracker.java   # token counts in/out, cache hit/miss
├── src/test/java/                     # unit tests for gate logic, cache, metrics
├── scripts/
│   ├── 01-deploy-infra.sh             # cdk deploy
│   ├── 02-ingest-corpus.sh            # embed + index synthetic-te-faqs.jsonl
│   ├── 03-generate-eval.sh            # invoke data-gen/generate.py
│   ├── 04-finetune-flant5.sh          # SageMaker training job
│   ├── 05-deploy-rewriter.sh          # Push FLAN-T5 to inf2 endpoint
│   ├── 06-run-bench.sh                # ./06-run-bench.sh A|B|C
│   └── 07-analyze-results.py          # reads results/*.csv → aggregate report
└── results/                           # bench outputs (gitignored)
    ├── arch-a-{timestamp}.csv
    ├── arch-b-{timestamp}.csv
    └── arch-c-{timestamp}.csv
```

---

## Prerequisites

You are running this from your laptop or an EC2 dev box, in an AWS account where you have:

- **Bedrock model access enabled** in the deployment region (us-east-1 or us-west-2 recommended) for: `cohere.embed-v4`, `cohere.rerank-v3-5:0`, `anthropic.claude-haiku-4-5`, `anthropic.claude-sonnet-4-5` (only used by data-gen). Latency-optimized inference must be enabled on the account if available.
- **OpenSearch Serverless** quota for at least 1 collection.
- **SageMaker** quota for `ml.inf2.xlarge` real-time endpoints (request via Service Quotas if not granted).
- **DynamoDB**, **Lambda**, **Comprehend** standard access.
- **Java 21**, Maven 3.9+, AWS CLI v2 (configured), Python 3.11 (for data-gen and analysis only), AWS CDK v2.
- **Estimated cost to run the full bench end-to-end once**: ~$30 in Bedrock data-gen + ~$15-20 for an inf2 endpoint running 8 hours during the bench + negligible OpenSearch/Lambda/DynamoDB. Tear down after each run.

You do NOT need to be an Amazon employee for any of this; everything uses public AWS services.

---

## End-to-end run, in order

```bash
# 0. Configure AWS credentials, set region
export AWS_REGION=us-west-2
export AWS_PROFILE=<your-profile>

# 1. Deploy infrastructure (OpenSearch Serverless, DynamoDB tables, IAM, base SageMaker role)
./scripts/01-deploy-infra.sh
# Outputs collection ARN, table names, IAM role ARNs into infra/cdk/cdk-outputs.json

# 2. Generate synthetic corpus + eval set via Sonnet 4.6
#    Produces data-gen/corpus/synthetic-te-faqs.jsonl (200 FAQs)
#    and data-gen/eval/conversations.jsonl (50 three-turn convos with gold rewrites + relevant doc IDs)
./scripts/03-generate-eval.sh
# Cost: ~$10 in Bedrock spend. ~10 minutes.

# 3. Embed and index the corpus into OpenSearch Serverless
./scripts/02-ingest-corpus.sh
# Cost: ~$0.50. ~2 minutes.

# 4. Fine-tune FLAN-T5-base for CQR (one-time; produces model artifact)
./scripts/04-finetune-flant5.sh
# Cost: ~$8 on g5.xlarge for ~4 hours. Skip if you already have an artifact.

# 5. Deploy the rewriter to ml.inf2.xlarge
./scripts/05-deploy-rewriter.sh
# Cost: ~$0.76/hr while up.

# 6. Run each architecture against the eval set (3 separate runs)
./scripts/06-run-bench.sh A
./scripts/06-run-bench.sh B
./scripts/06-run-bench.sh C
# Each run: ~5-10 minutes, depending on Bedrock throttling.
# Outputs: results/arch-{A|B|C}-{timestamp}.csv with per-turn rows.

# 7. Aggregate and produce the comparison report
python scripts/07-analyze-results.py
# Outputs: results/summary.html with side-by-side latency distributions,
# quality metrics, failure-mode breakdowns, cost totals.

# 8. Tear down (do this; the inf2 endpoint costs money idle)
cd infra/cdk && cdk destroy
aws sagemaker delete-endpoint --endpoint-name skywalker-flant5-cqr
```

---

## Eval set construction

The eval set is **50 three-turn conversations** (so 100 follow-up turns total — turns 2 and 3 of each conversation are the targets of CQR; turn 1 is context). Each turn has:

- The raw user utterance
- A hand-authored gold standalone rewrite
- A list of relevant FAQ IDs (the documents that should appear in top-k)
- A failure-mode label: one of `anaphora | ellipsis | topic_continuation | topic_shift | comparative | clarification | standalone`

Distribution targets (across the 100 follow-up turns):
- 20% anaphora
- 20% ellipsis
- 20% topic_continuation
- 15% topic_shift
- 10% comparative
- 5% clarification
- 10% standalone (control: rewriting should NOT change these meaningfully)

Generation flow:
1. Sonnet 4.6 generates 200 synthetic T&E FAQ entries spanning a defined ontology (per-diem, mileage, hotels, airfare, meals, conferences, ground transport, international travel, relocation, equipment).
2. Sonnet 4.6 generates 50 conversation seeds: a turn-1 question grounded in 1-2 FAQ IDs.
3. Sonnet 4.6 generates turns 2 and 3 conditioned on each seed and on a target failure mode (sampled per the distribution above), producing both the natural follow-up and the gold standalone rewrite.
4. **Manual review pass** of all 100 follow-up turns by a human (you, or whoever is running the bench) before the eval set is locked. The synthetic-data generator will produce some bad examples; reviewer fixes or replaces them.
5. The eval set is versioned (`v1`, `v2`, ...) and frozen once accepted.

The eval set lives at `data-gen/eval/conversations.jsonl`. Each line:
```json
{
  "conversation_id": "conv_001",
  "turns": [
    {"role": "user", "text": "What's the per diem for travel to NYC?", "relevant_doc_ids": ["faq_021", "faq_044"]},
    {"role": "user", "text": "And for international?", "gold_rewrite": "What's the per diem for international travel?", "relevant_doc_ids": ["faq_022", "faq_088"], "failure_mode": "ellipsis"},
    {"role": "user", "text": "How does that compare to last year's policy?", "gold_rewrite": "How does the international travel per diem compare to last year's policy?", "relevant_doc_ids": ["faq_088", "faq_141"], "failure_mode": "comparative"}
  ]
}
```

---

## Architecture-specific implementation notes

### Arch A
- No rewriter. The Embed v4 input is `f"{turn_n_minus_1} {turn_n}"` (space-joined, no special tokens).
- The Rerank query is `f"[Recent context: {turn_n_minus_1}] {turn_n}"`.
- Skip turn-1 history concat (nothing to concat).

### Arch B
- Gate logic, in order:
  1. If `len(tokens(turn)) >= 6 AND has_named_entity(turn) AND not has_pronoun(turn)` → standalone, skip rewrite.
  2. If `cosine(embed(turn), embed(prev_user_turn)) < 0.3` → topic shift, rewrite WITHOUT history concat.
  3. Else → follow-up, rewrite WITH history concat.
- DynamoDB cache key: `sha256(sessionId || prev_2_user_turns || current_turn)`.
- FLAN-T5 prompt: `"Rewrite the follow-up question into a standalone question.\n\nConversation:\n{history}\n\nFollow-up: {current}\n\nStandalone:"` — 5 in-context examples appended at fine-tune time, not at inference (saves tokens).
- Inferentia2: compile with `optimum-neuron`, batch size 1, sequence length 512 in / 64 out.

### Arch C
- Gate is identical to Arch B (don't fire Bedrock on standalone turns).
- Bedrock Converse call:
  ```
  modelId = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
  performanceConfig = {"latency": "optimized"}
  system = [
    {"text": REWRITER_SYSTEM_PROMPT, "cachePoint": {"type": "default"}}
  ]
  additionalModelRequestFields = {"cache_control": {"type": "ephemeral", "ttl": "1h"}}
  inferenceConfig = {"maxTokens": 64, "temperature": 0.0}
  ```
- Race window: raw-branch reranker has a `CompletableFuture` waiting up to 250ms after retrieval starts for the rewrite to arrive. If it arrives, re-issue retrieval+rerank with rewritten query and replace results. If not, ship raw and persist rewrite for next turn.
- Persist every successful rewrite to the same DynamoDB cache, so subsequent identical follow-ups hit Arch B's fast path.

---

## What success looks like

The bench produces a single artifact: `results/summary.html`, with three side-by-side panels:

1. **Latency CDFs**: end-to-end and per-stage. We expect Arch A to dominate raw latency, Arch B to come within ~50ms P50, Arch C to be competitive at P50 but with a longer P99 tail.
2. **Quality bars**: NDCG@5 and Recall@10 grouped by failure mode. We expect Arch B and C to materially beat Arch A on ellipsis and topic_shift; Arch A may match or beat them on standalone (no over-rewriting).
3. **Cost table**: per-1000-queries Bedrock spend + amortized inf2 endpoint cost.

The deliverable from running this bench is a recommendation: which architecture to take to production, with measured numbers backing it. If Arch B beats Arch C on quality-per-dollar AND fits the 400ms P99 budget, B wins. If Arch C's quality lift on hard turns justifies its tail latency and per-call cost, C wins. If Arch A is within 5 NDCG points of B on every failure mode, A wins on operational simplicity alone.

---

## Out of scope for this bench

- The agent layer (Sonnet 4.6 generation step). We measure retrieval quality, not answer quality. Add that later once the retrieval architecture is locked.
- Multi-region failover. Single-region run.
- Production-grade monitoring (CloudWatch dashboards, alarms). We log to CSV; that's enough to compare.
- Bedrock Knowledge Bases / Bedrock Agents path. Excluded by design — they don't expose the rewrite and don't fit the latency target. Worth a separate bench if you want to evaluate the managed-RAG fallback.
- Long-conversation behavior (>5 turns). The eval set is fixed at 3 turns, which covers the dominant failure modes; longer conversations introduce summarization/compaction concerns that are a separate problem.

---

## Open questions for the build agent

1. **Eval set authoring**: Will the same person run the bench AND author/review the gold rewrites? If yes, build the review UI as a simple CLI prompter. If no, the synthetic outputs need a separate review step before the bench is meaningful.
2. **Inferentia2 quota**: Has the AWS account been pre-approved for `ml.inf2.xlarge`? Default quota is often 0; service-quota request takes 1-3 business days. Fall back to `ml.g5.xlarge` (~$1.20/hr, GPU) if blocked.
3. **Latency-optimized inference availability**: Confirm `performanceConfig.latency = "optimized"` works for `claude-haiku-4-5` in the chosen region. If not yet GA there, fall back to standard inference and note the latency penalty in the report.
4. **Concurrency**: Should the bench run conversations sequentially (cleaner per-turn measurements, accurate cache-hit modeling) or with concurrency N>1 (more realistic load, but cache-hit math gets noisy)? Default: sequential.
