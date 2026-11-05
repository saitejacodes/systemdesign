import { describe, expect, it, vi } from "vitest";
import { DexieAdapter, LabDb } from "@/lib/db/adapter";
import { exportData } from "@/lib/db/backup";
import { newSession } from "@/lib/interview/session";
import type { CaseStudyMeta, Rubric } from "@/lib/content/schemas";
import type { StudioGraph } from "@/lib/studio/types";
import type { TrafficProfile } from "@/lib/studio/sim";
import { chat, fromStatus, listModels, sseData, toAiError } from "./client";
import { estimateCost, formatCost } from "./pricing";
import { explainDesignPrompt, followUpPrompt, interviewerSystem, parseFeedback, scoringPrompt, tutorMessages, tutorSystem, LESSON_CHARS, TUTOR_HISTORY } from "./prompts";
import { serializeGraph, serializeRun, serializeSession, trim } from "./serialize";
import { AiError, PRESETS, baseUrlFor, describeError, type AiConfig } from "./types";
import { monthKey, recordUsage } from "./usage";

const graph: StudioGraph = {
  version: 1,
  nodes: [
    { id: "c", kind: "client", x: 0, y: 0, label: "Users", props: { users: 1_000_000, platform: "web" } },
    { id: "lb", kind: "load-balancer", x: 0, y: 0, label: "LB", props: { instances: 2, algorithm: "round-robin" } },
    { id: "api", kind: "service", x: 0, y: 0, label: "API", props: { instances: 3, capacityQps: 500, costPerMonth: 70 } },
    { id: "db", kind: "sql-db", x: 0, y: 0, label: "Postgres", props: { replicas: 0, capacityQps: 5_000 } },
    { id: "n", kind: "note", x: 0, y: 0, label: "", props: { text: "Writes go\nto the primary" } },
  ],
  edges: [
    { id: "e1", source: "c", target: "lb", kind: "sync", direction: "forward" },
    { id: "e2", source: "lb", target: "api", kind: "sync", direction: "forward" },
    { id: "e3", source: "api", target: "db", kind: "sync", direction: "forward", label: "SQL" },
  ],
};
const profile: TrafficProfile = { qps: 1_000, readWriteRatio: 10, peakMultiplier: 3, requestTypes: [{ id: "read", name: "Read", op: "read", weight: 1, target: { kinds: ["sql-db"] } }, { id: "write", name: "Write", op: "write", weight: 1, target: { kinds: ["sql-db"] } }] };

const meta = {
  id: "kv", title: "KV", summary: "s", difficulty: 1, weekRecommended: 14, relatedSectionIds: ["p1-estimation"],
  interviewerPrompt: "Design a session store.",
  clarifyingQuestions: [{ question: "How many reads per write?", answer: "About 10." }],
  deepDiveQuestions: ["What if a node dies?", "Hot keys?", "Expiry?"],
  trafficProfile: profile, runChallenge: { targets: {} }, commonMistakes: ["a"],
} as unknown as CaseStudyMeta;
const rubric = { criteria: [
  { id: "req", step: "Requirements", title: "Scope", levels: { 0: "none", 1: "some", 2: "all" } },
  { id: "hld", step: "High-Level Design", title: "Design", levels: { 0: "none", 1: "some", 2: "all" } },
] } as unknown as Rubric;

describe("graph serializer", () => {
  const text = serializeGraph(graph);
  it("lists components with kind and props, connections and notes", () => {
    expect(text).toContain("Components (4):");
    expect(text).toContain("- API (api) [Service]: instances=3, capacityQps=500");
    expect(text).toContain("- LB (lb) → API (api) [sync]");
    expect(text).toContain('- API (api) → Postgres (db) [sync] "SQL"');
    expect(text).toContain("Writes go / to the primary");
  });
  it("leaves out cost props (Run Mode reports cost) and says when there is nothing", () => {
    expect(text).not.toContain("costPerMonth");
    expect(serializeGraph({ version: 1, nodes: [], edges: [] })).toContain("Components (0):\n- none\nConnections (0):\n- none");
  });
  it("trims long free text with a visible marker", () => {
    expect(trim("x".repeat(50), 10)).toBe(`${"x".repeat(10)} … [trimmed]`);
    expect(trim("  short ", 10)).toBe("short");
  });
  it("Run Mode text names bottlenecks and single points of failure from the model", () => {
    const run = serializeRun(graph, profile);
    expect(run).toContain("### Average traffic");
    expect(run).toContain("### Peak (×3) traffic");
    expect(run).toMatch(/Single points of failure: .*Postgres/);
    expect(run).toMatch(/Bottlenecks \(utilization > 80%\): .*API \d+%/); // 3 × 500 = 1,500 capacity against 3,000 at peak
  });
});

