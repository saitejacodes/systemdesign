-- Offline batch jobs: submitted in one call, run in the background at the lowest priority, results polled later.
CREATE TABLE batches (
  id               text        PRIMARY KEY,
  tenant_id        text        NOT NULL REFERENCES tenants (id),
  -- The client's Idempotency-Key: submitting the same batch twice (a retry after a timeout) returns the first one.
  idempotency_key  text        NOT NULL,
  total            integer     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE batch_items (
  batch_id          text        NOT NULL REFERENCES batches (id) ON DELETE CASCADE,
  custom_id         text        NOT NULL,
  request           jsonb       NOT NULL,
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  response          text,
  error             text,
  prompt_tokens     integer,
  completion_tokens integer,
  attempts          integer     NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, custom_id)
);
-- The worker's sweeper looks for items still pending long after submission (see republishStale in src/worker.ts).
CREATE INDEX batch_items_pending_idx ON batch_items (updated_at) WHERE status = 'pending';
