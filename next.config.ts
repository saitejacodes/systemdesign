import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { LAB_WORKER_CSP, PAGE_CSP, SECURITY_HEADERS } from "./lib/security/csp";

// cacheComponents is off: all content is static files read at build time (see DECISIONS.md).
// withSerwist only marks esbuild as a server-external package; the service worker is built by app/serwist/[path]/route.ts.
// No COOP/COEP: nothing uses SharedArrayBuffer (PGlite and Pyodide run single-threaded here; DECISIONS.md, Prompt 24).
const nextConfig: NextConfig = withSerwist({
  poweredByHeader: false,
  // lib/content reads folders by computed path, so the tracer guesses at which files server functions need.
  // Ship all of content/ explicitly (on-demand pages read lesson and solution MDX), and keep design exports,
  // prompts and test specs out of the deployment.
  outputFileTracingIncludes: { "/*": ["content/**/*"] },
  outputFileTracingExcludes: { "/*": ["design/**", "prompts/**", "tests/e2e/**", ".github/**", "tsconfig.tsbuildinfo"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/((?!labs/).*)", headers: [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: PAGE_CSP }] },
      { source: "/labs/:path*", headers: [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: LAB_WORKER_CSP }] },
      // The worker script must never be cached by the browser or the CDN, so a deploy is picked up on the next visit.
      { source: "/serwist/:path*", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
});

export default nextConfig;
