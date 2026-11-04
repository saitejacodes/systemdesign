#!/usr/bin/env node
// Optional local CORS proxy for OpenAI-compatible endpoints that refuse requests from a web page (Prompt 21).
//
//   AI_PROXY_TARGET=https://api.openai.com/v1 node scripts/ai-proxy/proxy.mjs
//
// Then set Settings → AI → Base URL to http://127.0.0.1:8787. It listens on 127.0.0.1 only, forwards each request to
// the target with the same path, method, body and Authorization header, streams the reply back, and adds CORS headers
// for the site's origin. It stores and logs nothing. Not needed for Anthropic, which allows browser requests.
import http from "node:http";
import { Readable } from "node:stream";

const TARGET = (process.env.AI_PROXY_TARGET ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const PORT = Number(process.env.AI_PROXY_PORT ?? 8787);
const ORIGINS = (process.env.AI_PROXY_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(",").map((s) => s.trim());
const FORWARD = ["authorization", "content-type", "accept"];

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-headers", "authorization, content-type, accept");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = Object.fromEntries(FORWARD.flatMap((h) => (req.headers[h] ? [[h, String(req.headers[h])]] : [])));
  try {
    const upstream = await fetch(TARGET + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
    else res.end();
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: `Proxy could not reach ${TARGET}: ${e.message}` } }));
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`AI proxy on http://127.0.0.1:${PORT} → ${TARGET} (origins: ${ORIGINS.join(", ")})`));
