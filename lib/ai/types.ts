// Provider-agnostic shapes for the optional AI features (Prompt 21). The key lives only in Settings.apiKey (IndexedDB)
// and is sent only to the provider the learner picked.

export const PROVIDERS = ["anthropic", "gemini", "groq", "openrouter", "openai", "openai-compatible"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic (Claude)",
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  "openai-compatible": "Other OpenAI-compatible endpoint",
};

/** Blank means the learner picks one (Settings → AI → Load models); model names change too often to hard-code. */
export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-opus-5-5",
  gemini: "",
  groq: "",
  openrouter: "",
  openai: "",
  "openai-compatible": "",
};

export interface ProviderPreset {
  /** The OpenAI-compatible API root (…/chat/completions, …/models). All four answer CORS preflights from a web page. */
  baseUrl: string;
  /** Where to create a key. */
  keysUrl: string;
  /** The provider's model list. */
  modelsUrl: string;
}

/** Hosted providers that speak the OpenAI chat-completions protocol. */
export const PRESETS: Partial<Record<Provider, ProviderPreset>> = {
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keysUrl: "https://aistudio.google.com/apikey", modelsUrl: "https://ai.google.dev/gemini-api/docs/models" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", keysUrl: "https://console.groq.com/keys", modelsUrl: "https://console.groq.com/docs/models" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", keysUrl: "https://openrouter.ai/settings/keys", modelsUrl: "https://openrouter.ai/models" },
  openai: { baseUrl: "https://api.openai.com/v1", keysUrl: "https://platform.openai.com/api-keys", modelsUrl: "https://platform.openai.com/docs/models" },
};

export const isProvider = (x: string | undefined): x is Provider => (PROVIDERS as readonly string[]).includes(x ?? "");

/** The API root for an OpenAI-protocol provider: the preset's, or the learner's own for a custom endpoint. */
export const baseUrlFor = (cfg: Pick<AiConfig, "provider" | "baseUrl">) => (PRESETS[cfg.provider]?.baseUrl ?? cfg.baseUrl ?? "").trim().replace(/\/+$/, "");

export interface AiConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  /** Custom OpenAI-compatible endpoint only: the API root that /chat/completions hangs off. Presets carry their own. */
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

export type AiErrorKind = "invalid-key" | "rate-limit" | "overloaded" | "network" | "timeout" | "not-found" | "bad-request" | "refused" | "aborted" | "blocked" | "unknown";

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
    case "blocked": return `This site's security policy doesn't allow requests to ${e.message}. Run the local proxy in scripts/ai-proxy and point the base URL at it (http://localhost:…), or pick a listed provider.`;
    case "not-found": return `Not found: ${e.message}. Check the model name (and base URL) in Settings → AI.`;
    case "refused": return "The model declined this request.";
    case "aborted": return "Stopped.";
    default: return e.message;
  }
}
