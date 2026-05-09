# Unified Implementation Plan: Skywalker Conversational Query Rewriting (CQR)

> **Status:** This document subsumes `follow_up_implementation_plan.md`,
> `cqr_strategy_and_architecture_review.md`, `research_1.md`, and
> `research_3.md`. The `deterministic_implementation_plan.md` has been
> removed; the deterministic transition-graph approach is **rejected**
> for reasons documented in §1.4. This is the single source of truth
> going forward.

---

## 0. Document Purpose & Scope

This plan defines the end-to-end engineering work required to deliver a
conversational query rewriting (CQR) layer that sits in front of an
existing Skywalker RAG stack (Cohere Embed v4 → OpenSearch hybrid →
Cohere Rerank 3.5 → Bedrock answer model). The CQR layer is responsible
for one job: **convert any conversational user turn into a
retrieval-ready, structurally-filtered query frame, fast enough to
preserve a strict total-system latency budget, accurate enough to hit
95% top-1 routing on the eval set.**

Implementation specifics (model checkpoints, exact prompt strings, infra
SKUs) will be re-litigated in the upcoming planning round. This
document fixes the *shape* of the system, the constraints it must obey,
and the order in which the work must be done.

---

## 1. Hard Constraints

### 1.1 Accuracy

- **95% top-1 FAQ-routing accuracy** on the frozen eval set (see §6).
  Measured as: of all eval turns whose gold-relevant document set is
  non-empty, the rewritten query plus filters must put the gold
  document at rank 1 of the post-rerank output.
- **Unsafe-guess rate near zero.** When the system cannot resolve a
  follow-up with high confidence, it must abstain (clarification
  request) rather than confidently route to the wrong FAQ.
  `unnecessary_clarification_rate` is permitted to be non-trivial in
  v1; `unsafe_guess_rate` is not.

### 1.2 Latency

The downstream RAG / retrieval-and-classification ("RAC") layer is
budgeted at **~100ms** for hybrid search + rerank + classification on
the small corpus path. The end-to-end user-perceived budget is
**~400ms P50 / ~600ms P99** including LLM answer generation.

That gives the CQR layer:

| Stage                          | P50 budget | P99 budget |
| :----------------------------- | :--------- | :--------- |
| Heuristic gate + cache lookup  | ≤ 5ms      | ≤ 10ms     |
| Structured rewrite (follow-up) | ≤ 50ms     | ≤ 75ms     |
| **CQR total**                  | **≤ 55ms** | **≤ 85ms** |
| RAC (hybrid search + rerank)   | ≤ 100ms    | ≤ 150ms    |
| LLM answer generation          | ≤ 245ms    | ≤ 365ms    |

The 50ms rewrite ceiling drives nearly every downstream technical
choice in §3 (model size, hosting, compilation, batch=1).

### 1.3 Flexibility (corpus growth)

The corpus starts at ~50 FAQs and is expected to grow to 270+ and
beyond, into an unbounded long tail. The CQR layer must scale to that
growth **without architectural changes** — no manual transition-graph
maintenance, no per-FAQ rule edits at runtime. New FAQs are absorbed
through (a) the catalog/metadata index, (b) the embedding index, and
(c) periodic re-fine-tuning of the small rewriter on regenerated
synthetic data. No code changes to the hot path.

### 1.4 Non-determinism (rejection of the transition-graph plan)

The deterministic transition-graph approach is rejected. Rationale:

1. **Curation cost is exponential in the corpus size.** 50 nodes is
   tractable; 270+ is not; "growing beyond" is unmanageable.
2. **Brittle on novel phrasings.** Any user utterance the curator did
   not anticipate becomes a hard fallback or a clarification, even when
   the answer obviously exists.
3. **Tight coupling to the corpus.** Every FAQ change forces a graph
   review, which makes content updates politically expensive.
4. **Cannot meet flexibility requirement (§1.3) by construction.**

We therefore commit to a **non-deterministic, learned**
rewrite/routing layer as the hot path. The system's behavior is
probabilistic but bounded by structured output, calibrated confidence,
and abstain thresholds (§3.4).

