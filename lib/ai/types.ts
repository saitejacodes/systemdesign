// Provider-agnostic shapes for the optional AI features (Prompt 21). The key lives only in Settings.apiKey (IndexedDB)
// and is sent only to the provider the learner picked.

export const PROVIDERS = ["anthropic", "openai-compatible"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI-compatible endpoint",
};

export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-opus-5-5",
  "openai-compatible": "",
};

export interface AiConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  /** OpenAI-compatible only: the API root that /chat/completions hangs off, e.g. https://api.openai.com/v1. */
  baseUrl?: string;
}

export interface ChatMessage { role: "user" | "assistant"; content: string }

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** Anthropic models that support it; ignored elsewhere. Chat uses "low", grading "high". */
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** True when the provider reported no usage and the counts are estimated from characters. */
  estimatedTokens: boolean;
  model: string;
}

export type AiErrorKind = "invalid-key" | "rate-limit" | "overloaded" | "network" | "timeout" | "not-found" | "bad-request" | "refused" | "aborted" | "unknown";

const RETRYABLE: ReadonlySet<AiErrorKind> = new Set(["rate-limit", "overloaded", "network", "timeout"]);

export class AiError extends Error {
  constructor(readonly kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
  }
  get retryable() { return RETRYABLE.has(this.kind); }
}

/** One line a learner can act on, per kind. */
export function describeError(e: unknown, provider?: Provider): string {
  if (!(e instanceof AiError)) return e instanceof Error ? e.message : "Something went wrong.";
  switch (e.kind) {
    case "invalid-key": return "The provider rejected the API key. Check it in Settings → AI.";
    case "rate-limit": return "Rate limited by the provider. Wait a minute and try again.";
    case "overloaded": return "The provider is overloaded or had a server error. Try again shortly.";
    case "timeout": return "No response within 60 seconds. Try again, or ask something shorter.";
    case "network": return provider === "openai-compatible"
      ? "Could not reach the endpoint. It may block browser requests (CORS): run the local proxy in scripts/ai-proxy and point the base URL at it."
      : "Could not reach the provider. Check your connection.";
    case "not-found": return `Not found: ${e.message}. Check the model name (and base URL) in Settings → AI.`;
    case "refused": return "The model declined this request.";
    case "aborted": return "Stopped.";
    default: return e.message;
  }
}
