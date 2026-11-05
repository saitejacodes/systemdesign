// Content Security Policy and security headers, shared by next.config.ts (which sends them) and the AI client
// (which explains a blocked custom endpoint instead of failing with a bare network error). Reasons: DECISIONS.md, Prompt 24.

/** Hosted AI providers the browser may call directly with the learner's own key. */
export const AI_ORIGINS = [
  "https://api.anthropic.com",
  "https://generativelanguage.googleapis.com",
  "https://api.groq.com",
  "https://openrouter.ai",
  "https://api.openai.com",
];

/** Pinned CDN files: Monaco (editor), Pyodide (Python labs), the TypeScript compiler (JS labs). */
export const CDN_ORIGINS = ["https://cdn.jsdelivr.net", "https://unpkg.com"];

/** The optional local AI proxy (scripts/ai-proxy) and other local OpenAI-compatible servers, on any port. */
export const LOCAL_ORIGINS = ["http://localhost:*", "http://127.0.0.1:*"];

/** True when the CSP's connect-src lets the page call this URL. */
export function connectAllowed(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
  return u.protocol === "https:" && [...AI_ORIGINS, ...CDN_ORIGINS].includes(u.origin);
}

const policy = (d: Record<string, string[]>) => Object.entries(d).map(([k, v]) => [k, ...v].join(" ")).join("; ");

/**
 * Pages: no 'unsafe-eval'. 'unsafe-inline' scripts because Next's static pages inline their bootstrap
 * (nonces would make every page dynamic); 'wasm-unsafe-eval' for PGlite.
 */
export const PAGE_CSP = policy({
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...CDN_ORIGINS],
  "style-src": ["'self'", "'unsafe-inline'", ...CDN_ORIGINS],
  "font-src": ["'self'", "data:", ...CDN_ORIGINS],
  "img-src": ["'self'", "data:", "blob:"],
  "connect-src": ["'self'", ...AI_ORIGINS, ...CDN_ORIGINS, ...LOCAL_ORIGINS],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
});

/**
 * Code-lab workers (/labs/*.js) run the learner's code with new Function (JS) or Pyodide, so they alone get
 * 'unsafe-eval'. They have no DOM and block fetch for learner code (see js-worker.js).
 */
export const LAB_WORKER_CSP = policy({
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'", ...CDN_ORIGINS],
  "connect-src": ["'self'", ...CDN_ORIGINS],
});

export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" },
];
