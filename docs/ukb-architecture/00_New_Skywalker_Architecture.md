# Skywalker Architecture (v2)

This document represents the finalized, rigorously interrogated architecture for the Skywalker Retrieval Augmented Generation (RAG) system, optimized for Amazon's internal T&E domain.

## 1. System Topology Overview

Skywalker is a federated retrieval architecture composed of two primary data retrieval arms fronted by a unified Model Context Protocol (MCP) layer.

* **Arm 1: General RAG (Unified Knowledge Base - UKB)**: A remote MCP server interacting with the CoreX CMS via OpenSearch. Skywalker treats this as a generic semantic retrieval endpoint.
* **Arm 2: Top 50 FAQ Micro-RAG**: A heavily controlled, custom OpenSearch cluster within the Skywalker boundary, dedicated strictly to high-frequency, high-impact queries.

### 1.1 Request Path
1. **Client Intake**: Intercepted via Slack Bot or AZA.
2. **Metadata Enrichment (PAPI)**: The user's system identifier is resolved into authoritative context (Location, Level, IC/Manager Type).
3. **Query Routing (Similarity Match)**: The query is checked against the FAQ Question/Variant pool.
   * If **Match**: the query routes exclusively to the Top 50 FAQ index.
   * If **No Match**: the query routes concurrently to *both* the UKB and the Top 50 FAQ index.
4. **Normalization**: Results from retrieved sources are transformed into a singular structural shape (flat array of JSON strings) for the Re-ranker.
5. **Re-ranking (Cohere Rerank 3.5)**: The arbitration layer scores the relevance of the combined chunks.
6. **Return Payload**: Skywalker returns the final ranked list of context over MCP. *Note: Skywalker serves strictly as a Retrieval Engine; downstream client agents handle actual answer generation.*

---

## 2. Component Design Decisions

### 2.1 PAPI Dependency & Persistence
**Decision: Synchronous API fetching without cache retention.**

Because Location, Level, and Type are mandatory to isolate the correct policy context (e.g., T&E policy for a Level 5 in Brazil vs. Level 10 in the US), a failure to retrieve PAPI metadata equates to a system failure. The system does **not** cache PAPI data (via Redis or otherwise) to fundamentally prevent the storage of PII at rest. Additionally, scaling a cache to 300,000 corporate employees introduces unwarranted complexity. In the event of a PAPI 500 error, the system will fail-closed gracefully.

*Extensibility Note*: The MCP payload is designed to optionally accept this metadata directly from client requests, acting as a fallback for future integrations that pre-fetch this context.

### 2.2 Result Normalization & Confidence
**Decision: Cohere Rerank 3.5 as the Sole Arbiter.**

Because Arm 1 (UKB) and Arm 2 (FAQ) operate on different mathematical indices and potentially different embedding dimensions, their native distance/confidence scores are incompatible. Skywalker ignores upstream retrieval scores and relies exclusively on the downstream Coherer Rerank 3.5 layer to score the concatenated results on a single playing field. 

### 2.3 Data Normalization Layer
**Decision: Strict Unification prior to Re-ranking.**

Because the UKB returns its own proprietary JSON schema over MCP, and the Top 50 FAQ index returns an OpenSearch `_source` document schema, the texts are fundamentally distinct. Before passing any data to Cohere, Skywalker implements a strict Normalization adapter. All documents, regardless of source, are crushed down into a standard array of objects (e.g., `[{"title": "...", "text": "..."}]`) to give the Re-ranker a clean, unified structure.

### 2.4 FAQ Index Synchronization (CoreX)
**Decision: Background Population & Atomic Alias Swapping.**

The Top 50 FAQ index receives updating fragment data from CoreX. Because changes to policy must be completely overwritten to prevent stale data conflicts, the system reconstructs the OpenSearch vector store. To enforce Zero Downtime and prevent 404/500 errors on inflight queries, Skywalker employs an Atomic Alias Strategy:
1. `faq_index_v2` is generated and fully warmed in the background.
2. The `active_faq` OpenSearch Alias is atomically shifted from `v1` to `v2`.
3. `v1` is asynchronously dismantled.

### 2.5 Hierarchical Chunking for FAQ Fragments
**Decision: Defensive Context Window Management via Parent/Child architecture.**

While standard FAQ data is already bite-sized, Skywalker employs Hierarchical Chunking to defend against CoreX CMS usage anomalies—specifically, when content creators paste entire 10-page documents into a single "fragment" block. By chunking hierarchically, Skywalker ensures the context payloads returned to the LLM (via the downstream client) remain tightly bounded and token-efficient, rather than unwittingly passing a massive raw document fragment.

### 2.6 The Similarity Router Protocol
**Decision: Short-circuit optimization via Fast Matching.**

Running immediately after the PAPI metadata fetch, the Similarity Router is an optimization gateway. If a user's query registers a sufficient match against the Top 50 Questions (or their variants) index, it triggers an exclusive query to the FAQ OpenSearch index, completely bypassing the UKB API. This drastically reduces external dependency calls for the highest-frequency 50 queries. A "miss" safely regresses to the parallel dual-arm retrieval path.
