<<<<<<<<<<PREVIOUS CONVO>>>>>>>>>>>

Okay. I need a deep dive on a specific problem I'm encountering. Inner retrieval augmented generation system, the actual rag system is quite dumb. It's mostly built off of relatively simple, at least comparative to an LLM machine learning models and algorithms. However, that limitation means a lot of profound things, but specifically, what is the industry consensus on handling follow-up questions? So if you assume you wanna get the user's query and That query will allow you to perform semantic search, b m twenty five, whatever, which you then use to inform a model about how to respond to that query. What about when the follow-up query is written in normal human language, such as the first question would be, uh, what are the regulations around expenses for submitting, I don't know, something about my car? I don't know. Then the follow-up question is... and then what about my hotel room? That second question is going to return absolutely nothing of value from a purely retrieval set. sense. However, introducing an LLM to interpret and essentially fix up that query is wildly slow. The latency, you just double baseline because of that new LLM call. So what are the solutions? Give me the complete spectrum.

RAG follow-up handling spectrum

Specifically, I would like a focus, maybe 70 or 80%, to be on industry knowledge engineering blogs, like people actually building this at scale inside enterprise, where possible, then dominic. Academic stuff.

01_System_Boundary_and_Request_Lifecycle.md
File

02_MCP_Entry_Contract_and_Identity_Scoping.md
File

03_Top_50_FAQ_Controlled_Corpus_Ingestion_and_Storage.md
File

04_Query_Pipeline_and_Online_Decision_Flow.md
File

05_UKB_General_Retrieval_Integration.md
File

06_Reranking_Candidate_Unification_and_Abstain_Behavior.md
File

07_Slack_Integration_and_Client_Boundary.md
File

08_AZA_Integration_and_MCP_Consumption_Model.md
File

09_Calibration_Relitigation_Triggers_and_Decision_Log.md
File
For the most part, that aligns with the implementation plan we already had. The idea you put early around claim type, blah blah blah, we're not doing that shit, but we have our own version, which is more than adequate for the enriching state you reference. However, that's still not enough with a 95% accuracy requirement and under 400 ms. It's still not enough.

Finally, the corpus is a structured top 50 FAQ with answers written with prose and no tables nor fragments.

I’ll frame this as a constrained production design problem: a 50-answer prose FAQ, 95% accuracy, sub-400 ms latency, and follow-ups needing interpretation above stateless retrieval. Retrieval should become fallback and verification, while the primary path is controlled intent resolution over the small policy corpus.

This means pushing work offline into curated mappings and lightweight runtime state, so the online path behaves like a closed-world FAQ router rather than open-domain retrieval.

Thought for 6m 11s
My strong take: for this corpus, do not solve follow-ups with general RAG query rewriting. With only 50 structured FAQ answers, a 95% target, and a sub-400 ms backend target, the right architecture is a closed-world FAQ intent router with deterministic conversational carry-forward, plus a small fallback path. Generic semantic retrieval over answer prose is the wrong primary mechanism for follow-up turns.

The industry pattern is clear but too broad for your constraints. Conversational RAG systems usually rewrite or contextualize the follow-up into a standalone query before retrieval; NVIDIA’s RAG Blueprint describes exactly that: rewrite the latest user message into a standalone, context-rich query using conversation history, then retrieve and rerank.
OpenSearch’s conversational search docs similarly frame follow-up handling around conversation history so the system can remember prior context.
Azure describes the same query-understanding problem: users ask vague, conversational questions with assumed context, and classic keyword search fails when query wording does not match document terminology.

But your system is not a generic enterprise doc-search bot. Your own architecture already says Skywalker is stateless, multi-turn interpretation belongs above it, the backend budget is roughly 250–450 ms p95, and the reranker alone is expected to dominate that budget at roughly 250–350 ms p95.

It also says the online path performs no query rewriting and that introducing rewriting would be a separate architecture decision.

So the decision point is not “should RAG systems rewrite follow-ups?” In the abstract, yes. The decision is: should this system pay runtime LLM latency to rewrite follow-ups over a 50-answer closed corpus? My answer is no.

ElevenLabs gives a useful production datapoint: they also collapsed dialogue history into a precise self-contained query, but the rewrite step became more than 80% of their RAG latency when backed by a single externally hosted LLM; they recovered latency through model racing and self-hosted models, cutting median RAG latency from 326 ms to 155 ms and p95 from 629 ms to 426 ms.
That is an impressive pattern for larger conversational agents, but even their improved p95 is still slightly above your backend budget. For Skywalker’s Top 50 FAQ path, this should push you toward precomputed structure and deterministic routing, not toward runtime rewrite racing as the primary path.

