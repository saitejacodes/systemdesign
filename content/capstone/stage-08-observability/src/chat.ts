import { randomUUID } from "node:crypto";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { requireTenant } from "./auth";
import { exactCacheable, exactKey, getExact, getSemantic, putExact, putSemantic, semanticCacheable, type CachedAnswer } from "./cache";
import { config } from "./config";
import { recordUsage, type Tenant, type UsageEntry } from "./db";
import { header, HttpError, readJson, sendJson } from "./http";
import { log } from "./log";
import { cacheLookups, shed, streamOutcomes, tokens, tpot, ttft } from "./metrics";
import { estimatePromptTokens, parseChatRequest, SSE_DONE, sseData, type ChatChunk, type ChatRequest } from "./openai";
import { candidates, recordTimings, routerPolicy, type Replica } from "./router";
import { chargeEstimate, PRIORITY, settle, type Charge } from "./ratelimit";
import { StreamTimer } from "./timing";
import { streamChat, UpstreamError } from "./upstream";

const tracer = trace.getTracer("llm-gateway");

/** Headers are written with the first token, so time-to-first-byte equals TTFT and errors before it get a real status. */
function writeSseHeaders(res: ServerResponse, requestId: string, replica: string): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    "x-request-id": requestId,
    "x-replica": replica,
    "x-accel-buffering": "no", // tells nginx not to buffer this response
  });
}

interface Ctx {
  requestId: string;
  tenant: Tenant;
  chat: ChatRequest;
  timer: StreamTimer;
  res: ServerResponse;
  cancel: AbortController;
  deadlineMs: number;
  queueMs: number;
  promptEstimate: number;
  replica: Replica;
  charge: Charge;
  charged: number;
  source: UsageEntry["source"];
  /** Set by generate() when the model finished normally; written to the caches and handed to coalesced waiters. */
  answer?: CachedAnswer;
  embedding: number[] | null;
}

/**
 * Single-flight for identical temperature-0 requests: while one is generating, identical requests wait for its
 * answer instead of each starting their own generation. Without it, a popular prompt whose cache entry just
 * expired sends N identical generations to the replicas at once (a cache stampede), each costing full prefill
 * and decode. Per gateway process; across gateways each still makes one.
 */
const flights = new Map<string, Promise<CachedAnswer | null>>();

