"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAdapter } from "@/lib/db/adapter";
import { useSettings } from "@/lib/db/hooks";
import { chat } from "@/lib/ai/client";
import { estimateCost } from "@/lib/ai/pricing";
import { DEFAULT_MODEL, PROVIDERS, describeError, type AiConfig, type ChatRequest, type ChatResult, type Provider } from "@/lib/ai/types";
import { recordUsage } from "@/lib/ai/usage";

/** The configured provider, or null when there is no key (every AI entry point then shows the "add a key" message). */
export function useAiConfig(): AiConfig | null {
  const s = useSettings();
  const provider: Provider = (PROVIDERS as readonly string[]).includes(s.aiProvider ?? "") ? (s.aiProvider as Provider) : "anthropic";
  const model = s.aiModel?.trim() || DEFAULT_MODEL[provider];
  if (!s.apiKey?.trim() || !model) return null;
  return { provider, apiKey: s.apiKey.trim(), model, baseUrl: s.aiBaseUrl };
}

export interface RequestMeta { inputTokens: number; outputTokens: number; estimatedTokens: boolean; cost: number | null; model: string }

/**
 * One streamed AI request at a time: live text, a readable error, token and cost figures, and usage recorded in the
 * AiUsage table. `run` resolves with the final result (or null on error or stop).
 */
export function useAiRequest(cfg: AiConfig | null) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<RequestMeta | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const run = useCallback(async (req: Omit<ChatRequest, "signal">): Promise<ChatResult | null> => {
    if (!cfg) return null;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setText(""); setError(null); setMeta(null); setBusy(true);
    try {
      const r = await chat(cfg, { ...req, signal: c.signal }, (d) => setText((t) => t + d));
      setText(r.text);
      setMeta({ inputTokens: r.inputTokens, outputTokens: r.outputTokens, estimatedTokens: r.estimatedTokens, cost: estimateCost(r), model: r.model });
      await recordUsage(getAdapter(), r);
      return r;
    } catch (e) {
      if (!c.signal.aborted) setError(describeError(e, cfg.provider));
      return null;
    } finally {
      if (ctl.current === c) { setBusy(false); ctl.current = null; }
    }
  }, [cfg]);

  const stop = useCallback(() => { ctl.current?.abort(); setBusy(false); }, []);
  const clear = useCallback(() => { setText(""); setError(null); setMeta(null); }, []);
  return { run, stop, clear, text, busy, error, meta };
}
