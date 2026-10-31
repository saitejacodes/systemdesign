Read CLAUDE.md §6 and §7. Task: write ALL Phase 6 sections and build 2 simulators.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

CONTENT (week 13)
1. serverless: FaaS model, cold starts, concurrency limits, cost at low vs high scale,
   when NOT to use it.
2. edge-computing: edge functions, edge caching & personalization, data locality limits.
3. stream-processing: streams vs batch; windowing (tumbling, sliding, session); event time
   vs processing time; watermarks; late data; exactly-once effects; Flink/Kafka Streams (awareness).
4. batch-processing: MapReduce model, ETL/ELT, Spark (awareness); lambda vs kappa architecture.
5. multi-region: active-passive vs active-active, data residency, conflict resolution,
   latency-based routing.
AI-native systems:
6. embeddings-vector-search: what embeddings are; cosine similarity; exact vs ANN search;
   HNSW intuition; IVF (awareness); recall vs latency tradeoff; pgvector vs dedicated
   vector DBs; metadata filtering.
7. rag: ingestion (parsing, chunking strategies & sizes, overlap), embedding, retrieval,
   hybrid search (BM25 + vectors), reranking, context assembly, citation; failure modes
   (bad chunking, retrieval misses, stale index); freshness & re-indexing.
8. llm-serving: tokens, prefill vs decode, batching (continuous batching), KV cache,
   streaming responses, GPU memory constraints; latency metrics (time to first token,
   tokens/sec); using hosted APIs vs self-hosting.
9. llm-cost-latency: model routing (small model first, escalate), prompt caching,
   semantic caching (and its risks), token budgets, rate limits & quotas.
10. ai-reliability: timeouts, retries, provider failover, fallbacks, graceful degradation,
    structured output validation.
11. evals-guardrails: offline eval sets, LLM-as-judge (with caveats), regression testing
    prompts, input/output filtering, PII handling, monitoring quality in production.
12. agents: tool calling loop, state, idempotent tools, limits on steps/cost, human-in-the-loop.
Be careful about accuracy: describe concepts that are stable; avoid specific vendor
pricing or benchmark numbers.

SIMULATORS
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S27. vector-search (section: embeddings-vector-search)
 Ship a small precomputed dataset (~2,000 short texts across 8 topics, with embeddings
 reduced to 2D via PCA/UMAP done at build time and stored as JSON; also store
 full-dimension vectors if size allows, else use 64-d).
 Query by picking a sample query or nearest dataset item; shows top-k neighbors
 (cosine), 2D scatter with query and neighbors highlighted.
 Implement brute-force search and a small HNSW (M, efConstruction, efSearch params)
 in TypeScript; compare recall@10 and "distance computations" for both.
 Metadata filter toggle (pre-filter vs post-filter, showing post-filter's "too few results" issue).
 Challenge: reach recall@10 ≥ 0.95 with < 20% of brute-force computations.

S28. rag-pipeline (section: rag)
 Node-based pipeline builder (React Flow): Source docs → Chunker (size, overlap,
 strategy: fixed/sentence/heading) → Embedder → Index → Retriever (top-k, hybrid toggle)
 → Reranker (toggle) → Prompt assembler (token budget) → LLM → Answer.
 Bundled corpus: a fictional company handbook (write it: ~25 pages of policy docs) and
 20 evaluation questions with gold answers and gold source passages.
 Offline mode (default, no API key): retrieval runs for real in-browser (lexical BM25 +
 precomputed embeddings); generation step shows the assembled prompt and a precomputed
 reference answer; eval shows retrieval hit rate (did gold passage appear in context).
 Online mode (API key set): generation runs for real via /lib/ai; eval can use
 LLM-as-judge with a visible rubric.
 Metrics: retrieval hit rate, context tokens, estimated cost per query (user-entered
 price per 1k tokens), latency breakdown.
 Challenge: reach ≥ 90% retrieval hit rate on the 20 questions with ≤ 2,000 context tokens.

Definition of Done: CLAUDE.md §8. The whole simulator works without an API key.
