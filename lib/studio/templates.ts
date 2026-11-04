import { defaultProps } from "./catalog";
import type { ComponentKind, PropValue, StudioEdge, StudioGraph, StudioNode } from "./types";

/**
 * "New from case study template" starters. Every case-study template is a PRACTICE STARTER: it holds only the givens
 * (who the users are, and any third party the problem fixes) laid out left-to-right with empty canvas in between.
 * The architecture is the learner's to draw; a filled-in answer would spoil the practice. The one exception is
 * "three-tier-web-app", a complete classic architecture for people who want something to explore.
 *
 * Numbers in notesIntro are the problem's assumptions, not facts about any real company.
 */
export interface StudioTemplate {
  id: string;
  caseStudyId?: string;
  title: string;
  /** One line for the template picker. */
  summary: string;
  difficulty: 1 | 2 | 3;
  graph: StudioGraph;
  /** Problem statement; the Notes panel appends notesTemplate()'s 7 headings after it. */
  notesIntro: string;
}

const GRID = 16;
const snap = (v: number) => Math.round(v / GRID) * GRID;

type NodeOpts = { props?: Record<string, PropValue>; parentId?: string; w?: number; h?: number };

function node(id: string, kind: ComponentKind, label: string, x: number, y: number, opts: NodeOpts = {}): StudioNode {
  return {
    id,
    kind,
    x: snap(x),
    y: snap(y),
    ...(opts.w !== undefined ? { w: snap(opts.w) } : {}),
    ...(opts.h !== undefined ? { h: snap(opts.h) } : {}),
    label,
    props: { ...defaultProps(kind), ...opts.props },
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
  };
}

function edge(source: string, target: string, kind: StudioEdge["kind"] = "sync", label?: string): StudioEdge {
  return { id: `e-${source}-${target}`, source, target, kind, direction: "forward", ...(label ? { label } : {}) };
}

// Givens layout: users on the left, fixed third parties on the right, ~1,100 px of empty canvas between them to build in.
const LEFT_X = 0;
const RIGHT_X = 1280;
const ROW = 192;

type Given = { id: string; kind: ComponentKind; label: string; props?: Record<string, PropValue> };

function givens(left: Given[], right: Given[] = [], edges: StudioEdge[] = []): StudioGraph {
  const column = (items: Given[], x: number) => {
    // Centre the shorter column on the taller one so the two sides line up.
    const offset = ((Math.max(left.length, right.length) - items.length) * ROW) / 2;
    return items.map((g, i) => node(g.id, g.kind, g.label, x, offset + i * ROW, { props: g.props }));
  };
  return { version: 1, nodes: [...column(left, LEFT_X), ...column(right, RIGHT_X)], edges };
}

const client = (id: string, label: string, platform: "web" | "mobile" | "both", users: number): Given => ({ id, kind: "client", label, props: { platform, users } });
const external = (id: string, label: string, latencyMs: number, rateLimitQps: number): Given => ({ id, kind: "external-api", label, props: { latencyMs, rateLimitQps } });

const M = 1_000_000;

// The one non-practice template: clients → DNS/CDN → LB → 3 stateless services across two AZs → cache + SQL, plus monitoring.
const threeTier: StudioGraph = {
  version: 1,
  nodes: [
    node("users", "client", "Users", 0, 320, { props: { platform: "both", users: 5 * M } }),
    node("dns", "dns", "DNS", 224, 176),
    node("cdn", "cdn", "CDN (static assets)", 224, 464),
    // Frames come before their children so React Flow sees each parent first.
    node("region", "frame", "Region us-east", 448, 0, { w: 1072, h: 720, props: { scope: "region" } }),
    node("az-a", "frame", "AZ us-east-a", 272, 64, { w: 352, h: 288, parentId: "region", props: { scope: "az" } }),
    node("az-b", "frame", "AZ us-east-b", 272, 384, { w: 352, h: 288, parentId: "region", props: { scope: "az" } }),
    node("lb", "load-balancer", "Load balancer", 48, 320, { parentId: "region" }),
    node("api-1", "service", "API 1", 32, 48, { parentId: "az-a", props: { instances: 1 } }),
    node("api-2", "service", "API 2", 32, 160, { parentId: "az-a", props: { instances: 1 } }),
    node("api-3", "service", "API 3", 32, 112, { parentId: "az-b", props: { instances: 1 } }),
    node("cache", "cache", "Cache", 720, 160, { parentId: "region" }),
    node("db", "sql-db", "SQL primary + 2 read replicas", 720, 432, { parentId: "region", props: { replicas: 2 } }),
    node("monitoring", "monitoring", "Monitoring", 48, 592, { parentId: "region" }),
  ],
  edges: [
    edge("users", "dns", "sync", "resolve"),
    edge("users", "cdn", "sync", "static"),
    edge("users", "lb", "sync", "API"),
    edge("lb", "api-1"),
    edge("lb", "api-2"),
    edge("lb", "api-3"),
    ...["api-1", "api-2", "api-3"].flatMap((s) => [edge(s, "cache", "sync", "read"), edge(s, "db", "sync", "miss / write")]),
  ],
};