### 1.5 Sub-formalization (structured output discipline)

The rewriter does not emit free-form natural-language paraphrases. It
emits a **structured query frame** that the RAC layer consumes
directly. The frame is the formal contract between CQR and RAC:

```json
{
  "standalone_query": "What are the reimbursement limits for international hotel stays?",
  "filters": {
    "domain": "expense",
    "subject": "lodging",
    "scope": { "geography": "international" }
  },
  "boosters": ["per diem", "lodging cap"],
  "followup_type": "subject_substitution",
  "carry_forward": ["domain", "intent", "action"],
  "confidence": 0.92
}
```

- `standalone_query` is the retrieval string. The original raw user
  turn is *also* preserved by the orchestrator and used as a `must`
  clause in hybrid search per Elasticsearch Labs' empirical finding
  that rewrites work best as boosters, not replacements.
- `filters` are hard metadata constraints applied to OpenSearch.
- `boosters` are optional `should`-clause expansions.
- `followup_type` is one of a small enumerated set
  (`standalone | anaphora | ellipsis | subject_substitution |
   scope_refinement | comparison | clarification_request | ambiguous`).
- `confidence` is calibrated against the eval set; below threshold the
  orchestrator routes to clarification (§3.4).

The rewriter is fine-tuned with a JSON-schema-conformant loss; failure
to emit valid JSON is treated as an inference failure and falls back
to raw retrieval.

### 1.6 Cost / ops complexity

Complexity is explicitly **not** a constraint. The user has stated
that effort and infrastructure complexity are non-issues; speed and
quality are the only optimizations. This permits self-hosted
fine-tuned models on Inferentia, dedicated GPU endpoints for
re-training, multi-stage offline pipelines, etc.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Slack / AZA client                       │
│         (maintains compact session frame; not persistent)       │
└────────────────────────────────┬────────────────────────────────┘
                                 │ (raw turn, last N turns, frame)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CQR Orchestrator                          │
│                                                                 │
│  ┌──────────────────┐   miss    ┌────────────────────────────┐  │
│  │ Heuristic Gate   │──────────►│  Structured Rewriter       │  │
│  │ (pronoun, length,│           │  (small fine-tuned model,  │  │
│  │  NE, cosine,     │           │   self-hosted, inf2/g5,    │  │
│  │  topic-shift)    │           │   batch=1, JSON output)    │  │
│  └────────┬─────────┘           └────────────┬───────────────┘  │
│           │ standalone                       │                  │
│           ▼                                  ▼                  │
│  ┌──────────────────┐           ┌────────────────────────────┐  │
│  │  Identity rewrite│           │  JSON validate +           │  │
│  │  (raw → frame)   │           │  confidence calibration    │  │
│  └────────┬─────────┘           └────────────┬───────────────┘  │
│           └────────────┬─────────────────────┘                  │
│                        ▼                                        │
│           ┌──────────────────────────────┐                      │
│           │  DynamoDB exact-match cache  │ (write-through)      │
│           └──────────────┬───────────────┘                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │ QueryFrame
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│       RAC layer (existing, ~100ms budget)                       │
│       Hybrid OpenSearch (BM25 + k-NN, metadata filters)         │
│       → Cohere Rerank 3.5 → top-K FAQ records                   │
└────────────────────────────────┬────────────────────────────────┘
                                 ▼
                       LLM answer generation
