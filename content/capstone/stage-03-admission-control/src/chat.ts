import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Admission } from "./admission";
import { requireTenant } from "./auth";
import { config } from "./config";
import { recordUsage, type Tenant, type UsageEntry } from "./db";
import { header, HttpError, readJson, sendJson } from "./http";
import { log } from "./log";
import { estimatePromptTokens, parseChatRequest, SSE_DONE, sseData, type ChatChunk, type ChatRequest } from "./openai";
import { StreamTimer } from "./timing";
import { streamChat, UpstreamError } from "./upstream";

export const admission = new Admission("llm-1", config.slotsPerReplica, config.maxQueue, config.maxQueueWaitMs);

/** Headers are written with the first token, so time-to-first-byte equals TTFT and errors before it get a real status. */
function writeSseHeaders(res: ServerResponse, requestId: string): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    "x-request-id": requestId,
    "x-accel-buffering": "no", // tells nginx (stage 4) not to buffer this response
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
}

export async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = randomUUID();
  const timer = new StreamTimer();
  const tenant = await requireTenant(req);
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

  // Cancellation: if the client goes away (while queued or while generating), stop. On a GPU, generated tokens
  // nobody reads are the most expensive waste there is.
  const cancel = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) cancel.abort(new Error("client disconnected"));
  });

  let release: () => void;
  try {
    release = await admission.acquire(cancel.signal, deadlineMs);
  } catch (err) {
    if (err instanceof HttpError) log("shed", { requestId, tenant: tenant.id, reason: err.message, queued: admission.queued });
    throw err;
  }
  try {
    await generate({ requestId, tenant, chat, timer, res, cancel, deadlineMs, queueMs: timer.totalMs, promptEstimate });
  } finally {
    release();
  }
}

async function bill(ctx: Ctx, status: UsageEntry["status"], promptTokens: number, completionTokens: number): Promise<void> {
  try {
    await recordUsage({
      requestId: ctx.requestId,
      tenantId: ctx.tenant.id,
      model: ctx.chat.model,
      promptTokens,
      completionTokens,
      source: "interactive",
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
    for await (const chunk of streamChat(config.llmUrl, chat, signal)) {
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
          writeSseHeaders(res, requestId);
          headersSent = true;
        }
        res.write(sseData({ ...chunk, id: requestId, model: chat.model, usage: undefined, timings: undefined }));
      }
    }
  } catch (err) {
    clearTimeout(firstTokenTimer);
    const reason = (signal.reason as Error | undefined)?.message ?? (err as Error).message;
    if (cancel.signal.aborted) {
      log("completion_cancelled", { requestId, tenant: tenant.id, tokens: timer.tokens, ms: timer.totalMs, reason });
      await bill(ctx, "cancelled", ctx.promptEstimate, timer.tokens);
      return;
    }
    log("completion_failed", { requestId, tenant: tenant.id, tokens: timer.tokens, ttftMs: timer.ttftMs, reason });
    if (timer.tokens > 0) await bill(ctx, "error", ctx.promptEstimate, timer.tokens);
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
    if (!headersSent) writeSseHeaders(res, requestId);
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
      { "x-request-id": requestId },
    );
  }

  await bill(ctx, "ok", promptTokens, completionTokens);
  log("completion", {
    requestId,
    tenant: tenant.id,
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
