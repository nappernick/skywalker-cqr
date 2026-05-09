# Implementation Plan: Scalable Follow-Up Handler (Version 1)

## Scope Bound
As mandated, this implementation is strictly bounded to the **Follow-Up Handling Layer**. It assumes the underlying RAG machinery (hybrid OpenSearch, Reranker, LLM answer generation) exists. This implementation acts exclusively as an interception and translation layer: it takes raw conversational turns and guarantees that the downstream RAG system receives a perfectly formatted, retrieval-ready query with structured metadata constraints. 

---

## Phase 1: The Heuristic Gate (The Fast Pass)
Before we invoke any models, we need a micro-millisecond gate to determine if the query is a follow-up or a standalone query. If it's standalone, we skip the rewrite pipeline entirely.

**Tasks:**
1. **Rule Engine Implementation**: 
   - Write a lightweight regex/heuristic function to detect pronouns (`he`, `she`, `it`, `they`, `that`, `those`) and anaphoric markers (`what about`, `and for`, `how does that compare`).
   - If length < X tokens AND no named entities are detected, treat as follow-up (high chance of ellipsis).
2. **Context Window Builder**:
   - For queries flagged as follow-ups, construct a compact conversational frame consisting of the last user turn and the current user turn.

---

## Phase 2: Training Data Pipeline (The Structured Rewrite)
To get a small, sub-400ms model (like FLAN-T5 or distilled Llama) to output structured JSON reliably, we need high-quality synthetic training data.

**Tasks:**
1. **Prompt a Frontier Model (Offline)**: Use a heavy LLM (e.g., Sonnet 3.5 or GPT-4) to generate 5,000 to 10,000 synthetic multi-turn conversation pairs.
2. **Define the Target JSON Schema**: 
   - The target output must be strictly formatted. Example:
     ```json
     {
       "query": "What are the reimbursement limits for international hotel stays?",
       "filters": {
         "domain": "expense",
         "subject": "lodging"
       }
     }
     ```
3. **Data Curation**: Audit the synthetic dataset to ensure the frontier model didn't hallucinate metadata filters that don't exist in your corpus schema.

---

## Phase 3: Model Fine-Tuning & Deployment (The Engine)
We will fine-tune a small, blazingly fast model to take the conversation frame and map it to the JSON schema defined in Phase 2.

**Tasks:**
1. **Model Selection**: Select `FLAN-T5-base` (~250M params) or a similarly sized distilled instruction model.
2. **Fine-Tuning**: Fine-tune the model on the synthetic dataset using SageMaker or local GPU clusters. Focus loss heavily on JSON schema adherence.
3. **Deployment**: Deploy the model to an AWS Inferentia2 (`ml.inf2.xlarge`) or equivalent latency-optimized endpoint. Ensure batch size = 1 for real-time inference.

---

## Phase 4: Runtime Orchestration (Putting it Together)
Integrate the components into the request lifecycle.

**Execution Flow (Code Scaffolding Goal):**
```java
public QueryContext handleTurn(UserTurn currentTurn, SessionHistory history) {
    // 1. Run Gate
    if (HeuristicGate.isStandalone(currentTurn.getText())) {
        return new QueryContext(currentTurn.getText(), emptyFilters());
    }
    
    // 2. Build Frame
    String frame = buildFrame(history.getLastTurn(), currentTurn.getText());
    
    // 3. Invoke Fast Model
    RewriteResult rewrite = FastModelClient.predict(frame);
    
    // 4. Return Context (To be passed to OpenSearch)
    return new QueryContext(rewrite.getStandaloneQuery(), rewrite.getFilters());
}
```

## Handoff Notes for Execution Models

As you pick up this implementation plan, keep the following technical guardrails in mind:
1. **Eval First**: Do not begin fine-tuning the small ML model until you have established a frozen, human-reviewed "Eval Set" of at least 50-100 multi-turn conversations (capturing ellipsis, anaphora, and topic shifts). You must have a baseline to measure the tuned model against.
2. **Inferentia Compilation**: If deploying to AWS Inferentia (`ml.inf2.xlarge`), remember to compile the model using `optimum-neuron` with a static batch size of 1 to achieve the target <50ms latency. Standard PyTorch deployment will be too slow.
3. **Strict Latency Tracking**: Instrument the `handleTurn` function with precise time logging across three segments: 1. Gate/Cache, 2. Model Inference, 3. Hybrid Search Execution. The downstream RAG pipeline will likely consume ~250-300ms, meaning your budget for the Follow-Up rewrite step is absolutely capped at ~50-75ms.