describe("prompt builders", () => {
  it("tutor system prompt carries the page and caps lesson text", () => {
    const sys = tutorSystem({ url: "/phase/1/dns", title: "DNS", topics: ["Resolution", "TTL"], text: "y".repeat(LESSON_CHARS + 500) });
    expect(sys).toContain('<page url="/phase/1/dns">');
    expect(sys).toContain("Topics: Resolution; TTL");
    expect(sys).toContain("[trimmed]");
    expect(sys.length).toBeLessThan(LESSON_CHARS + 2_000);
  });
  it("tutor history keeps the latest turns and starts with the user", () => {
    const h = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: String(i) }));
    const m = tutorMessages(h);
    expect(m.length).toBeLessThanOrEqual(TUTOR_HISTORY);
    expect(m[0].role).toBe("user");
    expect(m[m.length - 1].content).toBe("29");
  });
  it("interviewer is grounded in the case's clarifying answers and told not to design", () => {
    const sys = interviewerSystem(meta);
    expect(sys).toContain("Design a session store.");
    expect(sys).toContain("Q: How many reads per write?\n  A: About 10.");
    expect(sys).toMatch(/Do not volunteer the design/);
  });
  it("follow-up prompt includes the design, the panels and the questions not to repeat", () => {
    const s = { ...newSession({ caseStudyId: "kv", designId: "d", mode: "practice", durationMin: 45, hintsOn: true }, 0), highLevel: "client → LB → API → Postgres" };
    const p = followUpPrompt(meta, s, graph, ["What if a node dies?"]);
    expect(p).toContain("<design>");
    expect(p).toContain("- API (api) [Service]");
    expect(p).toContain("client → LB → API → Postgres");
    expect(p).toContain("- What if a node dies?");
    expect(p).toMatch(/Ask ONE follow-up/);
  });
  it("scoring prompt lists every criterion with its levels and asks for JSON", () => {
    const s = newSession({ caseStudyId: "kv", designId: "d", mode: "mock", durationMin: 45, hintsOn: true }, 0);
    const p = scoringPrompt(meta, rubric, s, graph, profile);
    expect(p).toContain("- id: req · step: Requirements · Scope\n  0: none\n  1: some\n  2: all");
    expect(p).toContain("<run_mode>");
    expect(p).toContain("Include every criterion id exactly once: req, hld.");
  });
  it("explain prompt cites Run Mode for the design", () => {
    const p = explainDesignPrompt(graph, profile, "My shop");
    expect(p).toContain('Review the design "My shop".');
    expect(p).toContain("## Single points of failure");
    expect(p).toContain("<run_mode>");
  });
});

describe("parseFeedback", () => {
  it("reads fenced JSON and keeps only known, unique criteria", () => {
    const txt = 'Here you go:\n```json\n{"scores":[{"id":"req","score":2,"justification":"ok"},{"id":"req","score":0,"justification":"dup"},{"id":"zzz","score":1,"justification":"x"}],"improvements":["a","b","c","d"]}\n```';
    expect(parseFeedback(txt, rubric)).toEqual({ scores: [{ id: "req", score: 2, justification: "ok" }], improvements: ["a", "b", "c"] });
  });
  it("accepts bare JSON and rejects malformed or out-of-range replies", () => {
    expect(parseFeedback('{"scores":[{"id":"hld","score":1,"justification":"j"}],"improvements":["x"]}', rubric)?.scores[0].score).toBe(1);
    expect(parseFeedback("no json here", rubric)).toBeNull();
    expect(parseFeedback('{"scores":[{"id":"hld","score":3,"justification":"j"}],"improvements":["x"]}', rubric)).toBeNull();
  });
});

