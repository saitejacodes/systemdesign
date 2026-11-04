import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { requireTenant } from "./auth";
import { exactCacheable, exactKey, getExact, getSemantic, putExact, putSemantic, semanticCacheable, type CachedAnswer } from "./cache";
import { config } from "./config";
import { recordUsage, type Tenant, type UsageEntry } from "./db";
import { checkInput, containsPii, HOLDBACK, outputViolation, redactPii } from "./guardrails";
import { header, HttpError, readJson, sendJson } from "./http";
import { log } from "./log";
import { cacheLookups, shed, streamOutcomes, tokens, tpot, ttft } from "./metrics";
import { estimatePromptTokens, parseChatRequest, SSE_DONE, sseData, type ChatChunk, type ChatRequest } from "./openai";
import { chargeEstimate, PRIORITY, settle, type Charge } from "./ratelimit";
import { candidates, recordTimings, routerPolicy, type Replica } from "./router";
import { StreamTimer } from "./timing";
import { streamChat, UpstreamError } from "./upstream";

const tracer = trace.getTracer("llm-gateway");

/** Thrown by generate() when a replica failed before producing any token: safe to try another replica. */
class FailedBeforeFirstToken extends Error {
  constructor(readonly cause: HttpError) {
    super(cause.message);
  }
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
}

/**
 * Single-flight for identical temperature-0 requests: while one is generating, identical requests wait for its
 * answer instead of each starting their own generation (a cache stampede when a popular entry expires).
 * Per gateway process; across gateways each still makes one.
 */
const flights = new Map<string, Promise<CachedAnswer | null>>();

const chunkOf = (id: string, model: string, delta: { role?: string; content?: string }, finish: string | null) => ({
  id,
  object: "chat.completion.chunk",
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [{ index: 0, delta, finish_reason: finish }],
});

function serveCached(res: ServerResponse, requestId: string, chat: ChatRequest, answer: CachedAnswer, kind: string): void {
  const headers: Record<string, string> = { "x-request-id": requestId, "x-cache": kind };
  if (answer.similarity !== undefined) headers["x-cache-similarity"] = String(answer.similarity);
  if (chat.stream) {
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no", ...headers });
    res.write(sseData(chunkOf(requestId, chat.model, { role: "assistant", content: answer.text }, null)));
    res.write(sseData(chunkOf(requestId, chat.model, {}, "stop")));
    res.end(SSE_DONE);
    return;
  }
  sendJson(
    res,
    200,
    {
      id: requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
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
  const tier = tenant.batch ? "batch" : tenant.tier;
  const source: UsageEntry["source"] = tenant.batch ? "batch" : "interactive";
  const chat = parseChatRequest(await readJson(req));

  // Input guardrail before anything is spent on the request.
  const verdict = checkInput(chat.messages, config.guardrailMode);
  if (verdict.action === "flag") log("guardrail_flag", { requestId, tenant: tenant.id, reason: verdict.reason });
  const hasPii = chat.messages.some((m) => containsPii(m.content));

  const deadlineMs = Math.min(config.requestTimeoutMs, Number(header(req, "x-request-timeout-ms")) || config.requestTimeoutMs);
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
      matchedPrompt: answer.matchedPrompt ? redactPii(answer.matchedPrompt).slice(0, 80) : undefined,
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

  try {
    let embedding: number[] | null = null;
    // Prompts containing personal data never enter the semantic cache: a near-duplicate from someone else must
    // not be able to pull them back out.
    if (!hasPii && semanticCacheable(chat, header(req, "x-semantic-cache") === "allow")) {
      const sem = await getSemantic(tenant.id, chat);
      cacheLookups.inc({ kind: "semantic", result: sem.answer ? "hit" : "miss" });
      if (sem.answer) return await hitFrom(sem.answer, "semantic-hit");
      embedding = sem.embedding;
    }

    // Rate limit by tokens: charge the most this request can cost now, settle the real cost when it ends.
    const charged = promptEstimate + chat.max_tokens;
    let charge: Charge = { limit: 0, remaining: null, counted: false };
    if (!tenant.batch) {
      try {
        charge = await chargeEstimate(tenant, charged);
      } catch (err) {
        if (err instanceof HttpError && err.status === 429) shed.inc({ reason: "rate_limited", tier });
        throw err;
      }
    }

    const cancel = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) cancel.abort(new Error("client disconnected"));
    });

    // Try up to two replicas. Moving on is safe in two cases only: the replica refused to queue us (admission
    // shed), or it failed before producing a single token. After the first token has been streamed to the
    // client, a retry would resend text the client already has, the continuation would be a different sample,
    // and the prefill + decode so far would be paid twice. So mid-stream failures end with an error event.
    const allowFallback = header(req, "x-allow-fallback") !== "false";
    const options = candidates(chat.messages, { allowFallback, allowCanary: !tenant.batch });
    let lastErr: unknown = new HttpError(503, "no healthy model replica", "overloaded_error", { "retry-after": "5" });
    let attempts = 0;
    const tried = new Set<Replica>();
    try {
      for (const replica of options) {
        if (attempts >= 2) break;
        tried.add(replica);
        const routeSpan = tracer.startSpan("router.route_and_admit", {
          attributes: { "router.policy": routerPolicy, "llm.replica": replica.name, "tenant.tier": tier },
        });
        let release: () => void;
        try {
          release = await replica.admission.acquire(cancel.signal, deadlineMs - timer.totalMs, priority);
          routeSpan.end();
        } catch (err) {
          replica.breaker.release();
          routeSpan.setStatus({ code: SpanStatusCode.ERROR, message: "shed" });
          routeSpan.end();
          lastErr = err;
          if (!(err instanceof HttpError)) throw err; // cancelled while queued
          log("shed", { requestId, tenant: tenant.id, replica: replica.name, reason: err.message });
          continue;
        }
        attempts++;
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
        };
        try {
          await tracer.startActiveSpan(
            "llm.generate",
            { attributes: { "llm.replica": replica.name, "llm.model_version": replica.version, "llm.max_tokens": chat.max_tokens } },
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
        } catch (err) {
          if (err instanceof FailedBeforeFirstToken) {
            lastErr = err.cause;
            log("retry_other_replica", { requestId, failed: replica.name, reason: err.message });
            continue;
          }
          throw err;
        } finally {
          release();
        }
        // Only answers from the primary model version are cached: canary and fallback answers are not the
        // version the cache key promises.
        if (ctx.answer && replica.version === config.modelVersion) {
          finishFlight?.(ctx.answer);
          if (exactCacheable(chat)) await putExact(tenant.id, chat, ctx.answer);
          if (embedding) await putSemantic(tenant.id, chat, embedding, ctx.answer);
        }
        return;
      }
    } finally {
      // candidates() reserved the half-open probe of every breaker it offered; hand back the ones never tried.
      for (const r of options) if (!tried.has(r)) r.breaker.release();
    }
    settle(tenant, charge, charged, 0); // nothing ran: give the tokens back
    if (lastErr instanceof HttpError && lastErr.status === 503) shed.inc({ reason: "overloaded", tier });
    throw lastErr;
  } finally {
    finishFlight?.(null); // no-op if it was already resolved with the answer
  }
}

