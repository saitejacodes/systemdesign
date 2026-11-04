import type { ChatResult } from "./types";

/**
 * List prices in USD per million tokens (Anthropic's first-party rates, October 2026) and the request features each
 * model accepts. Unknown models (including every OpenAI-compatible one) get no cost estimate rather than a guess.
 */
interface ModelInfo { inPerM: number; outPerM: number; effort: boolean; fallbacks: boolean }

export const ANTHROPIC_MODELS: Record<string, ModelInfo> = {
  "claude-fable-5-1": { inPerM: 10, outPerM: 50, effort: true, fallbacks: true },
  "claude-opus-5-5": { inPerM: 4, outPerM: 20, effort: true, fallbacks: true },
  "claude-opus-5": { inPerM: 5, outPerM: 25, effort: true, fallbacks: true },
  "claude-opus-4-8": { inPerM: 5, outPerM: 25, effort: true, fallbacks: false },
  "claude-sonnet-5-5": { inPerM: 2, outPerM: 10, effort: true, fallbacks: true },
  "claude-sonnet-5": { inPerM: 2, outPerM: 10, effort: true, fallbacks: false },
  "claude-haiku-5-5": { inPerM: 0.1, outPerM: 0.5, effort: true, fallbacks: false },
  "claude-haiku-4-5": { inPerM: 1, outPerM: 5, effort: false, fallbacks: false },
};

export const modelInfo = (model: string): ModelInfo | undefined => ANTHROPIC_MODELS[model];

/** Estimated USD cost of one request, or null when the model's price is unknown. */
export function estimateCost(r: Pick<ChatResult, "model" | "inputTokens" | "outputTokens">): number | null {
  const m = modelInfo(r.model);
  return m ? (r.inputTokens * m.inPerM + r.outputTokens * m.outPerM) / 1_000_000 : null;
}

/** Rough token count for text a provider did not report usage for: about 4 characters per token in English. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export function formatCost(usd: number | null): string {
  if (usd === null) return "cost unknown";
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
