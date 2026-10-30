# Implementation Plan: Deterministic State Machine (Version 2)

## Scope Bound
This implementation provides an alternative path to the Scalable ML Pipeline. It represents the opposite end of the engineering spectrum: **low infrastructure complexity, zero ML latency at runtime, but high manual curation effort.** It is optimized strictly for the current 50 FAQ corpus. Instead of training an AI model to guess the intent, we manually hardcode the conversation paths.

---

## Phase 1: Client-Side Context Management
Instead of the backend trying to decipher free-text history, the client (Slack/AZA) will maintain a structured state of the conversation. 

**Tasks:**
1. **Compact State Frame**: Implement a state object on the client that updates with each interaction.
   ```json
   {
     "last_faq_id": "EXPENSE_VEHICLE_REIMBURSEMENT",
     "domain": "EXPENSE",
     "intent": "REIMBURSEMENT_RULE",
     "subject": "VEHICLE"
   }
   ```
2. **Payload Delivery**: When the user asks a follow-up, the client passes this structured frame alongside the raw query to the backend.

---

## Phase 2: Offline Transition Graph Construction (The Core Work)
This replaces the ML training phase from Version 1. Here, product managers or knowledge engineers will manually map how users can move between the 50 FAQs.

**Tasks:**
1. **FAQ Intent Cataloging**: Tag all 50 FAQs with specific domains, intents, and subjects.
2. **Build the Graph**: Create a static JSON configuration file that defines allowed conversational transitions. 
   ```json
   {
     "from_faq_id": "EXPENSE_VEHICLE_REIMBURSEMENT",
     "transitions": [
       {
         "trigger_keywords": ["hotel", "lodging", "room"],
         "carry_forward": ["domain", "intent"],
         "to_faq_id": "EXPENSE_HOTEL_LODGING_REIMBURSEMENT"
       }
     ]
   }
   ```
3. **Keyword Dictionaries**: Build lightweight synonym dictionaries for subjects (e.g., "hotel" = "lodging" = "room" = "motel") to improve trigger matching.

---

## Phase 3: Runtime Routing Engine (The Hot Path)
At runtime, we execute a blazing-fast lookup against the offline graph.

**Tasks:**
1. **Heuristic Gate**: Use regex to detect if the query is a standalone question or a follow-up (same as Version 1).
2. **Graph Traversal**: 
   - If it's a follow-up, extract keywords from the new query using the dictionary.
   - Look up the `last_faq_id` in the transition graph.
   - If the extracted keywords match a `trigger_keyword` on an outgoing edge, follow the transition to the new `to_faq_id`.
3. **Instant Return**: If a transition is matched, **bypass vector search and reranking completely**. Immediately return the hardcoded answer for the new FAQ ID. 
4. **Fallback Mechanism**: If the user asks something that isn't mapped in the graph, immediately ask for clarification rather than sending a broken query to the search engine.

---

## Comparison to Version 1 (Scalable ML Pipeline)

| Feature | Version 1 (Scalable ML Pipeline) | Version 2 (Deterministic State Machine) |
| :--- | :--- | :--- |
| **Complexity to Build** | Very High (Model fine-tuning, synthetic data generation, GPU/Inferentia hosting) | Low (String matching, dictionary lookups, JSON parsing) |
| **Time to Build** | Weeks | Days |
| **Runtime Latency** | ~50-75ms (Inference) | < 5ms (Hash map lookup) |
| **Scalability (The Catch)** | Infinite (Model generalizes to new documents automatically) | Poor (Requires exponential manual mapping as FAQs grow from 50 to 270+) |

## Handoff Notes for Execution
If you select this path, the engineering risk shifts entirely to **Knowledge Management**. The system will be lightning fast and 100% accurate *within* the graph, but it will break down if the user takes a conversational path that wasn't manually anticipated. You must ensure you have the resources to maintain the `transitions.json` file as the business adds more FAQs.