The most important adjustment is this: stop thinking of the Top 50 as “50 pieces of prose to retrieve.” Think of it as 50 known answer intents to classify into. The prose answer is the payload. Retrieval is only a candidate-generation tool. The primary online problem is selecting the correct faq_id.

Your docs currently preserve the FAQ arm as retrieval-backed rather than a deterministic answer table, largely because the architecture wanted controlled retrieval rather than a cache of answer blobs.

But the uploaded corpus fact changes the internal design pressure: if the corpus is exactly a structured Top 50 FAQ, with prose answers, no tables, and no fragments, then chunk-level retrieval over answer text is not the highest-accuracy primitive. Your own Section 03 already leaves open simplification when source units are reliably answer-sized.

I would keep the external contract and evidence discipline, but internally move the FAQ path to FAQ-record routing.

The architecture I would ship is this:

Slack/AZA conversational layer
|
| current user turn + compact conversation frame
v
Follow-up resolver, no LLM on hot path
|
| resolved_query_frame:
| prior_faq_id, current_topic, action, subject, constraints, followup_type
v
Closed-world FAQ router
|
| candidate FAQ IDs from:
| current utterance
| state-expanded utterance
| follow-up transition graph
| entity/synonym match
| variant embeddings
v
Tiny scorer / calibrated classifier
|
| high confidence -> exact FAQ answer record
| ambiguous -> clarification or slower fallback
v
Skywalker evidence envelope
The compact state object should be small and mechanical. Something like:

{
"last_faq_id": "EXPENSE_VEHICLE_REIMBURSEMENT",
"domain": "EXPENSE",
"intent": "REIMBURSEMENT_RULE",
"action": "SUBMIT_EXPENSE",
"subject": "VEHICLE",
"constraints": {
"country": "US",
"level": "L6",
"role": "INDIVIDUAL_CONTRIBUTOR"
},
"answer_scope": ["eligibility", "documentation", "approval"],
"last_answered_at_turn": 3,
"confidence": 0.94
}
Then the follow-up “and what about my hotel room?” is not sent to retrieval as that raw string. It is classified as:

{
"followup_type": "SUBJECT_SUBSTITUTION",
"carry_forward": {
"domain": "EXPENSE",
"intent": "REIMBURSEMENT_RULE",
"action": "SUBMIT_EXPENSE",
"constraints": {
"country": "US",
"level": "L6",
"role": "INDIVIDUAL_CONTRIBUTOR"
}
},
"replace": {
"subject": "HOTEL_LODGING"
},
"candidate_query": "hotel lodging reimbursement rule submit expense US L6 individual contributor",
"candidate_faq_ids": [
"EXPENSE_HOTEL_LODGING_REIMBURSEMENT",
"EXPENSE_HOTEL_RECEIPT_REQUIREMENTS",
"EXPENSE_TRAVEL_LODGING_LIMITS"
]
}
That is a microsecond-to-low-millisecond operation if driven by dictionaries, a transition graph, and precomputed FAQ metadata. No LLM is needed.

The core artifact you are missing is an offline-authored FAQ intent catalog. Each FAQ should have something like this:

{
"faq_id": "EXPENSE_HOTEL_LODGING_REIMBURSEMENT",
"canonical_question": "What are the reimbursement rules for hotel or lodging expenses?",
"answer_text": "...source prose answer...",
"domain": "EXPENSE",
"intent": "REIMBURSEMENT_RULE",
"actions": ["SUBMIT_EXPENSE", "CLAIM_REIMBURSEMENT"],
"subjects": ["HOTEL", "LODGING", "ROOM", "ACCOMMODATION"],
"scope_dimensions": ["country", "level", "role"],
"positive_surface_forms": [
"hotel expense reimbursement",
"can I expense my hotel room",
"lodging reimbursement rules",
"submit hotel room expense",
"what about my hotel room"
],
"negative_surface_forms": [
"book a hotel",
"hotel availability",
"vacation hotel",
"customer hotel recommendation"
],
"followup_entrypoints": [
{
"from_intent": "REIMBURSEMENT_RULE",
"from_subject_any": true,
"utterance_subject_replace": ["HOTEL", "LODGING", "ROOM"],
"transition_type": "SUBJECT_SUBSTITUTION"
}
],
"related_faq_ids": [
"EXPENSE_HOTEL_RECEIPT_REQUIREMENTS",
"EXPENSE_TRAVEL_LODGING_LIMITS"
]
}
This catalog should be built offline. Use LLMs there as much as you want: extract candidate synonyms, generate paraphrases, build negative examples, generate follow-up variants, and propose transition edges. Then have SMEs or internal owners approve the catalog. Runtime should not be doing semantic invention. Runtime should be matching against a controlled, versioned, audited representation.