describe("client", () => {
  const cfg: AiConfig = { provider: "openai-compatible", apiKey: "k", model: "m", baseUrl: "http://localhost:8787/v1/" };
  const sse = (lines: string[]) => new Response(lines.map((l) => `data: ${l}\n\n`).join(""), { status: 200 });

  it("maps HTTP statuses to readable error kinds", () => {
    expect(fromStatus(401, "").kind).toBe("invalid-key");
    expect(fromStatus(429, "").kind).toBe("rate-limit");
    expect(fromStatus(529, "").kind).toBe("overloaded");
    expect(fromStatus(404, "").kind).toBe("not-found");
    expect(toAiError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(describeError(new AiError("network", ""), "openai-compatible")).toMatch(/scripts\/ai-proxy/);
    expect(describeError(new AiError("invalid-key", ""))).toMatch(/Settings/);
  });

  it("parses an SSE stream split across chunks", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode('data: {"a"')); c.enqueue(enc.encode(':1}\n\ndata: [DONE]\n')); c.close(); } });
    const out: string[] = [];
    for await (const d of sseData(body)) out.push(d);
    expect(out).toEqual(['{"a":1}', "[DONE]"]);
  });

  it("streams an OpenAI-compatible reply, reports usage and sends the key only to the configured endpoint", async () => {
    const f = vi.fn(async () => sse(['{"choices":[{"delta":{"content":"Hel"}}]}', '{"choices":[{"delta":{"content":"lo"}}]}', '{"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":2}}', "[DONE]"]));
    vi.stubGlobal("fetch", f);
    const deltas: string[] = [];
    const r = await chat(cfg, { system: "sys", messages: [{ role: "user", content: "hi" }] }, (d) => deltas.push(d));
    expect(r).toMatchObject({ text: "Hello", inputTokens: 12, outputTokens: 2, estimatedTokens: false });
    expect(deltas).toEqual(["Hel", "lo"]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8787/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string).messages[0]).toEqual({ role: "system", content: "sys" });
    vi.unstubAllGlobals();
  });

  it("routes Gemini, Groq, OpenRouter and OpenAI to their preset API root, ignoring any custom base URL", async () => {
    for (const provider of ["gemini", "groq", "openrouter", "openai"] as const) {
      const f = vi.fn(async () => sse(['{"choices":[{"delta":{"content":"ok"}}]}', "[DONE]"]));
      vi.stubGlobal("fetch", f);
      await chat({ provider, apiKey: "k", model: "m", baseUrl: "http://ignored.test" }, { system: "s", messages: [{ role: "user", content: "x" }] });
      expect((f.mock.calls[0] as unknown as [string])[0]).toBe(`${PRESETS[provider]!.baseUrl}/chat/completions`);
      vi.unstubAllGlobals();
    }
    expect(baseUrlFor({ provider: "openai-compatible", baseUrl: " http://x.test/v1/ " })).toBe("http://x.test/v1");
  });

  it("asks again without stream_options when an endpoint rejects it", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string);
      bodies.push(b);
      return b.stream_options ? new Response('{"error":{"message":"Unrecognized request argument: stream_options"}}', { status: 400 }) : sse(['{"choices":[{"delta":{"content":"ok"}}]}', "[DONE]"]);
    }));
    const r = await chat(cfg, { system: "s", messages: [{ role: "user", content: "x" }] });
    expect(r.text).toBe("ok");
    expect(bodies).toHaveLength(2);
    expect(bodies[1].stream_options).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("lists models from {base}/models, sorted, without Gemini's models/ prefix", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "models/b-model" }, { id: "a-model" }, { id: "b-model" }] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await listModels({ provider: "gemini", apiKey: "k" })).toEqual(["a-model", "b-model"]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PRESETS.gemini!.baseUrl}/models`);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"message":"Invalid API Key"}}', { status: 401 })));
    await expect(listModels({ provider: "groq", apiKey: "bad" })).rejects.toMatchObject({ kind: "invalid-key" });
    vi.unstubAllGlobals();
  });

  it("retries once after a rate limit, then succeeds", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n === 1 ? new Response('{"error":{"message":"slow down"}}', { status: 429 }) : sse(['{"choices":[{"delta":{"content":"ok"}}]}', "[DONE]"]))));
    const sleep = vi.fn(async () => {});
    const r = await chat(cfg, { system: "s", messages: [{ role: "user", content: "x" }] }, undefined, sleep);
    expect(r.text).toBe("ok");
    expect(r.estimatedTokens).toBe(true); // no usage chunk: estimated from characters
    expect(n).toBe(2);
    expect(sleep).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("does not retry an invalid key, and gives up after one retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(chat(cfg, { system: "s", messages: [] }, undefined, async () => {})).rejects.toMatchObject({ kind: "invalid-key" });
    const f = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", f);
    await expect(chat(cfg, { system: "s", messages: [] }, undefined, async () => {})).rejects.toMatchObject({ kind: "overloaded" });
    expect(f).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

describe("usage and cost", () => {
  it("estimates cost from list prices, unknown models count tokens only", () => {
    expect(estimateCost({ model: "claude-opus-5-5", inputTokens: 1_000_000, outputTokens: 100_000 })).toBeCloseTo(6); // $4 + $2
    expect(estimateCost({ model: "llama3.1", inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(formatCost(null)).toBe("cost unknown");
    expect(formatCost(0.0042)).toBe("$0.0042");
  });
  it("accumulates a monthly AiUsage row", async () => {
    const db = new DexieAdapter(new LabDb(`ai-${Math.random()}`));
    const now = new Date(2026, 10, 4);
    await recordUsage(db, { text: "", model: "claude-opus-5-5", inputTokens: 1_000, outputTokens: 500, estimatedTokens: false }, now);
    const row = await recordUsage(db, { text: "", model: "x", inputTokens: 10, outputTokens: 5, estimatedTokens: true }, now);
    expect(monthKey(now)).toBe("2026-11");
    expect(row).toMatchObject({ month: "2026-11", requests: 2, inputTokens: 1_010, outputTokens: 505 });
    expect(row.estimatedCost).toBeCloseTo((1_000 * 4 + 500 * 20) / 1e6);
  });
});

describe("exports", () => {
  it("never contain the API key, even with AI settings, tutor chats and usage present", async () => {
    const db = new DexieAdapter(new LabDb(`ai-x-${Math.random()}`));
    await db.put("settings", { key: "settings", theme: "paper", reducedMotion: false, newCardsPerDay: 20, apiKey: "sk-ant-SECRET-123", aiProvider: "anthropic", aiModel: "claude-opus-5-5", aiBaseUrl: "http://127.0.0.1:8787" });
    await db.put("tutorConversations", { id: "/phase/1/dns", pageId: "/phase/1/dns", messages: [{ role: "user", content: "hi" }], updatedAt: "" });
    await db.put("aiUsage", { month: "2026-11", requests: 1, inputTokens: 1, outputTokens: 1, estimatedCost: 0 });
    const text = JSON.stringify(await exportData(db));
    expect(text).not.toContain("sk-ant-SECRET-123");
    expect(text).not.toContain("apiKey");
    expect(text).toContain("claude-opus-5-5");
    expect(text).toContain("tutorConversations");
  });
});

describe("interview session with the AI interviewer", () => {
  it("starts with an empty AI record only when chosen, and older sessions still parse", () => {
    expect(newSession({ caseStudyId: "kv", designId: "d", mode: "mock", durationMin: 45, hintsOn: true, aiOn: true }, 0).ai).toEqual({ on: true, asks: [], followUps: [] });
    expect("ai" in newSession({ caseStudyId: "kv", designId: "d", mode: "mock", durationMin: 45, hintsOn: true }, 0)).toBe(false);
  });
  it("puts AI asks and follow-ups into the text the grader reads", () => {
    const s = { ...newSession({ caseStudyId: "kv", designId: "d", mode: "mock", durationMin: 45, hintsOn: true, aiOn: true }, 0) };
    s.ai = { on: true, asks: [{ q: "Regions?", a: "One region." }], followUps: [{ q: "What if Postgres dies?", a: "Promote a replica." }] };
    const t = serializeSession(s, meta.deepDiveQuestions);
    expect(t).toContain("Q: Regions?\nA: One region.");
    expect(t).toContain("Q: What if Postgres dies?\nA: Promote a replica.");
  });
});
