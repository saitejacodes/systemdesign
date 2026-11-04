-- Semantic cache: answers stored with the embedding of the prompt that produced them (pgvector).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE semantic_cache (
  id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Scope: a hit may only return an answer produced for the same tenant by the same model version.
  tenant_id         text        NOT NULL REFERENCES tenants (id),
  model_version     text        NOT NULL,
  prompt            text        NOT NULL,
  embedding         vector(384) NOT NULL,     -- bge-small-en-v1.5 produces 384 dimensions
  response          text        NOT NULL,
  completion_tokens integer     NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL
);

-- Approximate nearest neighbour search on cosine distance. HNSW: good recall without a training step,
-- at the cost of slower inserts and more memory than IVFFlat.
CREATE INDEX semantic_cache_embedding_idx ON semantic_cache USING hnsw (embedding vector_cosine_ops);
CREATE INDEX semantic_cache_scope_idx ON semantic_cache (tenant_id, model_version, expires_at);