```

Key properties:

1. **Serial, not parallel.** We reject Arch C (parallel frontier
   model) because Bedrock tail latencies threaten the P99 budget and
   per-call cost scales linearly with traffic. The 50ms ceiling on the
   rewriter is achievable with a self-hosted small model.
2. **Standalone-fast-path.** Most turns will be classified standalone
   by the gate and skip the rewriter entirely; their rewrite is the
   identity transform plus an empty filter set.
3. **Cache-first.** Every successful rewrite is persisted in
   DynamoDB keyed by `sha256(sessionId || prev_2_user_turns ||
   current_turn)` with a 5-minute TTL. Cache hits short-circuit the
   model.
4. **Stateless backend.** The conversation frame is owned by the
   client. The CQR orchestrator receives it as input on every call and
   does not maintain its own session store.

---

## 3. Phased Implementation

### Phase 0 — Eval set first (blocking gate)

**No model work begins until this is done and frozen.**

- Author the synthetic-data generator (Sonnet-class frontier model
  offline) that produces ~5,000–10,000 multi-turn conversations
  spanning the seven failure modes (anaphora, ellipsis,
  topic-continuation, topic-shift, comparative, clarification,
  standalone control).
- Carve out 100–200 conversations as the **frozen eval set**. Every
  follow-up turn must have:
  - the raw user utterance,
  - a hand-authored gold standalone rewrite,
  - a hand-authored gold filter set,
  - a list of relevant FAQ IDs,
  - a failure-mode label.
- **Manual review pass** by a domain reviewer is mandatory; the
  synthetic generator will produce bad examples. Lock the set at v1
  and version forward.
- Build the eval harness (NDCG@5, Recall@10, MRR, ROUGE-1/2/L, BLEU,
  per-failure-mode breakdowns, latency-per-stage instrumentation).

Deliverable: `data-gen/eval/conversations.v1.jsonl`,
`eval/run.py|.java`, baseline numbers from a no-rewrite control.

### Phase 1 — Heuristic gate + cache (the cheap wins)

Implement and ship in front of the existing RAG stack first, before
touching the model. Even on its own this should improve quality on
ellipsis/anaphora turns relative to raw retrieval and gives us a
production-quality measurement surface.

- Pronoun / anaphoric-marker regex.
- Token-length and named-entity check (Comprehend, async-cached
  per-session).
- Cosine-to-previous-turn for topic-shift detection (reuse the
  existing Cohere embeddings).
- Decision logic, in order:
  1. Length ≥ 6 tokens AND has named entity AND no pronoun → standalone.
  2. Cosine to previous turn < 0.3 → topic shift; rewrite without
     concat.
  3. Else → follow-up; rewrite with concat.
- DynamoDB exact-match cache, write-through, 5-min TTL.

Deliverable: gate + cache running on the canary fraction of traffic;
baseline metrics captured for comparison against Phase 3.

### Phase 2 — Synthetic training data + catalog metadata

These two streams run in parallel.

**2a. Synthetic training data**

- Reuse the Phase 0 generator, expand to the full
  5,000–10,000-conversation corpus.
- Each example produces a (conversation-frame → JSON-frame) training
  pair conformant to §1.5.
- **Critical curation step:** audit the synthetic dataset to verify
  that every emitted filter value exists in the live corpus metadata
  schema. Hallucinated filters poison the model and cause runtime
  abstains.

**2b. FAQ catalog metadata**

- For every FAQ, author/extract: `domain`, `intent`, `actions`,
  `subjects`, `scope_dimensions`, `positive_surface_forms`,
  `negative_surface_forms`, `related_faq_ids`. (Heavy use of frontier
  LLMs offline is fine here; SME review is required before lock.)
- Index these as filterable fields in OpenSearch alongside the
  `answer_text` and `canonical_question` embeddings.
- This catalog is the *vocabulary* the rewriter learns to emit
  filters in. It must be consistent between training data and runtime
  index.

Deliverable: `data-gen/training/rewrites.v1.jsonl` (curated),
versioned FAQ catalog ingested into OpenSearch with metadata fields.

### Phase 3 — Fine-tune and deploy the structured rewriter

- **Model selection.** Start with FLAN-T5-base (~250M). Fall back to
  a distilled 1–3B-parameter instruction model if T5-base cannot hit
  the 95% target on the eval set after two tuning rounds. The model
  family choice will be re-litigated in the next planning round.
- **Training.** Fine-tune on the Phase 2a corpus with a JSON-conformant
  loss. Hold out the eval set entirely.
- **Compilation & deployment.** AWS Inferentia2 (`ml.inf2.xlarge`)
  via `optimum-neuron`, static batch size 1, sequence length
  512-in / 64-out. Fall back to `ml.g5.xlarge` if inf2 quota is not
  granted. Document the latency penalty if so.
- **Validation.** Block release until the model meets:
  - JSON-schema validity ≥ 99.5% on the eval set,
  - 95% top-1 routing on eval-set follow-ups,
  - P50 inference ≤ 50ms, P99 ≤ 75ms (warm),
  - calibrated `confidence` such that abstaining at threshold τ
    drives `unsafe_guess_rate` to ≤ 0.5%.

Deliverable: SageMaker endpoint serving the rewriter; tagged model
artifact in S3; eval report.

### Phase 4 — Orchestration & integration

- Implement `handleTurn(currentTurn, history, sessionFrame)` as the
  single entrypoint:
  1. Cache lookup.
  2. Heuristic gate.
  3. If follow-up: build conversation frame, invoke rewriter,
     validate JSON, check confidence.
  4. If confidence < τ: emit `clarification_request` route; the
     client decides whether to ask the user.
  5. Otherwise: forward `QueryFrame` to RAC.
- Instrument three latency segments per turn (gate/cache, rewrite,
  RAC) and emit them as structured logs. P50/P95/P99 alarms on each.
- Persist rewrites and (later) thumbs-up/down feedback into the
  judged-data store for re-training.

Deliverable: production CQR service; dashboards; runbooks; load test
showing the budget holds at 5× current QPS.

### Phase 5 — Continuous improvement loop

- Weekly batch job: pull misrouted / clarified turns, send through the
  frontier model offline, regenerate synthetic data near the failure
  modes, queue for SME review.
- Monthly fine-tune refresh on the cumulative judged + synthetic
  dataset. Promotion to prod only on eval-set non-regression.
- Quarterly review of failure-mode distribution; if a new mode emerges
  (e.g. multi-step compound questions), expand the schema and the
  generator.

---

## 4. Component Inventory

| Component                     | Owner                      | Notes                                               |
| :---------------------------- | :------------------------- | :-------------------------------------------------- |
| `HeuristicGate`               | Skywalker CQR              | Pronoun/length/NE/cosine. Pure Java; no model.      |
| `DynamoCache`                 | Skywalker CQR              | Exact-match key on session+history digest.          |
| `RewriterClient`              | Skywalker CQR              | SageMaker runtime invocation; circuit breaker.      |
| `JsonFrameValidator`          | Skywalker CQR              | Schema check + filter-vocabulary check.             |
| `ConfidenceCalibrator`        | Skywalker CQR              | Platt scaling on eval set; threshold τ.             |
| Rewriter model (artifact)     | ML eng                     | FLAN-T5-base fine-tune; quarterly refresh.          |
| Synthetic-data generator      | ML eng                     | Sonnet-class offline; produces training + eval.     |
| FAQ catalog                   | Knowledge mgmt + SME       | Versioned metadata; SME-approved.                   |
| OpenSearch index + mapping    | Platform                   | Adds metadata fields per §2b.                       |
| Eval harness                  | Skywalker CQR              | NDCG/Recall/MRR/ROUGE/BLEU + per-stage latency.     |
| RAC layer                     | Existing (Skywalker core)  | No CQR-driven changes; consumes `QueryFrame`.       |

---

## 5. Interface Contract (CQR ↔ RAC)

```
input:  ConversationTurn { sessionId, currentText, lastNTurns[], clientFrame? }
output: QueryFrame { standaloneQuery, filters{}, boosters[],
                     followupType, carryForward[], confidence,
                     route: "retrieve" | "clarify" | "abstain",
                     rawTurn (passthrough) }