function serveCached(res: ServerResponse, requestId: string, chat: ChatRequest, answer: CachedAnswer, kind: string): void {
  const created = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = { "x-request-id": requestId, "x-cache": kind };
  if (answer.similarity !== undefined) headers["x-cache-similarity"] = String(answer.similarity);
  if (chat.stream) {
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no", ...headers });
    res.write(
      sseData({
        id: requestId,
        object: "chat.completion.chunk",
        created,
        model: chat.model,
        choices: [{ index: 0, delta: { role: "assistant", content: answer.text }, finish_reason: null }],
      }),
    );
    res.write(
      sseData({
        id: requestId,
        object: "chat.completion.chunk",
        created,
        model: chat.model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      }),
    );
    res.end(SSE_DONE);
    return;
  }
  sendJson(
    res,
    200,
    {
      id: requestId,
      object: "chat.completion",
      created,
      model: chat.model,
      choices: [{ index: 0, message: { role: "assistant", content: answer.text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: answer.completionTokens, total_tokens: answer.completionTokens },
    },
    headers,
  );
}

export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const timer = new StreamTimer();
  const tenant = await requireTenant(req);
  // Batch jobs bring a deterministic id (batch:<batchId>:<customId>) so a redelivered job reuses its ledger row.
  const requestId = tenant.batch ? (header(req, "x-request-id") ?? randomUUID()) : randomUUID();
  const priority = tenant.batch ? PRIORITY.batch : PRIORITY[tenant.tier];
  const source: UsageEntry["source"] = tenant.batch ? "batch" : "interactive";
  const chat = parseChatRequest(await readJson(req));

  // Deadline: the client may say how long it is willing to wait in total (x-request-timeout-ms).
  const deadlineMs = Math.min(config.requestTimeoutMs, Number(header(req, "x-request-timeout-ms")) || config.requestTimeoutMs);

  // Do not admit what cannot fit: prompt + max_tokens must fit in one slot's share of the KV cache.
  const promptEstimate = estimatePromptTokens(chat.messages);
  if (promptEstimate + chat.max_tokens > config.contextPerSlot) {
    throw new HttpError(
      400,
      `prompt (~${promptEstimate} tokens) + max_tokens (${chat.max_tokens}) exceeds the ${config.contextPerSlot}-token context`,
      "context_length_exceeded",
    );
  }

  // Caches first: a hit costs no model time, so it is not charged against the token rate limit either.
  const hitFrom = async (answer: CachedAnswer, kind: string) => {
    serveCached(res, requestId, chat, answer, kind);
    log("cache_hit", {
      requestId,
      tenant: tenant.id,
      kind,
      similarity: answer.similarity,
      matchedPrompt: answer.matchedPrompt?.slice(0, 80),
      ms: timer.totalMs,
    });
    await recordUsage({
      requestId,
      tenantId: tenant.id,
      model: chat.model,
      promptTokens: promptEstimate,
      completionTokens: answer.completionTokens,
      source: "cache",
      status: "ok",
    }).catch(() => {});
  };
  let finishFlight: ((a: CachedAnswer | null) => void) | undefined;
  if (exactCacheable(chat)) {
    const key = exactKey(tenant.id, chat);
    const hit = await getExact(tenant.id, chat);
    cacheLookups.inc({ kind: "exact", result: hit ? "hit" : "miss" });
    if (hit) return hitFrom(hit, "exact-hit");
    const inFlight = flights.get(key);
    if (inFlight) {
      const shared = await inFlight;
      if (shared) {
        cacheLookups.inc({ kind: "exact", result: "coalesced" });
        return hitFrom(shared, "coalesced");
      }
    } else {
      flights.set(
        key,
        new Promise(
          (resolve) =>
            (finishFlight = (a) => {
              flights.delete(key);
              resolve(a);
            }),
        ),
      );
    }
  }
  let embedding: number[] | null = null;
  try {
    if (semanticCacheable(chat, header(req, "x-semantic-cache") === "allow")) {
      const sem = await getSemantic(tenant.id, chat);
      cacheLookups.inc({ kind: "semantic", result: sem.answer ? "hit" : "miss" });
      if (sem.answer) return await hitFrom(sem.answer, "semantic-hit");
      embedding = sem.embedding;
    }
    return await runModel();
  } finally {
    finishFlight?.(null); // no-op if runModel already resolved it with the answer
  }

  async function runModel(): Promise<void> {
    // Rate limit by tokens: charge the most this request can cost now, settle the real cost when it ends.
    // Batch work is not charged against the interactive budget; its lowest priority is what keeps it in check.
    const charged = promptEstimate + chat.max_tokens;
    let charge: Charge = { limit: 0, remaining: null, counted: false };
    if (!tenant.batch) {
      try {
        charge = await chargeEstimate(tenant, charged);
      } catch (err) {
        if (err instanceof HttpError && err.status === 429) shed.inc({ reason: "rate_limited", tier: tenant.tier });
        throw err;
      }
    }

    // Cancellation: if the client goes away (while queued or while generating), stop. On a GPU, generated tokens
    // nobody reads are the most expensive waste there is.
    const cancel = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) cancel.abort(new Error("client disconnected"));
    });

    // Route, then admit. If the chosen replica sheds, spill over to the next candidate once before giving up.
    // The span makes routing and queue wait visible in Jaeger as their own step between gateway and replica.
    const routeSpan = tracer.startSpan("router.route_and_admit", { attributes: { "router.policy": routerPolicy, "tenant.tier": tenant.tier } });
    let replica: Replica | undefined;
    let release: (() => void) | undefined;
    let lastErr: unknown;
    for (const r of candidates(chat.messages).slice(0, 2)) {
      try {
        release = await r.admission.acquire(cancel.signal, deadlineMs, priority);
        replica = r;
        break;
      } catch (err) {
        lastErr = err;
        if (!(err instanceof HttpError)) throw err; // cancelled while queued
        log("shed", { requestId, tenant: tenant.id, replica: r.name, reason: err.message });
      }
    }
    if (!replica || !release) {
      settle(tenant, charge, charged, 0); // refused before running: give the tokens back
      routeSpan.setStatus({ code: SpanStatusCode.ERROR, message: "shed" });
      routeSpan.end();
      if (lastErr instanceof HttpError) shed.inc({ reason: "overloaded", tier: tenant.tier });
      throw lastErr;
    }
    routeSpan.setAttributes({ "llm.replica": replica.name, "queue.wait_ms": timer.totalMs });
    routeSpan.end();
    const ctx: Ctx = {
      requestId,
      tenant,
      chat,
      timer,
      res,
      cancel,
      deadlineMs,
      queueMs: timer.totalMs,
      promptEstimate,
      replica,
      charge,
      charged,
      source,
      embedding,
    };
    try {
      // The replica call (an undici fetch span) becomes a child of this span.
      await tracer.startActiveSpan(
        "llm.generate",
        { attributes: { "llm.replica": replica.name, "llm.max_tokens": chat.max_tokens } },
        async (span) => {
          try {
            await generate(ctx);
            span.setAttributes({ "llm.completion_tokens": timer.tokens, "llm.ttft_ms": timer.ttftMs ?? -1, "llm.tpot_ms": timer.tpotMs ?? -1 });
          } catch (err) {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw err;
          } finally {
            span.end();
          }
        },
      );
    } finally {
      release();
    }
    if (ctx.answer) {
      finishFlight?.(ctx.answer);
      if (exactCacheable(chat)) await putExact(tenant.id, chat, ctx.answer);
      if (embedding) await putSemantic(tenant.id, chat, embedding, ctx.answer);
    }
  }
}