This is the practical solution to the 95% requirement: make the hard semantic work offline and make the online system almost stupid.

For the online scorer, I would not start with a neural model. I would start with a deterministic feature scorer, then move to logistic regression or LightGBM only after you have judged data. Features should include:

current_utterance_to_faq_variant_cosine
expanded_query_to_faq_variant_cosine
bm25_current_utterance_to_question_surfaces
bm25_expanded_query_to_question_surfaces
exact_subject_match
subject_substitution_match
intent_continuity_match
prior_faq_transition_prior
scope_applicability_match
negative_surface_match
last_faq_age_turns
ellipsis_score
pronoun_or_deictic_score
top1_top2_margin
A simple weighted version is enough to launch:

score(faq) =
0.30 \* semantic_similarity(expanded_query, faq.variants)

- 0.20 \* lexical_similarity(expanded_query, faq.question_surfaces)
- 0.20 \* entity_subject_match
- 0.15 \* intent_continuity
- 0.10 \* transition_graph_prior
- 0.05 \* scope_applicability

* 0.30 \* negative_surface_match
  Then set a high-confidence threshold and a margin threshold:

if top_score >= 0.86 and top_score - second_score >= 0.12:
return faq_id
elif followup_is_clear_but_entity_only and transition_graph_has_single_target:
return faq_id
else:
clarify or fallback
Do not treat those numbers as truth. They are placeholders. The important part is the shape: high precision first, calibrated on judged multi-turn data.

The follow-up resolver should recognize only a small number of follow-up types. For this domain, these are probably enough:

SUBJECT_SUBSTITUTION
"what about hotels?"
"and meals?"
"what about my car?"

SCOPE_REFINEMENT
"what about in India?"
"as a manager?"
"for L4s?"

DOCUMENTATION_DETAIL
"do I need a receipt?"
"what do I submit?"
"where do I upload it?"

APPROVAL_DETAIL
"does my manager need to approve?"
"what if it is over the limit?"

COMPARISON
"is that different for hotels vs car rentals?"
"same for international travel?"

REFERENCE_BACK
"can you show me the link?"
"where does it say that?"

AMBIGUOUS
"what about that?"
"and then?"
The last category is important. With a 95% target, “clarify” is not a failure if the turn is genuinely underspecified. Your Slack architecture already says that if the current turn is underspecified, the correct behavior is a Slack-side interaction decision, not a bad backend call built on guessed intent.

The product metric should distinguish “unnecessary clarification” from “correct clarification.” If you count every clarification as a miss, you will force the system into unsafe guesses.

For the Top 50 path, I would also stop indexing primarily over the answer prose. Index these separate fields:

canonical_question
approved_question_variants
approved_followup_variants
subject_synonyms
intent_keywords
negative_examples
answer_text
The answer text should be searchable, but it should not dominate routing. FAQ answers often contain policy prose that is semantically broad, while user questions are often intent-shaped. A lodging answer might mention receipt requirements, booking tools, nightly caps, reimbursement, and travel policy all in one paragraph. If you use answer prose as the main retrieval surface, “hotel room” may retrieve the wrong lodging-related FAQ. The question/variant/intent fields should dominate candidate generation, and the answer text should mainly serve as evidence payload.

Given your docs, the cleanest implementation is to add a new FAQ routing layer before evidence retrieval:

1. Resolve conversational follow-up into a small query frame.
2. Route to FAQ ID candidates using catalog + variants + transition graph.
3. If high-confidence FAQ ID:
   return that FAQ answer record as evidence, with source metadata.
4. If medium-confidence:
   send top N FAQ records to reranker, not arbitrary chunks.
5. If low-confidence:
   go dual-arm or ask clarification, depending on whether the user turn is under-specified.
   This preserves the architecture’s “structured evidence bundle” contract. The MCP result can still return result_kind, route, scope_snapshot, evidence, and abstain_reason; your docs already make that structured envelope the contract agents consume.

But internally, FAQ retrieval should become record selection, not passage search.

I would be aggressive here: for high-confidence closed-world FAQ matches, bypass the expensive evidence reranker. Your current docs say a strong FAQ route does not bypass reranking, but that decision was made for a retrieval-shaped FAQ arm.

With a 50-record controlled FAQ, a calibrated router can be the common scoring surface for the FAQ-only path. Save the reranker for medium-confidence cases, dual-arm cases, and audit/fallback. If the reranker burns 250–350 ms p95 and your total budget is under 400 ms, using it on every obvious Top 50 hit is paying the worst cost in the system when the candidate universe is already known.

The fallback spectrum should be ordered like this:

First, deterministic state expansion. This is the default. It handles “what about hotel rooms?” by carrying forward domain, action, and intent while replacing the subject. Latency is negligible.