```

The RAC layer treats `rawTurn` as a `must` clause and `boosters` as
`should` clauses (Elasticsearch Labs pattern). `filters` are applied as
metadata pre-filters. `route=clarify` is returned to the client
without invoking RAC. `route=abstain` triggers the dual-arm fallback
path defined by the existing Skywalker architecture.

This contract is frozen at the start of Phase 4 and versioned.

---

## 6. Eval & Success Criteria

The system ships when, on the frozen v1 eval set, the rewriter +
RAC pipeline achieves all of:

1. **Top-1 FAQ routing accuracy ≥ 95%** across all non-standalone
   turns.
2. **Unsafe-guess rate ≤ 0.5%** at the chosen confidence threshold.
3. **End-to-end P50 ≤ 400ms, P99 ≤ 600ms** measured at the API edge.
4. **CQR-stage P50 ≤ 55ms, P99 ≤ 85ms** measured between gate entry
   and RAC entry.
5. **JSON-schema validity ≥ 99.5%** on rewriter output.
6. **No regression vs. raw-retrieval baseline** on the standalone
   control slice (rewriter must not over-rewrite obvious queries).

Per-failure-mode targets (from §6 of the strategy review): ellipsis
and topic-shift slices must independently exceed 90% top-1 accuracy.

---

## 7. Risks & Mitigations

| Risk                                                  | Mitigation                                                                          |
| :---------------------------------------------------- | :---------------------------------------------------------------------------------- |
| Inferentia quota delay                                | Pre-file quota request at Phase 0; pre-validated g5 fallback path.                  |
| FLAN-T5-base undersized for 95%                       | Phase 3 has a built-in escalation to a distilled 1–3B model.                        |
| Synthetic data hallucinates filter values             | Mandatory curation step in Phase 2a; automated vocabulary check at validate time.   |
| Cold-start latency on first request                   | Provisioned concurrency / endpoint warmer; cache primer at deploy.                  |
| FAQ catalog drifts from training data                 | Catalog is versioned; rewriter is re-tuned on every catalog version bump.           |
| Confidence calibration drifts                         | Re-calibrate on judged production data monthly.                                     |
| Client (Slack/AZA) does not pass conversation frame   | CQR can reconstruct from `lastNTurns` alone; frame is an optional accelerator.      |
| User over-trusts an unsafe answer (95% ≠ 100%)        | Citations required from RAC; abstain on low confidence; continuous judged-data feed.|

---

## 8. Out of Scope (here)

- Answer-generation prompt engineering downstream of RAC.
- Long-conversation summarization (>5 turns); the eval set is fixed at
  3 turns and that is sufficient for v1.
- Multi-region failover for the rewriter endpoint.
- The agentic / multi-tool routing layer above Skywalker (separate
  workstream; CQR feeds it but does not own it).

---

## 9. Open Questions for the Next Planning Round

1. **Rewriter model family.** FLAN-T5-base vs. distilled
   Llama-3-8B vs. a Phi/Qwen distillate. Decide after Phase 0 baseline
   numbers exist.
2. **Eval set authorship.** Will the bench operator hand-author/review
   the gold rewrites, or do we need a separate review tool and
   reviewer pool?
3. **Confidence-threshold ownership.** Does the CQR service decide
   `clarify` vs. `retrieve`, or does it always return a confidence and
   let the client decide? (Default in §5: CQR decides.)
4. **Catalog ingestion cadence.** Push-on-edit vs. nightly rebuild.
5. **Inferentia2 quota status** in the target AWS account.
6. **Latency-optimized Bedrock inference availability** in the target
   region — relevant only for the offline data-gen path, not the hot
   path.
7. **Cleanup of remnant artifacts.** `cqr-bench/` currently scaffolds
   Arch A, B, and C. Confirm removal of Arch A and Arch C scaffolding
   in the next round (the bench harness itself is reused for Phase 0).

---

## 10. Handoff Notes (from `follow_up_implementation_plan.md`, retained)

- **Eval First.** No fine-tuning starts before the frozen eval set
  exists.
- **Inferentia compilation.** `optimum-neuron`, static batch=1, or
  the latency target is unreachable.
- **Strict latency tracking.** Three segments per turn:
  gate/cache, rewrite, RAC. The RAC layer will consume ~100ms; the
  rewrite budget is hard-capped at ~50–75ms.
