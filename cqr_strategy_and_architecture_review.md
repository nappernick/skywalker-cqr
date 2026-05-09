# CQR Strategy & Architecture Review

## 1. Executive Summary & Understanding

Our goal is to comprehensively solve the "follow-up question" problem in a Conversational Retrieval-Augmented Generation (RAG) system, operating under strict constraints: a high accuracy target (95%) and a strict latency budget (<400ms). Crucially, the system must accommodate two phases of scale: an initial highly controlled corpus (50 FAQs) and a rapidly scaling unbounded corpus (growing to 270+ and beyond). Complexity and effort are non-issues; the sole optimizations are speed and quality.

We reviewed three provided research documents (Note: `research_2.md` was empty, so the analysis relies on `research_1.md` and `research_3.md`).

- **Attempt 1 (`research_1.md`)**: An engineering-led benchmarking harness operating on the assumption that **LLM Query Rewriting** is necessary. It benchmarks three architectures:
  - _Arch A_: Naive History Concatenation (fast, poor quality).
  - _Arch B_: Fast Local Model (FLAN-T5 on Inferentia) preceded by a heuristic gate.
  - _Arch C_: Parallel Frontier Model (Claude Haiku concurrent with raw search).
- **Attempt 3 (`research_3.md`)**: A system architecture deep-dive. It advocates that for a *small, constrained* corpus, generative LLM rewriting is the wrong tool, suggesting an offline-curated **Deterministic Transition Graph** instead. However, for a *scalable* enterprise system, it acknowledges the industry consensus of using structured state, metadata filtering, and selective rewriting via fine-tuned/distilled models.

## 2. Where and How They Differ

The core divergence is the **scalability vs. precision trade-off**:

- **Paradigm**: `research_1` treats the issue as an unstructured, unbounded search problem requiring an ML pipeline capable of interpreting novel conversational turns. `research_3` (in its primary recommendation) treats the issue as a closed-world classification task over a finite set of known intents.
- **Latency Management**: `research_1` manages latency through heavy ML engineering—fine-tuning smaller models or executing parallel race conditions. `research_3` bypasses runtime latency entirely by moving the complexity to manual offline curation (a transition graph).
- **Scalability**: `research_1`'s ML models can scale to an infinite number of documents without changing the architecture. `research_3`'s deterministic graph is fundamentally unscalable, requiring exponential manual curation as the corpus grows from 50 to 270+.

## 3. Hierarchy of Quality

1.  **Best Scalable Architecture (`research_1.md` Arch B + `research_3.md` Metadata)**: A self-hosted, fine-tuned small model (like FLAN-T5) generating structured rewrites (query + filters) provides the ultimate balance of scalable semantic understanding while fiercely protecting the sub-400ms latency budget.
2.  **Best Unscalable Architecture (`research_3.md` Section 1)**: For exactly 50 FAQs, a deterministic transition graph is the highest quality approach possible, providing zero-hallucination routing in micro-milliseconds, though it breaks under scale.
3.  **Best Engineering Rigor (`research_1.md`)**: The "Heuristic Gate" (skipping rewrite on standalone turns) and exact-match caching are universal patterns that must be retained in any architecture to save latency.
4.  **Least Viable (`research_1.md` Arch A & C)**: Arch A (history concat) is mathematically guaranteed to fail on topic shifts. Arch C (parallel Haiku) risks blowing the P99 latency budget due to uncontrollable API tail latencies.

## 4. Core Decisions and Rationale

- **Decision 1: Preserve the Heuristic Gate and Cache**
  - _Rationale_: Regardless of scale, many turns do not need complex processing. Caching and gating prevent unnecessary downstream work, saving the latency budget.
- **Decision 2: Reject Parallel Third-Party LLMs (Arch C)**
  - _Rationale_: Even running concurrently, relying on external frontier models (like Claude Haiku) introduces API tail latencies that jeopardize the strict sub-400ms constraint.
- **Decision 3: Fork the Architecture Based on Scale**
  - _Rationale_: Because the corpus is scaling from 50 to 270+, the architecture that works perfectly today (deterministic mapping) will buckle tomorrow. We must define two distinct solutions based on the size of the search space.

---

## 5. The Final Two Approaches

Based on your clarification regarding the scaling corpus, here are the two optimal architectural paths. If complexity is truly a non-issue, **Version 1** is the definitive long-term solution.

### Version 1: The Scalable ML Pipeline (For 270+ FAQs)

_The Optimal Solution for an Unbounded Corpus_

This approach assumes the corpus is growing too large for manual transition mapping. It focuses on supreme engineering complexity to force a generative ML pipeline to operate within strict latency boundaries.

- **Execution Flow**:
  1.  **Gate & Cache**: Incoming query hits an exact-match DynamoDB cache and a heuristic gate (checking for pronouns/ellipsis). Standalone queries skip to step 3.
  2.  **Structured Small-Model Rewrite (Hot Path)**: Follow-ups are routed to a heavily fine-tuned, self-hosted small model (e.g., FLAN-T5 on Inferentia, or a distilled Llama-3-8B). Crucially, this model is trained to output a **structured JSON frame** containing a standalone query AND metadata filters (e.g., `{"query": "hotel reimbursement limits", "filters": {"domain": "expense"}}`), completing in <50ms.
  3.  **Filtered Hybrid Search**: Execute a hybrid vector + BM25 search against OpenSearch, using the generated metadata as hard filters to prevent out-of-context retrieval.
  4.  **Rerank**: Pass the tightly filtered candidate set through an optimized reranker.
- **Why it is optimal**: It scales infinitely without manual knowledge-engineering. By accepting the immense complexity of self-hosting, compiling, and fine-tuning a small model, you achieve the generative flexibility needed for a vast corpus while mathematically protecting the sub-400ms latency budget and maximizing accuracy via structured filtering.

### [REJECTED] Version 2: The Deterministic State Machine (For exactly 50 FAQs)

_The Closed-World Solution (The previous direction)_

This is the approach detailed in the initial analysis, optimizing entirely for a static, heavily constrained environment where manual curation is feasible.

- **Execution Flow**:
  1.  **Gate & Cache**: Same as above.
  2.  **Deterministic Route**: The system uses a conversational state frame and a manually curated offline transition graph. If the user asks "what about for hotels?", the graph deterministically routes from the _Car FAQ_ node to the _Hotel FAQ_ node.
  3.  **Instant Return**: If the graph yields a match, return the FAQ immediately (<10ms), bypassing all ML components.
  4.  **RAG Fallback**: If the graph fails, fallback to a standard RAG pipeline.
- **Why it was recommended**: For a highly constrained corpus, this is mathematically the fastest and most accurate method possible. However, generating and auditing variants, nodes, and transition edges becomes an exponential, unmanageable nightmare as the corpus grows to 270 documents.