export const TEMPLATES: StudioTemplate[] = [
  {
    id: "three-tier-web-app",
    title: "Three-tier web app",
    summary: "A complete classic architecture to explore: CDN, load balancer, stateless services across two AZs, cache and SQL.",
    difficulty: 1,
    graph: threeTier,
    notesIntro:
      "A worked starting point rather than a practice problem: a read-heavy web app serving 5M users from one region. " +
      "Static assets come from a CDN; API requests go through a load balancer to three stateless service instances spread over two availability zones, " +
      "which read through a cache and fall back to a SQL primary with two read replicas. Change the numbers, break a zone, and see what you would add first.",
  },
  {
    id: "url-shortener",
    caseStudyId: "url-shortener",
    title: "URL shortener",
    summary: "Short links that redirect: tiny writes, enormous reads.",
    difficulty: 1,
    graph: givens([client("creators", "Link creators", "web", 10 * M), client("visitors", "Visitors following links", "both", 500 * M)]),
    notesIntro:
      "Design a URL shortener: a user submits a long URL (optionally a custom alias) and gets a short link; anyone opening the short link is redirected to the original. " +
      "Assume 100M new links a month, a 100:1 read:write ratio, and links kept for 5 years. " +
      "Redirects must add under 50 ms at p99, a short link must never resolve to the wrong URL, and aliases must be hard to enumerate.",
  },
  {
    id: "rate-limiter-service",
    caseStudyId: "rate-limiter-service",
    title: "Rate limiter service",
    summary: "A shared limiter every API server consults on each request.",
    difficulty: 1,
    graph: givens([client("callers", "API callers", "both", 10 * M)]),
    notesIntro:
      "Design a distributed rate limiter that a fleet of 50 API servers consults on every request, enforcing rules such as 100 requests per minute per user and 10,000 per minute per API key. " +
      "Assume 1M requests per second at peak across the fleet, with limits that must hold across all servers rather than per server. " +
      "The check may add at most 5 ms at p99, rejected callers get a clear 429 with a retry hint, and an outage of the limiter must not take the APIs down with it.",
  },
  {
    id: "notification-system",
    caseStudyId: "notification-system",
    title: "Notification system",
    summary: "Push, email and SMS for every product team, through third-party providers.",
    difficulty: 2,
    graph: givens(
      [client("recipients", "Recipients", "both", 200 * M)],
      [external("push", "Push providers (APNs / FCM)", 200, 100_000), external("email", "Email provider", 500, 10_000), external("sms", "SMS provider", 1_000, 1_000)],
      [edge("push", "recipients", "async", "push"), edge("email", "recipients", "async", "email"), edge("sms", "recipients", "async", "SMS")],
    ),
    notesIntro:
      "Design a notification service that other product teams call to send push, email and SMS to users through third-party providers. " +
      "Assume 200M users and 1B notifications a day, with marketing campaigns causing 5× bursts; transactional messages (password reset, order shipped) must go out within seconds even during a campaign. " +
      "Respect each user's channel preferences, opt-outs and quiet hours, never send the same notification twice, and survive a provider being slow or down.",
  },
  {
    id: "typeahead",
    caseStudyId: "typeahead",
    title: "Search typeahead",
    summary: "Top completions for every keystroke, in under 100 ms.",
    difficulty: 2,
    graph: givens([client("searchers", "Searchers", "both", 100 * M)]),
    notesIntro:
      "Design search-as-you-type suggestions: as a user types into a search box, return the 10 most relevant completions for the current prefix. " +
      "Assume 100M daily users making 5 searches a day of about 20 characters, with a suggestion request on most keystrokes. " +
      "Suggestions must appear within 100 ms end to end, trending queries should surface within an hour, and offensive or blocked terms must never be suggested.",
  },
  {
    id: "video-streaming",
    caseStudyId: "video-streaming",
    title: "Video streaming",
    summary: "Upload, transcode and stream video on demand with adaptive bitrate.",
    difficulty: 3,
    graph: givens([client("creators", "Creators uploading", "web", 5 * M), client("viewers", "Viewers", "both", 200 * M)]),
    notesIntro:
      "Design a video-on-demand service: creators upload videos, which are transcoded into several resolutions, and viewers stream them with adaptive bitrate on phones, TVs and browsers. " +
      "Assume 200M daily viewers watching an hour each, 500 hours of video uploaded every minute, and a long tail where most views go to a small share of videos. " +
      "Playback should start in under 2 s, rebuffering should be rare, and an uploaded video should be watchable within minutes.",
  },
  {
    id: "ride-sharing",
    caseStudyId: "ride-sharing",
    title: "Ride sharing",
    summary: "Match riders with nearby drivers and track both live.",
    difficulty: 3,
    graph: givens(
      [client("riders", "Riders", "mobile", 50 * M), client("drivers", "Drivers", "mobile", 2 * M)],
      [external("maps", "Maps / routing & ETA provider", 150, 20_000), external("psp", "Payment service provider", 800, 2_000)],
    ),
    notesIntro:
      "Design a ride-hailing service: a rider requests a trip, the system matches them with a nearby available driver, both see each other's live location until drop-off, and the rider is charged at the end. " +
      "Assume 20M trips a day across hundreds of cities, up to 1M drivers online at peak each sending a GPS update every 4 s, and routing and ETAs from an external maps provider. " +
      "Riders should be matched within 10 s, a driver must never be assigned two trips at once, and each trip is charged exactly once.",
  },
  {
    id: "news-feed",
    caseStudyId: "news-feed",
    title: "News feed",
    summary: "A ranked feed of posts from everyone you follow, including accounts with tens of millions of followers.",
    difficulty: 2,
    graph: givens([client("users", "Users", "both", 500 * M)]),
    notesIntro:
      "Design a social news feed: users follow other users and open a ranked feed of recent posts (text and images) from the accounts they follow. " +
      "Assume 300M daily users who open the feed 10 times a day, an average of one new post per user per day, a median of 200 followees, and a few accounts with 50M followers. " +
      "The first page of the feed must load in under 300 ms at p99, and new posts should appear in followers' feeds within a minute.",
  },
  {
    id: "chat-app",
    caseStudyId: "chat-app",
    title: "Chat app",
    summary: "1:1 and group messaging with presence, receipts and offline delivery.",
    difficulty: 2,
    graph: givens([client("users", "Users", "both", 500 * M)], [external("push", "Push providers (APNs / FCM)", 200, 100_000)], [edge("push", "users", "async", "offline push")]),
    notesIntro:
      "Design a chat app with 1:1 conversations and groups of up to 500 members, showing online presence and delivered/read receipts. " +
      "Assume 500M daily users sending 40 messages a day each, history kept forever and synced across a user's phone and laptop, and offline users woken through mobile push providers. " +
      "Messages must arrive in order within a conversation, never be lost once the sender sees a tick, and reach an online recipient in under 500 ms.",
  },
  {
    id: "payment-system",
    caseStudyId: "payment-system",
    title: "Payment system",
    summary: "Checkout payments through a PSP, a ledger, and seller payouts: exactly once.",
    difficulty: 3,
    graph: givens(
      [client("buyers", "Buyers at checkout", "both", 50 * M), client("sellers", "Sellers", "web", 1 * M)],
      [external("psp", "Payment service provider (cards)", 800, 2_000), external("bank", "Bank payouts API", 2_000, 50)],
    ),
    notesIntro:
      "Design the payment backend of an online marketplace: buyers pay at checkout through an external payment service provider (PSP), and sellers are paid out to their bank accounts every day. " +
      "Assume 10M payments a day with 10× peaks on sale days, and PSP calls that can time out without telling you whether the charge happened. " +
      "A buyer must be charged exactly once even with retries, every money movement must be recorded in a double-entry ledger, and the ledger must reconcile daily against the PSP's settlement reports.",
  },
  {
    id: "job-scheduler",
    caseStudyId: "job-scheduler",
    title: "Distributed job scheduler",
    summary: "Run one-off and cron jobs on time, on a shared worker fleet.",
    difficulty: 2,
    graph: givens([client("owners", "Job owners (internal teams)", "web", 5_000)]),
    notesIntro:
      "Design a distributed job scheduler: internal teams register jobs to run once at a given time or on a cron schedule, and the system runs them on a shared fleet of workers. " +
      "Assume 10M executions a day with sharp peaks at the top of each hour, when many cron schedules fire together, and jobs that run from seconds to an hour. " +
      "A job should start within 5 s of its scheduled time, must run at least once and be retried on failure, and owners can see each run's status and logs.",
  },
  {
    id: "metrics-monitoring",
    caseStudyId: "metrics-monitoring",
    title: "Metrics & alerting",
    summary: "Ingest millions of data points a second; dashboards and pages on top.",
    difficulty: 3,
    graph: givens(
      [client("hosts", "Monitored hosts (agents)", "web", 100_000), client("engineers", "Engineers (dashboards)", "web", 10_000)],
      [external("pager", "Paging / on-call provider", 300, 100)],
    ),
    notesIntro:
      "Design a metrics and alerting system: agents on 100k hosts each report 1,000 time series every 10 s, engineers query dashboards over ranges from the last hour to the last year, and alert rules page the on-call engineer through an external paging provider. " +
      "Ingest must keep up with 10M data points per second, new points should be queryable within 30 s, and every alert rule is evaluated at least once a minute. " +
      "The system should keep alerting when parts of the infrastructure it watches are failing.",
  },
  {
    id: "web-crawler",
    caseStudyId: "web-crawler",
    title: "Web crawler",
    summary: "Crawl a billion pages a month, politely, without fetching the same page twice.",
    difficulty: 2,
    graph: givens([client("operators", "Crawl operators", "web", 50)], [external("web", "Public web (origin sites)", 500, 100_000)]),
    notesIntro:
      "Design a web crawler that feeds a search index: starting from a seed list, it fetches 1B pages a month, extracts links and stores the page content for indexing. " +
      "It must obey robots.txt, make at most one request per second to any single host, skip URLs and near-duplicate pages it already has, and recrawl frequently changing pages more often than static ones. " +
      "Assume an average page of 100 KB and a crawl that must keep making progress when machines fail.",
  },
  {
    id: "file-sync",
    caseStudyId: "file-sync",
    title: "File sync & share",
    summary: "Keep a folder in sync across devices and collaborators, without losing edits.",
    difficulty: 3,
    graph: givens([client("devices", "Desktop & mobile clients", "both", 100 * M)]),
    notesIntro:
      "Design a file sync and share service: users install a client on several devices, and any change in the synced folder appears on their other devices and for anyone the folder is shared with. " +
      "Assume 100M users (20M daily active) storing 2 GB each on average, files up to 10 GB, and devices that go offline for days. " +
      "Uploads must resume after a dropped connection, changes should propagate within 10 s, and conflicting offline edits must never silently lose data.",
  },
  {
    id: "ticket-booking",
    caseStudyId: "ticket-booking",
    title: "Ticket booking",
    summary: "Pick-your-seat booking that survives a big on-sale and never sells a seat twice.",
    difficulty: 2,
    graph: givens([client("fans", "Fans", "both", 20 * M)], [external("psp", "Payment service provider", 800, 2_000)]),
    notesIntro:
      "Design ticket booking for concerts and sports: users browse events, choose specific seats on a seat map, hold them for 10 minutes while paying through an external payment provider, and receive tickets. " +
      "Assume 20M users and a popular on-sale where 1M people arrive in the first minute for 50,000 seats. " +
      "A seat must never be sold twice, unpaid holds must be released on time, and the site should stay up and fair to everyone in line during the spike.",
  },
  {
    id: "rag-docs-assistant",
    caseStudyId: "rag-docs-assistant",
    title: "RAG docs assistant",
    summary: "Answer questions over internal docs with citations, permission-aware.",
    difficulty: 2,
    graph: givens(
      [client("employees", "Employees", "web", 200_000)],
      [
        { id: "sources", kind: "external-api", label: "Document sources (wiki, drive, tickets)", props: { latencyMs: 300, rateLimitQps: 200 } },
        { id: "embed-llm", kind: "llm-api", label: "Embedding model API", props: { latencyMs: 100, rateLimitRpm: 3_000 } },
        { id: "chat-llm", kind: "llm-api", label: "Chat model API", props: { latencyMs: 800, tokensPerS: 60, rateLimitRpm: 1_000 } },
      ],
    ),
    notesIntro:
      "Design an assistant that answers employees' questions about internal documentation, citing the passages it used: 5M documents (wiki pages, PDFs, tickets) pulled from source systems that change all day. " +
      "Assume 50,000 daily users asking 10 questions each, with embeddings and answers coming from hosted model APIs that have rate limits and per-token prices. " +
      "An answer may only draw on documents the asking user is allowed to read, the first token should appear within 2 s, and an edited document should be reflected within 15 minutes.",
  },
  {
    id: "api-gateway",
    caseStudyId: "api-gateway",
    title: "API gateway",
    summary: "One front door for 200 services: auth, limits, routing and usage metering.",
    difficulty: 2,
    graph: givens([client("consumers", "API consumers (partner apps)", "both", 10 * M)], [external("idp", "Identity provider (OAuth / JWKS)", 50, 5_000)]),
    notesIntro:
      "Design the API gateway in front of about 200 internal microservices that serve a public API: it authenticates API keys and OAuth tokens, enforces per-customer rate limits and monthly quotas, routes by path and version, and records usage for billing. " +
      "Assume 500k requests per second at peak across three regions and an external identity provider that issues the tokens. " +
      "The gateway may add at most 10 ms at p99, configuration changes must roll out without restarts, and one misbehaving route or backend must not affect the others.",
  },
  {
    id: "search-engine",
    caseStudyId: "search-engine",
    title: "Web search engine",
    summary: "Serve top-10 results over a 10B-page index in under 200 ms.",
    difficulty: 3,
    graph: givens(
      [client("searchers", "Searchers", "both", 1_000 * M)],
      [{ id: "crawled", kind: "object-storage", label: "Crawled pages (input from the crawler)" }],
    ),
    notesIntro:
      "Design the indexing and query side of a web search engine; crawling is a separate problem, and its output of 10B pages lands in object storage. " +
      "Assume 100k queries per second at peak, and that each day 500M pages are new or changed. " +
      "Return the top 10 ranked results with snippets in under 200 ms at p99, make new pages searchable within a day, and keep serving (with slightly worse results) when part of the index is unavailable.",
  },
  {
    id: "instagram",
    caseStudyId: "instagram",
    title: "Photo-sharing app",
    summary: "Post photos, follow people, scroll a feed: a media-heavy social app.",
    difficulty: 2,
    graph: givens([client("users", "Users", "mobile", 500 * M)]),
    notesIntro:
      "Design a photo-sharing app: users post photos with captions, follow other users, scroll a home feed of posts from accounts they follow, and like and comment. " +
      "Assume 500M daily users, 100M new photos a day averaging 2 MB at upload, 50 feed images viewed per user per day, and some accounts with 100M followers. " +
      "The feed should load in under 500 ms at p99 on mobile networks, and a photo must never be lost once its upload is acknowledged.",
  },
  {
    id: "food-delivery",
    caseStudyId: "food-delivery",
    title: "Food delivery",
    summary: "A three-sided marketplace: customers, restaurants and couriers, tracked live.",
    difficulty: 3,
    graph: givens(
      [client("customers", "Customers", "mobile", 30 * M), client("restaurants", "Restaurants (tablet app)", "both", 500_000), client("couriers", "Couriers", "mobile", 1 * M)],
      [external("maps", "Maps / routing & ETA provider", 150, 20_000), external("psp", "Payment service provider", 800, 2_000)],
    ),
    notesIntro:
      "Design a food delivery marketplace: customers browse nearby restaurants and order, restaurants accept and prepare the order, the system assigns a courier, and all three follow the order live until delivery. " +
      "Assume 5M orders a day with lunch and dinner peaks at 4× the average, couriers sending their location every 5 s, and ETAs from an external maps provider. " +
      "A courier should be assigned within 30 s of the restaurant accepting, a courier must not be double-booked, and every order is charged exactly once.",
  },
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export function templateById(id: string): StudioTemplate | undefined {
  return BY_ID.get(id);
}