Second, closed-world FAQ classification. It maps the expanded frame to one of 50 FAQ IDs. Latency is negligible to low single-digit milliseconds if variants are in memory.

Third, tiny ML scorer. Logistic regression, LightGBM, or a small ONNX cross-encoder over 50 FAQ records can run fast enough if you need learned ranking. Do not start here until the deterministic system’s error modes are visible.

Fourth, timeboxed local rewriter. If you absolutely need a runtime model, make it local, small, and non-blocking. Run it in parallel with deterministic routing, give it maybe 75–125 ms, and accept its rewrite only if it passes strict validation: it must preserve detected entities, must not invent scope, and must map to a known FAQ candidate. ElevenLabs’ “model racing” pattern is the relevant production analogue, but their published p95 still shows how dangerous rewrite latency can become.

Fifth, full LLM query rewrite. This is the generic industry answer, but it should be fallback, not hot path. Azure’s agentic retrieval pattern explicitly uses LLM query planning and chat history, but also notes that this adds latency and suggests faster models, summarized threads, limiting LLM processing, or excluding LLM processing entirely for simpler search paths.

Sixth, clarification. This is the right answer when the state graph cannot safely resolve the follow-up. Do not degrade into raw retrieval over “what about my hotel room?” and hope a vector model saves you.

The most useful implementation detail is the transition graph. For each FAQ, define allowed follow-up transitions:

{
"from_faq_id": "EXPENSE_VEHICLE_REIMBURSEMENT",
"transitions": [
{
"on_subject": ["HOTEL", "LODGING", "ROOM"],
"carry": ["domain", "intent", "action", "scope"],
"replace": {"subject": "HOTEL"},
"to_faq_ids": ["EXPENSE_HOTEL_LODGING_REIMBURSEMENT"]
},
{
"on_subject": ["MEAL", "DINNER", "FOOD"],
"carry": ["domain", "intent", "action", "scope"],
"replace": {"subject": "MEAL"},
"to_faq_ids": ["EXPENSE_MEAL_REIMBURSEMENT"]
},
{
"on_detail": ["RECEIPT", "DOCUMENTATION"],
"carry": ["domain", "subject", "scope"],
"replace": {"intent": "DOCUMENTATION_REQUIREMENT"},
"to_faq_ids": ["EXPENSE_VEHICLE_RECEIPT_REQUIREMENTS"]
}
]
}
This graph is tiny. Fifty nodes. Maybe a few hundred edges. It is auditable. It is testable. It is exactly the kind of thing that beats a runtime LLM under a strict latency and accuracy target.

Your eval should be exhaustive, not sampled like open-domain RAG. Build a multi-turn benchmark with every FAQ as a possible prior state. For each FAQ, generate and hand-check follow-ups across subject substitution, scope refinement, approval detail, receipt detail, comparison, reference-back, and ambiguous follow-ups. Include hard negatives: “what about hotels?” after a non-expense travel-booking question should not necessarily route to hotel reimbursement. Include adversarial phrasing like “hotel room” versus “hotel booking,” because those may belong to different answers.

Measure these separately:

followup_detection_accuracy
followup_resolution_accuracy
faq_id_top1_accuracy
faq_id_top3_recall
clarification_precision
unnecessary_clarification_rate
unsafe_guess_rate
answer citation correctness
p95 latency by route
For a 95% business target, I would optimize for unsafe_guess_rate near zero even if that increases correct clarifications. It is much easier to improve unnecessary clarifications later than to regain trust after confidently answering the wrong reimbursement policy.

One nuance: do not make the conversation frame a hidden permanent memory. The docs are right that Skywalker should remain stateless and that multi-turn handling belongs to the client/agent layer.

Keep the state in Slack/AZA, pass only the resolved current question or compact state-derived request into Skywalker. Your Slack section already says the app layer should turn follow-ups into coherent questions for Skywalker, and the backend should not reconstruct conversation state from fragments.

That boundary is still correct. What changes is that the Slack-side interpretation should not have to be a heavyweight LLM rewrite. It can be a deterministic resolver over a compact frame.

The minimum viable version I would ship:

Offline:

1. Build FAQ intent catalog.
2. Build subject/action/scope synonym dictionaries.
3. Build follow-up transition graph.
4. Generate 20–50 variants per FAQ, including follow-up variants.
5. Build judged multi-turn eval set.

Runtime:

