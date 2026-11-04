"use client";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles } from "lucide-react";
import { formatCost } from "@/lib/ai/pricing";
import type { RequestMeta } from "./useAi";

export const AI_LABEL = "AI-generated: may contain mistakes";

/** Shown wherever an AI feature would be when no key is configured. */
export function AddKeyNotice({ feature }: { feature: string }) {
  return (
    <p className="fm-help" data-testid="ai-no-key">
      <Sparkles size={14} className="mr-1 inline align-[-2px] text-cobalt" aria-hidden />
      {feature} needs an AI provider. <Link href="/settings#ai">Add an API key in Settings</Link>. Everything else works without one.
    </p>
  );
}

/** Streamed Markdown from a model, always labelled. */
export function AiText({ text, busy }: { text: string; busy?: boolean }) {
  return (
    <div className="grid gap-1" data-testid="ai-output">
      <span className="fm-cap text-cobalt">{AI_LABEL}</span>
      <div className="lesson !text-[15px]" aria-busy={busy}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || (busy ? "…" : "")}</ReactMarkdown>
      </div>
    </div>
  );
}

/** Tokens and estimated cost for one request. */
export function RequestCost({ meta }: { meta: RequestMeta }) {
  const approx = meta.estimatedTokens ? "≈ " : "";
  return (
    <p className="fm-cap tabular-nums" data-testid="ai-cost">
      {meta.model} · {approx}{meta.inputTokens.toLocaleString()} in · {approx}{meta.outputTokens.toLocaleString()} out · {meta.cost === null ? "cost unknown" : `≈ ${formatCost(meta.cost)}`}
    </p>
  );
}

export function AiError({ message }: { message: string }) {
  return <p role="alert" className="fm-help is-error">{message}</p>;
}
