import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { handleChat } from "./chat";
import { config } from "./config";
import { HttpError, sendError, sendJson } from "./http";
import { log } from "./log";

// Routes
//   POST /v1/chat/completions   OpenAI-compatible; "stream": true answers with server-sent events
//   GET  /v1/models             the model this gateway serves
//   GET  /healthz               the process is up (liveness)
//   GET  /readyz                the model server answers its /health check (readiness)

async function ready(): Promise<boolean> {
  try {
    const r = await fetch(`${config.llmUrl}/health`, { signal: AbortSignal.timeout(1_000) });
    return r.ok;
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
  if (method === "GET" && path === "/healthz") return sendJson(res, 200, { status: "ok" });
  if (method === "GET" && path === "/readyz") {
    return (await ready()) ? sendJson(res, 200, { status: "ready" }) : sendJson(res, 503, { status: "model server not ready" });
  }
  throw new HttpError(404, `no route for ${method} ${path}`);
}

const server = http.createServer((req, res) => {
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

server.listen(config.port, () => log("listening", { port: config.port, llmUrl: config.llmUrl }));

// Graceful shutdown: stop accepting connections and let in-flight streams finish (up to 30s).
function shutdown(signal: string): void {
  log("shutdown", { signal });
  setTimeout(() => process.exit(1), 30_000).unref();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
