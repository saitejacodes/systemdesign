import { describe, expect, it } from "vitest";
import { listModels } from "@/lib/ai/client";
import { AiError, describeError } from "@/lib/ai/types";
import { AI_ORIGINS, connectAllowed, LAB_WORKER_CSP, PAGE_CSP } from "./csp";

describe("CSP", () => {
  it("allows the listed providers, the CDNs and localhost on any port, nothing else", () => {
    for (const o of AI_ORIGINS) expect(connectAllowed(`${o}/v1`)).toBe(true);
    expect(connectAllowed("https://cdn.jsdelivr.net/pyodide/")).toBe(true);
    expect(connectAllowed("http://localhost:11434/v1")).toBe(true);
    expect(connectAllowed("http://127.0.0.1:8787")).toBe(true);
    expect(connectAllowed("https://my-llm.example.com/v1")).toBe(false);
    expect(connectAllowed("http://api.openai.com/v1")).toBe(false);
    expect(connectAllowed("not a url")).toBe(false);
  });

  it("keeps eval out of pages and gives it only to the lab workers", () => {
    expect(PAGE_CSP).not.toContain("'unsafe-eval'");
    expect(PAGE_CSP).toContain("'wasm-unsafe-eval'");
    expect(PAGE_CSP).toContain("frame-ancestors 'none'");
    expect(PAGE_CSP).toMatch(/connect-src [^;]*https:\/\/api\.anthropic\.com/);
    expect(LAB_WORKER_CSP).toContain("'unsafe-eval'");
  });

  it("explains a custom endpoint the policy would block, before any request", async () => {
    const err = await listModels({ provider: "openai-compatible", apiKey: "k", baseUrl: "https://my-llm.example.com/v1" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("blocked");
    expect(describeError(err, "openai-compatible")).toContain("my-llm.example.com");
  });
});