async function bill(ctx: Ctx, status: UsageEntry["status"], promptTokens: number, completionTokens: number): Promise<void> {
  settle(ctx.tenant, ctx.charge, ctx.charged, promptTokens + completionTokens);
  try {
    await recordUsage({
      requestId: ctx.requestId,
      tenantId: ctx.tenant.id,
      model: ctx.replica.model,
      promptTokens,
      completionTokens,
      source: ctx.source,
      status,
    });
  } catch (err) {
    // A lost ledger row is lost revenue. Production systems publish usage events to a durable queue first.
    log("usage_write_failed", { requestId: ctx.requestId, tenant: ctx.tenant.id, error: (err as Error).message });
  }
}

async function generate(ctx: Ctx): Promise<void> {
  const { requestId, tenant, chat, timer, res, cancel, replica } = ctx;
  const firstToken = new AbortController();
  const firstTokenTimer = setTimeout(() => firstToken.abort(new Error("no first token in time")), config.firstTokenTimeoutMs);
  const guard = new AbortController(); // the output guardrail stops generation through this
  const signal = AbortSignal.any([cancel.signal, firstToken.signal, guard.signal, AbortSignal.timeout(Math.max(1, ctx.deadlineMs - ctx.queueMs))]);
  const model = replica.model; // honest: a fallback answer says which model wrote it

  let text = ""; // everything the model produced
  let sent = 0; // how much of `text` has gone to the client
  let finishReason: string | null = null;
  let usage: ChatChunk["usage"];
  let timings: ChatChunk["timings"];
  let headersSent = false;
  let blocked: string | null = null;

  const startStream = () => {
    if (headersSent) return;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "x-request-id": requestId,
      "x-replica": replica.name,
      "x-model-served": model,
      "x-accel-buffering": "no",
    });
    headersSent = true;
  };
  /** Send text up to `upTo`, keeping the guardrail's holdback unsent until the stream ends. */
  const flush = (upTo: number) => {
    if (!chat.stream || upTo <= sent) return;
    startStream();
    res.write(sseData(chunkOf(requestId, model, { content: text.slice(sent, upTo) }, null)));
    sent = upTo;
  };

  try {
    for await (const chunk of streamChat(replica.url, chat, signal)) {
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      finishReason = chunk.choices?.[0]?.finish_reason ?? finishReason;
      if (chunk.usage) usage = chunk.usage;
      if (chunk.timings) timings = chunk.timings;
      if (!delta) continue;
      if (timer.tokens === 0) clearTimeout(firstTokenTimer);
      timer.token();
      text += delta;
      blocked = outputViolation(text);
      if (blocked) {
        guard.abort(new Error(blocked)); // stop paying for tokens we will not send
        break;
      }
      flush(text.length - HOLDBACK);
    }
  } catch (err) {
    clearTimeout(firstTokenTimer);
    const reason = (signal.reason as Error | undefined)?.message ?? (err as Error).message;
    if (cancel.signal.aborted) {
      replica.breaker.release(); // the client left; says nothing about the replica
      streamOutcomes.inc({ outcome: "cancelled" });
      log("completion_cancelled", { requestId, tenant: tenant.id, replica: replica.name, tokens: timer.tokens, ms: timer.totalMs, reason });
      await bill(ctx, "cancelled", ctx.promptEstimate, timer.tokens);
      return;
    }
    if (!guard.signal.aborted) {
      replica.breaker.failure();
      streamOutcomes.inc({ outcome: "error" });
      log("completion_failed", { requestId, tenant: tenant.id, replica: replica.name, tokens: timer.tokens, ttftMs: timer.ttftMs, reason });
      if (timer.tokens > 0) await bill(ctx, "error", ctx.promptEstimate, timer.tokens);
      if (!headersSent) {
        const cause =
          err instanceof UpstreamError
            ? new HttpError(err.status, err.message, "upstream_error")
            : new HttpError(504, `model did not answer in time: ${reason}`, "timeout_error");
        if (timer.tokens === 0) throw new FailedBeforeFirstToken(cause);
        throw cause;
      }
      // Tokens already reached the client with a 200 status: say so in-band and close the stream.
      res.end(sseData({ error: { message: `stream interrupted after ${timer.tokens} tokens: ${reason}`, type: "upstream_error" } }));
      return;
    }
  }
  clearTimeout(firstTokenTimer);

  // Gray failure detection: a slow first token counts against the replica's breaker even though it succeeded.
  if (timer.ttftMs !== null && timer.ttftMs - ctx.queueMs > config.breakerSlowTtftMs) replica.breaker.failure();
  else replica.breaker.success();

  if (blocked) {
    finishReason = "content_filter";
    text = text.slice(0, sent); // the client only ever saw text before the violation
    log("guardrail_output_block", { requestId, tenant: tenant.id, reason: blocked });
  } else {
    flush(text.length); // release the holdback
  }

  const promptTokens = usage?.prompt_tokens ?? ctx.promptEstimate;
  const completionTokens = usage?.completion_tokens ?? timer.tokens;
  const usageOut = { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens };

  if (chat.stream) {
    startStream();
    res.write(sseData(chunkOf(requestId, model, {}, finishReason ?? "stop")));
    res.write(
      sseData({ id: requestId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [], usage: usageOut }),
    );
    res.end(SSE_DONE);
  } else {
    sendJson(
      res,
      200,
      {
        id: requestId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: finishReason ?? "stop" }],
        usage: usageOut,
      },
      { "x-request-id": requestId, "x-replica": replica.name, "x-model-served": model },
    );
  }

  recordTimings(replica, timings);
  streamOutcomes.inc({ outcome: "ok" });
  const tier = tenant.batch ? "batch" : tenant.tier;
  if (timer.ttftMs !== null) ttft.observe({ replica: replica.name, tier }, timer.ttftMs / 1000);
  if (timer.tpotMs !== null) tpot.observe({ replica: replica.name }, timer.tpotMs / 1000);
  tokens.inc({ type: "prompt", tier }, timings?.prompt_n ?? promptTokens);
  if (timings?.cache_n) tokens.inc({ type: "cached_prompt", tier }, timings.cache_n);
  tokens.inc({ type: "completion", tier }, completionTokens);
  if (finishReason === "stop") ctx.answer = { text, completionTokens }; // never cache a truncated or filtered answer
  await bill(ctx, "ok", promptTokens, completionTokens);
  log("completion", {
    requestId,
    tenant: tenant.id,
    replica: replica.name,
    modelVersion: replica.version,
    stream: chat.stream,
    promptTokens,
    completionTokens,
    queueMs: ctx.queueMs,
    ttftMs: timer.ttftMs,
    tpotMs: timer.tpotMs,
    totalMs: timer.totalMs,
    finishReason,
    prefillTokens: timings?.prompt_n,
    cachedTokens: timings?.cache_n,
  });
}