1. Maintain compact conversation frame on client side.
2. Detect whether current turn is standalone or follow-up.
3. If standalone: route by FAQ catalog + variants.
4. If follow-up: resolve using frame + transition graph.
5. If high confidence: return exact FAQ evidence record.
6. If medium confidence: rerank top FAQ candidates.
7. If ambiguous: ask clarification.
8. If outside Top 50: dual-arm or UKB path.
   The direct answer to your concern is: your current enrichment state is not enough because it is probably descriptive state, not a routing state machine. For 95%, the state has to encode the last resolved FAQ intent and allowed transitions, not just “claim type” or a few extracted slots. The follow-up “what about hotel rooms?” is not a retrieval query. It is a graph transition: same task, new subject. Treat it that way.

The re-litigation I would make explicit in the architecture docs is:

D-new. Top 50 FAQ follow-ups are resolved through a closed-world FAQ router.

Decision:
For the controlled Top 50 corpus, the online system routes user turns to FAQ IDs using
approved FAQ metadata, variants, subject/action dictionaries, and a follow-up transition graph.
Runtime LLM query rewriting is not part of the hot path.

Rationale:
The corpus is small, structured, answer-sized, and high-accuracy. Closed-world routing is more
accurate, lower-latency, and more auditable than generic query rewriting.

Trigger to reopen:
If the corpus grows materially beyond the Top 50, if FAQ answers stop being answer-sized records,
or if judged follow-up traffic shows deterministic transition handling cannot reach the target.
That is the path I would trust under 400 ms. Generic conversational RAG says “rewrite the query.” Your constrained system should say: resolve the turn into a known FAQ intent, or clarify.

<<<<<<<<<<PREVIOUS CONVO>>>>>>>>>>>

