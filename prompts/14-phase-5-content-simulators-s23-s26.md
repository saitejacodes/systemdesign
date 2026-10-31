Read CLAUDE.md §6 and §7. Task: write ALL Phase 5 sections and build 4 simulators.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."
Do the content first, report, then the simulators.

CONTENT
Observability (week 11):
1. logging: structured logs, levels, correlation/request IDs, centralized logging, cost & sampling.
2. metrics: counters/gauges/histograms; RED and USE methods; cardinality explosions.
3. tracing: spans, trace context propagation, sampling, OpenTelemetry; finding the slow hop.
4. slos: SLI vs SLO vs SLA; choosing SLIs; error budgets & burn-rate alerts; policy when
   the budget is exhausted.
5. alerting: symptom-based alerts, paging vs ticketing, alert fatigue, runbooks.
Security (week 11):
6. authn-authz: sessions vs tokens; OAuth 2.0 flows (authorization code + PKCE, client
   credentials); OIDC; JWT structure, signing, expiry, and the revocation problem
   (short TTL + refresh tokens, denylists).
7. access-control: RBAC vs ABAC; least privilege; service-to-service auth (mTLS, workload identity).
8. data-protection: encryption in transit/at rest; key management (KMS, envelope
   encryption); secrets management; PII handling.
9. common-attacks: DDoS & mitigation layers; injection; SSRF; OWASP Top 10 overview.
Deployment (week 12):
10. containers: images, layers, why containers; Docker basics.
11. kubernetes: pods, deployments, services, ingress, HPA, probes (liveness/readiness);
    what to know for interviews vs not.
12. ci-cd: pipeline stages, testing pyramid, artifact promotion, rollback.
13. release-strategies: rolling, blue-green, canary, feature flags, dark launches;
    database migrations without downtime (expand/contract pattern).
14. iac: Terraform concepts, declarative infra, drift (awareness).

SIMULATORS
Build simulators in the order listed and say "Next: <simulator id>" after each one is
finished and tested, so you can be resumed with "Continue exactly where you stopped."

S23. observability-lab (sections: logging, metrics, tracing)
 A fake system: gateway → users, orders, payments, inventory services + DB + cache,
 generating synthetic logs, metrics and traces continuously.
 UI: mini dashboard (RED metrics per service), log explorer (filter by service, level,
 request id), trace explorer (waterfall view of spans).
 Incident mode: 5 scripted incidents (slow DB query in orders, payments 3rd-party
 timeout, cache node down, memory leak in inventory, bad deploy raising 500s in users).
 The learner investigates and submits a root cause (multiple choice + which service);
 scored on correctness and time.
 Challenge: solve all 5 incidents.

S24. error-budget (section: slos)
 Set SLO (e.g. 99.9% over 30 days); simulate a month with random + learner-triggered
 incidents (duration, % errors). Shows budget remaining, burn rate, and when fast-burn
 (14.4× over 1h) and slow-burn alerts would fire.
 Challenge: given a month of incidents, decide whether a risky release should ship
 (policy question, auto-checked).

S25. deployment (section: release-strategies)
 10 servers, traffic flowing; deploy v2 using rolling (batch size), blue-green, or canary
 (% steps, automated analysis on error rate). v2 can be "good" or "bad" (hidden until
 errors appear; learner chooses which to test).
 Metrics: users affected by errors, deployment time, extra capacity needed,
 rollback time. Database migration mini-mode: expand/contract steps in correct order
 (learner arranges steps; wrong order causes simulated errors).
 Challenge: deploy a bad version affecting < 1% of users.

S26. jwt-inspector (section: authn-authz)
 Paste or generate a JWT; decode header/payload with explanation of each claim;
 sign with HS256 using a demo secret (Web Crypto) and verify; tamper with payload →
 signature fails; show "alg: none" attack explanation (no executable attack, explanation only).
 Revocation demo: user logs out but token stays valid until exp; compare fixes
 (short TTL + refresh, denylist) with a timeline.
 Use only demo keys generated in-browser; never send tokens anywhere.

Definition of Done: CLAUDE.md §8.