async function bill(ctx: Ctx, status: UsageEntry["status"], promptTokens: number, completionTokens: number): Promise<void> {
  settle(ctx.tenant, ctx.charge, ctx.charged, promptTokens + completionTokens);
  try {
    await recordUsage({
      requestId: ctx.requestId,
      tenantId: ctx.tenant.id,
      model: ctx.chat.model,
      promptTokens,
      completionTokens,
      source: ctx.source,
      status,
    });
  } catch (err) {
    // A lost ledger row is lost revenue. Stage 7 shows the durable alternative (write to a queue, retry).
    log("usage_write_failed", { requestId: ctx.requestId, tenant: ctx.tenant.id, error: (err as Error).message });
  }
}

async function generate(ctx: Ctx): Promise<void> {
  const { requestId, tenant, chat, timer, res, cancel } = ctx;
  const firstToken = new AbortController();
  const firstTokenTimer = setTimeout(() => firstToken.abort(new Error("no first token in time")), config.firstTokenTimeoutMs);
  const signal = AbortSignal.any([cancel.signal, firstToken.signal, AbortSignal.timeout(Math.max(1, ctx.deadlineMs - ctx.queueMs))]);

  let text = "";
  let finishReason: string | null = null;
  let usage: ChatChunk["usage"];
  let timings: ChatChunk["timings"];
  let headersSent = false;

  try {
    for await (const chunk of streamChat(ctx.replica.url, chat, signal)) {
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
      if (chunk.usage) usage = chunk.usage;
      if (chunk.timings) timings = chunk.timings;
      if (delta) {
        if (timer.tokens === 0) clearTimeout(firstTokenTimer);
        timer.token();
        text += delta;
      }
      if (chat.stream && (delta || chunk.choices?.[0]?.finish_reason)) {
        if (!headersSent) {
          writeSseHeaders(res, requestId, ctx.replica.name);
          headersSent = true;
        }
        res.write(sseData({ ...chunk, id: requestId, model: chat.model, usage: undefined, timings: undefined }));
      }
    }
  } catch (err) {
    clearTimeout(firstTokenTimer);
    const reason = (signal.reason as Error | undefined)?.message ?? (err as Error).message;
    if (cancel.signal.aborted) {
      streamOutcomes.inc({ outcome: "cancelled" });
      log("completion_cancelled", { requestId, tenant: tenant.id, tokens: timer.tokens, ms: timer.totalMs, reason });
      await bill(ctx, "cancelled", ctx.promptEstimate, timer.tokens);
      return;
    }
    streamOutcomes.inc({ outcome: "error" });
    log("completion_failed", { requestId, tenant: tenant.id, tokens: timer.tokens, ttftMs: timer.ttftMs, reason });
    if (timer.tokens > 0) await bill(ctx, "error", ctx.promptEstimate, timer.tokens);
    else settle(tenant, ctx.charge, ctx.charged, 0); // nothing ran: refund the estimate
    if (!headersSent) {
      if (err instanceof UpstreamError) throw new HttpError(err.status, err.message, "upstream_error");
      throw new HttpError(504, `model did not answer in time: ${reason}`, "timeout_error");
    }
    // Tokens already went out with a 200 status. All we can do is say so in-band and close the stream.
    res.end(sseData({ error: { message: `stream interrupted: ${reason}`, type: "upstream_error" } }));
    return;
  }
  clearTimeout(firstTokenTimer);

  const promptTokens = usage?.prompt_tokens ?? ctx.promptEstimate;
  const completionTokens = usage?.completion_tokens ?? timer.tokens;
  const usageOut = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens };
  const created = Math.floor(Date.now() / 1000);

  if (chat.stream) {
    if (!headersSent) writeSseHeaders(res, requestId, ctx.replica.name);
    // Like OpenAI's stream_options.include_usage: a final chunk with no choices that carries the token counts.
    res.write(sseData({ id: requestId, object: "chat.completion.chunk", created, model: chat.model, choices: [], usage: usageOut }));
    res.end(SSE_DONE);
  } else {
    sendJson(
      res,
      200,
      {
        id: requestId,
        object: "chat.completion",
        created,
        model: chat.model,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: finishReason ?? "stop" }],
        usage: usageOut,
      },
      { "x-request-id": requestId, "x-replica": ctx.replica.name },
    );
  }

  recordTimings(ctx.replica, timings);
  streamOutcomes.inc({ outcome: "ok" });
  if (timer.ttftMs !== null) ttft.observe({ replica: ctx.replica.name, tier: tenant.batch ? "batch" : tenant.tier }, timer.ttftMs / 1000);
  if (timer.tpotMs !== null) tpot.observe({ replica: ctx.replica.name }, timer.tpotMs / 1000);
  const tier = tenant.batch ? "batch" : tenant.tier;
  tokens.inc({ type: "prompt", tier }, timings?.prompt_n ?? promptTokens);
  if (timings?.cache_n) tokens.inc({ type: "cached_prompt", tier }, timings.cache_n);
  tokens.inc({ type: "completion", tier }, completionTokens);
  if (finishReason === "stop") ctx.answer = { text, completionTokens }; // never cache a truncated answer
  await bill(ctx, "ok", promptTokens, completionTokens);
  log("completion", {
    requestId,
    tenant: tenant.id,
    replica: ctx.replica.name,
    stream: chat.stream,
    promptTokens,
    completionTokens,
    queueMs: ctx.queueMs,
    ttftMs: timer.ttftMs,
    tpotMs: timer.tpotMs,
    totalMs: timer.totalMs,
    finishReason,
    // From llama.cpp's last chunk when present: prompt_n tokens were prefilled; cache_n were reused from the KV cache.
    prefillTokens: timings?.prompt_n,
    cachedTokens: timings?.cache_n,
  });
}
