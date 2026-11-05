/// <reference lib="webworker" />
// Service worker source. Bundled by esbuild through the /serwist/[path] route (see app/serwist/[path]/route.ts),
// never by Turbopack. Strategy table and reasons: DECISIONS.md, Prompt 23.
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, NetworkFirst, type PrecacheEntry, Serwist, type SerwistGlobalConfig, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;

/** Cross-origin hosts whose files are versioned in the URL (Pyodide, the TypeScript compiler for JS labs). */
const CDN_HOSTS = new Set(["cdn.jsdelivr.net", "unpkg.com"]);

/**
 * Requests the worker must never answer from a cache: AI providers (keys and streamed answers),
 * local AI proxies, and anything that is not a GET. Unmatched requests go straight to the network,
 * so this is a guard on top of the matchers below, not a route of its own.
 */
const NEVER = [/(^|\.)anthropic\.com$/, /^generativelanguage\.googleapis\.com$/, /(^|\.)groq\.com$/, /(^|\.)openrouter\.ai$/, /(^|\.)openai\.com$/];
const neverCache = (url: URL, request: Request) =>
  request.method !== "GET" || NEVER.some((r) => r.test(url.hostname)) || (url.hostname === "localhost" || url.hostname === "127.0.0.1" ? url.origin !== self.location.origin : false);

const isPage = (request: Request) => request.mode === "navigate" || (request.headers.get("accept") ?? "").includes("text/html");

const serwist = new Serwist({
  // Small app shell only: CSS, self-hosted fonts, icons and /offline. JS chunks (26 MB with Monaco, Mermaid
  // and PGlite) are cached on first use instead, so installing the worker stays light.
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      // Hashed build output, including PGlite's WASM and data: immutable, so cache-first.
      matcher: ({ url, request, sameOrigin }) => sameOrigin && !neverCache(url, request) && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "sdl-static",
        plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * DAY, purgeOnQuotaError: true })],
      }),
    },
    {
      // Pyodide and other pinned CDN files, fetched by the code-lab workers on first run.
      matcher: ({ url, request }) => CDN_HOSTS.has(url.hostname) && !neverCache(url, request),
      handler: new CacheFirst({
        cacheName: "sdl-cdn",
        plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true })],
      }),
    },
    {
      // Client-side navigations fetch RSC payloads; keep the last few so visited pages also work via links.
      matcher: ({ url, request, sameOrigin }) => sameOrigin && !neverCache(url, request) && request.headers.get("RSC") === "1",
      handler: new NetworkFirst({
        cacheName: "sdl-rsc",
        networkTimeoutSeconds: 4,
        plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true })],
      }),
    },
    {
      // Full page loads: network first, the cached copy when offline, /offline when never visited.
      matcher: ({ url, request, sameOrigin }) => sameOrigin && !neverCache(url, request) && isPage(request),
      handler: new NetworkFirst({
        cacheName: "sdl-pages",
        networkTimeoutSeconds: 4,
        plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true })],
      }),
    },
    {
      // Unhashed same-origin files: lab workers in /labs, icons, the manifest, the search index.
      matcher: ({ url, request, sameOrigin }) => sameOrigin && !neverCache(url, request) && !url.pathname.startsWith("/serwist/"),
      handler: new StaleWhileRevalidate({
        cacheName: "sdl-assets",
        plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true })],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
