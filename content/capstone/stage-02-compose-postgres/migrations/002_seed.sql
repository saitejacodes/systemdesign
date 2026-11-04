-- Three test tenants for the lab. These keys are lab-only test values; never reuse them anywhere real.
--   acme    gold      sk-lab-acme-0001
--   globex  standard  sk-lab-globex-0001
--   noisy   free      sk-lab-noisy-0001   (stage 5 and the Break-it checklist use it as the noisy neighbour)
INSERT INTO tenants (id, name, tier, tokens_per_minute) VALUES
  ('acme',   'Acme Corp',      'gold',     20000),
  ('globex', 'Globex',         'standard', 10000),
  ('noisy',  'Noisy Neighbour','free',      4000);

INSERT INTO api_keys (key_hash, key_prefix, tenant_id)
SELECT encode(sha256(convert_to(k, 'UTF8')), 'hex'), left(k, 12), t
  FROM (VALUES ('sk-lab-acme-0001', 'acme'), ('sk-lab-globex-0001', 'globex'), ('sk-lab-noisy-0001', 'noisy')) AS v (k, t);
