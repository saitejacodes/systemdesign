-- A tenant for load tests with a budget no test will hit, so k6 measures the model fleet, not the rate limiter.
-- (Use the noisy tenant when you DO want to see the limiter: k6/noisy-neighbour.js.) Lab-only test key.
INSERT INTO tenants (id, name, tier, tokens_per_minute) VALUES ('loadtest', 'Load test', 'gold', 100000000);
INSERT INTO api_keys (key_hash, key_prefix, tenant_id)
VALUES (encode(sha256(convert_to('sk-lab-load-0001', 'UTF8')), 'hex'), 'sk-lab-load-', 'loadtest');