Handling Follow-Up Questions in Enterprise RAG
Bottom line
The clearest industry pattern is this: production RAG systems do not treat follow-up turns as ordinary retrieval queries. They convert the turn into a retrieval-friendly representation first—usually a standalone question, a structured query plus filters, or a multi-query plan built from chat history and system constraints. At the same time, the better teams try very hard not to pay for a heavyweight rewrite on every turn; they preserve structured state outside free text, rely heavily on hybrid retrieval and metadata filtering, and only escalate to richer query planning when the turn is ambiguous, referential, or compound. That is the common thread across the guidance from [LangChain’s query-transformation writeup](https://blog.langchain.dev/query-transformations/), [Elasticsearch Labs](https://www.elastic.co/search-labs/blog/query-rewriting-llm-search-improve), [Agent Search](https://docs.cloud.google.com/generative-ai-app-builder/docs/answer), and [Azure AI Search agentic retrieval](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview).

Put bluntly: for your “what about my hotel room?” example, the winning move is usually stateful retrieval, not “just do vector search” and not “always run a big LLM rewrite first.” The question should inherit prior intent—expense policy, claim type, employee context, date range, region, customer, or account—and then search should run over that enriched state, ideally with filters and hybrid lexical-plus-semantic retrieval. That is exactly the direction visible in enterprise systems such as [AWS’s TP ICAP Bedrock case study](https://aws.amazon.com/blogs/machine-learning/how-tp-icap-transformed-crm-data-into-real-time-insights-with-amazon-bedrock/), [Vectara Intelligent Query Rewriting](https://docs.vectara.com/docs/tutorials/intelligent-query-rewriting), and [Databricks Instructed Retriever](https://www.databricks.com/blog/instructed-retriever-unlocking-system-level-reasoning-search-agents).

Why naive retrieval fails on follow-ups
There are really two distinct failure modes. The first is under-contextualization: if you embed only the follow-up string, you lose the referent. [LangChain’s query-transformation article](https://blog.langchain.dev/query-transformations/) uses the simple example “what can I do in Italy?” followed by “what type of food is there”; embedding only the second turn loses the fact that “there” refers to Italy. The second is over-contextualization: if you embed the entire conversation by default, unrelated previous turns can pollute retrieval and drag irrelevant documents into the candidate set.

This is not theoretical. [Haystack’s memory guide](https://haystack.deepset.ai/blog/memory-conversational-agents) shows why conversational systems need history at all: pronouns and elliptical requests only work because previous entities remain available. Without memory, a turn like “Where did he live?” can fail; with memory injection, the same turn resolves correctly. Your expense-policy example is the same class of problem—ellipsis and anaphora, not lack of lexical overlap.

Search platforms that are not explicitly conversational say this outright. [Google Cloud’s healthcare search guidance](https://docs.cloud.google.com/generative-ai-app-builder/docs/search-hc-data) warns that search is not conversational and recommends preserving full context in the query itself; its example is that “when was it diagnosed” is worse than restating the subject explicitly. In other words, the retrieval layer needs either a rewritten query or a maintained state representation, because raw human follow-up language is often too compressed for search.

What enterprise teams actually deploy
The old but still dominant baseline is standalone-question rewriting. [Elasticsearch Labs’ chatbot tutorial](https://www.elastic.co/search-labs/tutorials/chatbot-tutorial/implementation/history) describes follow-up handling by storing prior turns and using an LLM to generate a condensed question for retrieval; [Agent Search](https://docs.cloud.google.com/generative-ai-app-builder/docs/answer) explicitly supports multi-turn search, rephrasing the query and searching, with configurable rephrase steps; and [Azure AI Search agentic retrieval](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview) uses chat history to break complex or conversational queries into focused subqueries. In other words, “rewrite the turn into something a retriever understands” is still the mainstream baseline.

But the more mature enterprise pattern is structured rewriting, not just natural-language paraphrase. [Vectara’s Intelligent Query Rewriting docs](https://docs.vectara.com/docs/tutorials/intelligent-query-rewriting) separate the natural-language core of a query from filter expressions, so the system can remove filter language from the search string and apply it as metadata constraints. [AWS’s TP ICAP Bedrock deployment](https://aws.amazon.com/blogs/machine-learning/how-tp-icap-transformed-crm-data-into-real-time-insights-with-amazon-bedrock/) uses hybrid search plus metadata filtering, and then improves it further with implicit metadata filtering that maps query terms onto metadata fields automatically before retrieval. [Databricks Instructed Retriever](https://www.databricks.com/blog/instructed-retriever-unlocking-system-level-reasoning-search-agents) pushes this even further by translating user instructions into multiple structured retrieval queries with schema-aware filters. This is important because many follow-up failures are not just “pronoun resolution” failures; they are failures to preserve hidden structure such as date, location, product line, customer, or exclusion constraints.

The other big production insight is that rewriting alone is not the retrieval strategy. [Elasticsearch Labs](https://www.elastic.co/search-labs/blog/query-rewriting-llm-search-improve) reports that hybrid search is hard to beat and that simple query-rewrite terms are usually better as boosters on top of the original query than as replacements for it. In its experiments, the best pattern was to keep the original query in a hard must clause and add rewritten keywords or pseudo-answers in should clauses, so the rewrite boosts ranking without replacing the user’s actual intent. That is a very practical enterprise answer to the “LLM rewrite might drift” problem.

Finally, production teams attack latency from several angles at once. [Redis’s latency guide](https://redis.io/blog/how-to-improve-llm-ux-speed-latency-and-caching/) notes that LLM apps are often chains of prompt rewriting, retrieval, tool calls, and safety checks, so small delays compound; it recommends shrinking prompts, caching retrieval and tool results, and parallelizing independent work. [Haystack’s memory guide](https://haystack.deepset.ai/blog/memory-conversational-agents) recommends summarizing memory periodically to avoid context-window overflow and token growth. [Anthropic’s Contextual Retrieval post](https://www.anthropic.com/news/contextual-retrieval) moves part of the problem to indexing time by prepending chunk-specific context before embedding and BM25 indexing, improving retrieval without adding a per-query rewrite step. [Agent Search](https://docs.cloud.google.com/generative-ai-app-builder/docs/answer) also suggests decoupling fast search results from slower answer generation so users do not wait on the whole pipeline before seeing anything useful.

The full spectrum of solutions
At the fast end of the spectrum, teams keep explicit conversational state outside the rewrite model. Instead of asking an LLM to rediscover everything each turn, they persist slots such as tenant, customer, region, date range, product, expense category, or claim type, then merge the new user turn with that state before retrieval. In real systems this appears as metadata filters, session context, and permission-aware retrieval rather than free-form paraphrase. [AWS’s TP ICAP example](https://aws.amazon.com/blogs/machine-learning/how-tp-icap-transformed-crm-data-into-real-time-insights-with-amazon-bedrock/) and [Amazon Bedrock implicit filtering docs](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-config.html?utm_source=chatgpt.com) are concrete examples.

The next level is memory without full retrieval planning. Here the system stores recent turns or summaries and injects only the useful conversational context into the next call. This is enough for pronouns and short elliptical continuations, but it does not solve structured filtering or tool-routing by itself. [Haystack](https://haystack.deepset.ai/blog/memory-conversational-agents) shows both straight memory injection and periodic summarization to keep the memory manageable.

After that comes cheap or selective rewrite, which is where most enterprise engineering energy currently goes. [Elasticsearch Labs](https://www.elastic.co/search-labs/blog/query-rewriting-llm-search-improve) recommends gated query rewriting, strict prompting, and preserving the original query while using LLM output as a booster, not a replacement. It also found that a smaller Haiku-class model preserved top-10 relevance and recall relative to a larger Sonnet-class model for lexical keyword enrichment, suggesting that lightweight rewrites do not always need premium models. [LangChain’s history-aware retriever reference](https://reference.langchain.com/python/langchain-classic/chains/history_aware_retriever/create_history_aware_retriever?utm_source=chatgpt.com) follows the same spirit: if there is no chat history, it passes the input directly to the retriever rather than paying for rewrite work unnecessarily.

Then there is managed conversational retrieval, where the rewrite or planning step is folded into a single retrieval API call, even if there may still be model work under the hood. [Agent Search](https://docs.cloud.google.com/generative-ai-app-builder/docs/answer) supports multi-turn answers and follow-ups, query rephrasing, query classification, and configurable rephrase steps. [Azure AI Search agentic retrieval](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview) uses an LLM to analyze the whole chat thread, generate focused subqueries, and execute them in parallel. [Vectara](https://docs.vectara.com/docs/tutorials/intelligent-query-rewriting) exposes query rewriting as a retrieval feature, and [Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html?utm_source=chatgpt.com) supports implicit filtering and session/context primitives. This approach is attractive if you want the capability but do not want to own the orchestration hop yourself.

Above that is routing plus specialized retrieval backends. In real enterprise assistants, not every follow-up belongs on the same retriever. [AWS’s TP ICAP system](https://aws.amazon.com/blogs/machine-learning/how-tp-icap-transformed-crm-data-into-real-time-insights-with-amazon-bedrock/) analyzes the query, routes some turns to unstructured RAG and others to text-to-SQL, and still supports follow-up refinements and filters. [Haystack’s fallback tutorial](https://haystack.deepset.ai/tutorials/36_building_fallbacks_with_conditional_routing) shows the same idea in open-source form: if the local corpus cannot answer, route to a web-RAG branch instead of pretending the retriever should handle everything.

At the highest-capability end is agentic or instructed retrieval. This is no longer just “rewrite one question”; it is “turn user intent, system instructions, examples, and schema into a retrieval plan.” [Databricks Instructed Retriever](https://www.databricks.com/blog/instructed-retriever-unlocking-system-level-reasoning-search-agents) argues that traditional RAG loses system specifications after the first query, while its instructed retriever propagates them through retrieval and generation, supports query decomposition, contextual relevance, and metadata reasoning, and is designed to work even with smaller tuned models. [Azure AI Search agentic retrieval](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview) makes a very similar move on the managed-service side. This is the strongest answer to hard follow-ups, but it is also the far end of the latency-and-complexity curve.

What the academic literature adds
The academic literature largely validates the enterprise intuition that the problem is not “how do I retrain my retriever on conversations?” but “how do I transform the conversational turn so existing retrieval machinery can work?” [CONQRR](https://arxiv.org/abs/2112.08558) makes that point directly: conversational QA is hard because each question must be interpreted in dialogue context, and retraining established retrievers can be expensive, so the paper rewrites the conversational question into a standalone one that can be consumed by off-the-shelf retrievers.

That same line continues in [Query Rewriting for Retrieval-Augmented Large Language Models](https://arxiv.org/abs/2305.14283?utm_source=chatgpt.com), which proposes Rewrite-Retrieve-Read as a general framework, and in [MaFeRw](https://arxiv.org/abs/2408.17072), which explicitly notes that real-world RAG queries often contain spoken ellipses and ambiguous references from dialogue context. MaFeRw is especially relevant to your latency concern because it argues that traditional context-based rewriting can have only limited downstream benefit when the full rewrite-to-generation path becomes too long, and then tries to fix that with a smaller T5-style rewriter optimized using retrieval and generation signals.

The literature also points toward lower-latency alternatives to full free-form generation. [HyDE](https://arxiv.org/abs/2212.10496?utm_source=chatgpt.com) improves zero-shot dense retrieval by generating a hypothetical document for the query, but [ReDE-RF](https://arxiv.org/html/2410.21242v1) argues that hypothetical-document generation is inefficient because it consumes many output tokens. ReDE-RF reframes the problem as relevance estimation over real retrieved documents, requiring only a single-token relevance decision from the model, improving latency, and then goes further by distilling the method into a smaller retriever that removes the LLM from inference time altogether. That is almost a research version of what enterprise teams want in production: use model intelligence to improve retrieval, but push as much of that cost as possible offline or into tiny specialist models.

The important nuance is that academia and industry are converging on the same answer: use query transformation, but make it narrow, retrieval-aware, and cheap. Do not default to a giant free-form rewrite every turn if a structured filter extractor, a small rewriter, a relevance classifier, or an offline-distilled retriever will do.

Recommended architecture for your exact problem
If I were building your system, I would not make “LLM rewrite every follow-up” the default hot path. I would make the hot path state merge plus hybrid retrieval, and reserve model-heavy planning for the minority of turns that actually need it. The state object would carry the durable parts of the conversation—policy domain, expense class, employee or account scope, geography, date range, and any explicit exclusions—and every new turn would either update or inherit those values. This is the same structural move behind metadata filtering, implicit filtering, and schema-aware query generation in the enterprise systems above.

Then I would put a cheap gate in front of rewriting. Self-contained turns go straight to retrieval. Referential or elliptical turns—pronouns, “what about…”, “and for hotels?”, “how about last month?”, “same for EMEA?”—go through a fast rewriter or a managed query-rephraser. Analytical turns route to SQL or another structured backend instead of pretending the vector store should answer everything. This matches the selective-rewrite guidance from [Elasticsearch Labs](https://www.elastic.co/search-labs/blog/query-rewriting-llm-search-improve), the pass-through behavior in [LangChain’s history-aware retriever reference](https://reference.langchain.com/python/langchain-classic/chains/history_aware_retriever/create_history_aware_retriever?utm_source=chatgpt.com), and the routing pattern in [AWS’s TP ICAP deployment](https://aws.amazon.com/blogs/machine-learning/how-tp-icap-transformed-crm-data-into-real-time-insights-with-amazon-bedrock/).

When rewrite is necessary, I would ask for structured output, not a single free-form paraphrase. The object should look conceptually like: standalone query, metadata filters, optional expansion terms, and optional route hint. Retrieval should keep the original user query as a hard constraint and use rewrite products only as boosters or filters. That design follows the best empirical pattern reported by [Elasticsearch Labs](https://www.elastic.co/search-labs/blog/query-rewriting-llm-search-improve) and the filter-separation approach described by [Vectara](https://docs.vectara.com/docs/tutorials/intelligent-query-rewriting).

I would also assume that rewriting is only one small part of recall quality. Use hybrid BM25 plus vectors, not vectors alone; add metadata prefilters whenever available; rerank only after you have built a good candidate set; and do not expect query rewriting to outperform a well-tuned hybrid baseline by itself. That is exactly what the enterprise evidence says.

To hold latency down, I would stack four optimizations. First, use a small or distilled rewriter where possible, because this class of task appears much more compressible than answer generation. Second, move some disambiguation to indexing time with chunk contextualization or better chunk metadata. Third, summarize memory periodically instead of dragging the whole transcript through every turn. Fourth, cache aggressively: embeddings, retrieval results, tool outputs, and common rewrites. Those recommendations are directly supported by the guidance from [Elasticsearch Labs](https://www.elastic.co/search-labs/blog/query-rewriting-llm-search-improve), [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval), [Haystack](https://haystack.deepset.ai/blog/memory-conversational-agents), and [Redis](https://redis.io/blog/how-to-improve-llm-ux-speed-latency-and-caching/).

So the concrete answer to your question is this: the best-practice spectrum is not “rewrite or don’t rewrite.” It is:

preserve structured conversational state whenever possible;
use hybrid retrieval and filters as the real foundation;
selectively rewrite ambiguous follow-ups with a small or managed component;
route non-RAG turns to structured tools;
and only escalate to multi-query or agentic retrieval for the hardest cases.
That, more than any single trick, is what “industry consensus” currently looks like.

Open questions and limitations
Most of the public enterprise evidence here comes from vendor docs, engineering blogs, and case studies rather than neutral head-to-head benchmarks on the same enterprise corpora. The convergence across sources is meaningful, but some of the exact uplift numbers should still be read as environment-specific rather than universal. Even [Elasticsearch Labs](https://www.elastic.co/search-labs/blog/query-rewriting-llm-search-improve) notes that some of its small-model rewrite findings need more study in real-world deployments, and the more ambitious retrieval systems from [Databricks](https://www.databricks.com/blog/instructed-retriever-unlocking-system-level-reasoning-search-agents) and [Azure AI Search](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview) reflect particular product architectures.

There is also an ambiguity in “latency” when using managed platforms. A product such as [Agent Search](https://docs.cloud.google.com/generative-ai-app-builder/docs/answer), [Azure AI Search](https://learn.microsoft.com/en-us/azure/search/agentic-retrieval-overview), or [Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html?utm_source=chatgpt.com) may remove an application-level rewrite round trip, but it can still be doing model-backed rephrasing or planning internally. That can still be the right decision, because you avoid orchestration complexity and sometimes get better optimization, but it is not the same thing as “no model work happened.”

The last important limit is that the best answer depends on whether your corpus is mostly policy text, semi-structured records, or analytical tables. The more structured the domain, the less you want a free-form rewrite and the more you want explicit state, filters, and routing. The more open-ended the domain, the more value there is in standalone-question generation, pseudo-answer expansion, or multi-query planning. The evidence above supports that distinction strongly, but it still has to be tuned against your own query mix and eval set.
