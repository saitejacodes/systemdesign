import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { requireTenant } from "./auth";
import { handleChat } from "./chat";
import { config } from "./config";
import { listUsage, pool } from "./db";
import { HttpError, sendError, sendJson } from "./http";
import { log } from "./log";
import { redis } from "./ratelimit";
import { replicas, routerStats } from "./router";

// Routes
//   POST /v1/chat/completions   OpenAI-compatible; "stream": true answers with server-sent events
//   GET  /v1/models             the model this gateway serves
//   GET  /v1/usage              your ledger rows, newest first: ?limit=1..100&cursor=<nextCursor>
//   GET  /admin/replicas        per replica: requests routed, in flight, queued, prefix-cache hit ratio
//   GET  /healthz               the process is up (liveness)
//   GET  /readyz                Postgres and at least one model replica answer (readiness)

async function ready(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    const checks = await Promise.all(
      replicas.map((r) =>
        fetch(`${r.url}/health`, { signal: AbortSignal.timeout(1_000) }).then(
          (x) => x.ok,
          () => false,
        ),
      ),
    );
    return checks.some(Boolean);
  } catch {
    return false;
  }
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = new URL(req.url ?? "/", "http://internal").pathname;
  const method = req.method ?? "GET";

  if (method === "POST" && path === "/v1/chat/completions") return handleChat(req, res);
  if (method === "GET" && path === "/v1/models") {
    return sendJson(res, 200, { object: "list", data: [{ id: config.modelName, object: "model", owned_by: "local" }] });
  }
  if (method === "GET" && path === "/v1/usage") {
    const tenant = await requireTenant(req);
    const q = new URL(req.url ?? "/", "http://internal").searchParams;
    const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 20) || 20));
    try {
      return sendJson(res, 200, { object: "list", ...(await listUsage(tenant.id, limit, q.get("cursor"))) });
    } catch (err) {
      if ((err as Error).message === "bad cursor") throw new HttpError(400, "invalid cursor");
      throw err;
    }
  }
  if (method === "GET" && path === "/admin/replicas") return sendJson(res, 200, { gateway: config.instanceId, ...routerStats() });
  if (method === "GET" && path === "/healthz") return sendJson(res, 200, { status: "ok" });
  if (method === "GET" && path === "/readyz") {
    return (await ready()) ? sendJson(res, 200, { status: "ready" }) : sendJson(res, 503, { status: "model server not ready" });
  }
  throw new HttpError(404, `no route for ${method} ${path}`);
}

const server = http.createServer((req, res) => {
  res.setHeader("x-served-by", config.instanceId);
  route(req, res).catch((err: unknown) => {
    if (err instanceof HttpError) {
      if (!res.headersSent) return sendError(res, err);
      return res.end();
    }
    log("unhandled_error", { method: req.method, url: req.url, error: String(err) });
    if (!res.headersSent) sendError(res, new HttpError(500, "internal error", "server_error"));
    else res.end();
  });
});

// Generations can run for a minute; Node's default 5-minute requestTimeout is fine, but disable the idle socket
// timeout so a slow model does not get its connection cut mid-stream.
server.timeout = 0;
// nginx keeps idle upstream connections for up to 60 s (keepalive_timeout). Node must keep them longer than the
// proxy does, or nginx can send a request down a socket Node is closing and return a 502.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(config.port, () =>
  log("listening", { port: config.port, instance: config.instanceId, replicas: config.llmReplicas, policy: config.routerPolicy }),
);

// Graceful shutdown: stop accepting connections and let in-flight streams finish (up to 30s).
function shutdown(signal: string): void {
  log("shutdown", { signal });
  setTimeout(() => process.exit(1), 30_000).unref();
  server.close(() => {
    redis.disconnect();
    pool.end().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
