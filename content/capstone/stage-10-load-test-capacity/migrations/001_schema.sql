-- Runs once, when the Postgres data volume is empty (docker-entrypoint-initdb.d).
-- A real project uses a migration tool (node-pg-migrate, Flyway, Sqitch) that records which versions ran.

CREATE TABLE tenants (
  id                text        PRIMARY KEY,
  name              text        NOT NULL,
  tier              text        NOT NULL CHECK (tier IN ('gold', 'standard', 'free')),
  tokens_per_minute integer     NOT NULL CHECK (tokens_per_minute > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- API keys are random, high-entropy strings, so a fast hash (SHA-256) is enough: there is nothing to brute-force
-- the way there is with human passwords (which need bcrypt/scrypt/argon2). A deterministic hash can also be the
-- primary key, so lookup is one index probe. The plaintext key is shown to the customer once and never stored.
CREATE TABLE api_keys (
  key_hash    text        PRIMARY KEY,           -- hex SHA-256 of the full key
  key_prefix  text        NOT NULL,              -- first 12 characters, to recognise a key in logs and UIs
  tenant_id   text        NOT NULL REFERENCES tenants (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

-- One row per request. request_id is the primary key, so writing the same request twice is a no-op:
-- retries of the ledger write (and, in stage 7, redelivered batch jobs) can never double-bill.
CREATE TABLE usage_ledger (
  request_id        text        PRIMARY KEY,
  tenant_id         text        NOT NULL REFERENCES tenants (id),
  model             text        NOT NULL,
  prompt_tokens     integer     NOT NULL CHECK (prompt_tokens >= 0),
  completion_tokens integer     NOT NULL CHECK (completion_tokens >= 0),
  source            text        NOT NULL DEFAULT 'interactive' CHECK (source IN ('interactive', 'batch', 'cache')),
  status            text        NOT NULL CHECK (status IN ('ok', 'cancelled', 'error')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- Serves "this tenant's usage, newest first" and keyset pagination on (created_at, request_id).
CREATE INDEX usage_ledger_tenant_time_idx ON usage_ledger (tenant_id, created_at DESC, request_id DESC);

-- Daily rollup, updated in the same statement as the ledger insert (see recordUsage in src/db.ts).
CREATE TABLE usage_daily (
  tenant_id         text    NOT NULL REFERENCES tenants (id),
  day               date    NOT NULL,
  requests          integer NOT NULL,
  prompt_tokens     bigint  NOT NULL,
  completion_tokens bigint  NOT NULL,
  PRIMARY KEY (tenant_id, day)
);
