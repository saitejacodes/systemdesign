Read CLAUDE.md §7. Task: write ALL Phase 1 sections fully. "client-server" already exists;
review it against the standard, then write the rest. Each section gets meta.json,
lesson.mdx, quiz.json, flashcards.json, checkpoints.json, resources.json.
This is a big prompt: write sections in order and say "Next: <section>" between them
so you can be resumed with "Continue exactly where you stopped."

Sections and MUST-COVER points:

1. client-server (week 1): request/response lifecycle; stateless vs stateful servers;
   where state lives (client, server memory, DB, cache); why statelessness enables scaling.
2. monolith-vs-microservices (week 1): modular monolith; microservice benefits (independent
   deploy, team ownership, independent scaling); costs (network latency, partial failure,
   distributed data, observability burden); Conway's law; when NOT to use microservices.
3. scaling (week 1): vertical vs horizontal; limits of vertical; stateless app tier;
   scaling the data tier is the hard part; autoscaling basics.
4. estimation (week 1): a repeatable back-of-envelope method (this section is its home;
   the full 7-step interview framework lives in Phase 7); DAU→QPS (1 day ≈ 10⁵ s),
   peak factor 2–10×; storage per year; bandwidth; read:write ratio; latency numbers
   table; availability nines table; 3 fully worked examples (Twitter-like timeline,
   image hosting, chat).
5. latency-throughput (week 1): definitions; percentiles p50/p95/p99; tail latency and
   fan-out amplification; Little's Law (L = λW) with an example.
6. dns (week 2): resolution chain (stub, recursive, root, TLD, authoritative); record types
   A/AAAA/CNAME/NS/TXT; TTL tradeoffs; DNS load balancing and GeoDNS; anycast basics.
7. tcp-udp (week 2): TCP handshake, reliability, ordering, flow & congestion control
   (conceptual); UDP use cases; head-of-line blocking.
8. http (week 2): HTTP/1.1 keep-alive, HTTP/2 multiplexing, HTTP/3 & QUIC; methods,
   status codes, idempotent vs safe methods; headers relevant to caching.
9. tls (week 2): what TLS provides; handshake overview; certificates & CAs;
   TLS termination at LB; mTLS between services.
10. load-balancers (week 2): L4 vs L7; algorithms (round robin, weighted, least
    connections, IP hash, consistent hashing); health checks; sticky sessions and why
    to avoid them; LB as SPOF and how to make it redundant.
11. reverse-proxy (week 2): reverse vs forward proxy; Nginx/Envoy roles; TLS offload,
    compression, buffering; sidecar proxies (awareness).
12. realtime (week 2): short polling, long polling, SSE, WebSockets compared on latency,
    server cost, direction, proxy compatibility; scaling WebSocket connections.

Volume and quality: per CLAUDE.md §7. Add every new term to glossary.json.
Reference simulator ids in meta.json (they'll be built in Prompt 07):
estimation-calculator, request-journey, load-balancer, consistent-hashing, rate-limiter
(rate-limiter belongs to Phase 2 but link from load-balancers as "related").

Definition of Done: CLAUDE.md §8, all files pass validation, every section renders.
