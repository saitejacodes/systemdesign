import type { Challenge, ChallengeOutcome } from "@/lib/sim/engine";
import { summary, type RagConfig, type RagState } from "./model";

const notLoaded: ChallengeOutcome = { passed: false, value: 0, detail: "The handbook corpus hasn't loaded yet. Start the run again in a moment." };
const ready = (s: RagState) => s.traces.length > 0;

/** Retrieval is deterministic, so a run only has to evaluate the 20 questions once; done() ends it as soon as they have run. */
export const challenges: Challenge<RagConfig, RagState>[] = [
  {
    id: "hit-90-2k",
    title: "Find the evidence on a budget",
    description: "Get the gold passage into the assembled context for at least 18 of the 20 questions (≥ 90% hit rate), with no query using more than 2,000 context tokens.",
    durationMs: 5_000,
    better: "higher",
    done: ready,
    winCondition(_h, s) {
      if (!ready(s)) return notLoaded;
      const m = summary(s);
      const ok = m.hitRate >= 90 && m.ctxMax <= 2000;
      return { passed: ok, value: m.hitRate, detail: `${m.hits}/20 hits, largest context ≈ ${m.ctxMax} tokens. ${ok ? "Every answer the model gives now has its evidence in the prompt." : m.ctxMax > 2000 ? "Over the 2,000-token cap: lower the token budget." : `Misses: ${m.reasons.split} split, ${m.reasons.budget} cut by budget, ${m.reasons.missed} not retrieved.`}` };
    },
    hint: "Split misses mean the chunker cut the passage: use sentence or heading chunks, or add overlap. 'Not retrieved' means top-k is too small or one retriever is blind to the wording: raise top-k and try hybrid. Smaller chunks let more of them fit in 2,000 tokens.",
  },
  {
    id: "fixed-split",
    title: "Rescue the split answers",
    description: "Keep the fixed-size chunker, but leave no question missed because its passage was split across chunks, and still reach ≥ 90% hit rate within 2,000 context tokens.",
    durationMs: 5_000,
    better: "higher",
    done: ready,
    winCondition(_h, s) {
      if (!ready(s)) return notLoaded;
      const m = summary(s);
      if (s.settings.strategy !== "fixed") return { passed: false, value: 0, detail: `The chunker is set to "${s.settings.strategy}". This challenge is about making fixed-size chunks work: switch back to fixed.` };
      const ok = m.reasons.split === 0 && m.hitRate >= 90 && m.ctxMax <= 2000;
      return { passed: ok, value: m.hitRate, detail: `${m.hits}/20 hits, ${m.reasons.split} split, largest context ≈ ${m.ctxMax} tokens. ${ok ? "Overlap means any passage shorter than the overlap lies whole inside some chunk." : m.reasons.split ? "Some passages still straddle a chunk boundary." : "No splits left; now improve retrieval or fit more chunks."}` };
    },
    hint: "A passage up to `overlap` tokens long always lies whole inside at least one chunk. Try 40–80 tokens of overlap with 150–300-token chunks, then set top-k so k × chunk size stays near 2,000.",
  },
  {
    id: "lean-context",
    title: "Lean context",
    description: "Keep the 90% hit rate (18/20) while every query's context stays at or under 800 tokens: less than half the first challenge's cap.",
    durationMs: 5_000,
    better: "higher",
    done: ready,
    winCondition(_h, s) {
      if (!ready(s)) return notLoaded;
      const m = summary(s);
      const ok = m.hitRate >= 90 && m.ctxMax <= 800;
      return { passed: ok, value: m.hitRate, detail: `${m.hits}/20 hits, largest context ≈ ${m.ctxMax} tokens. ${ok ? "Wide recall, then a reranker that decides what earns a place in a small prompt." : m.reasons.budget ? `${m.reasons.budget} gold chunk(s) were retrieved but didn't fit in the budget: the order matters.` : "Retrieve wider, then choose better."}` };
    },
    hint: "With 800 tokens only a handful of chunks fit, so rank order decides what survives. Retrieve wide (top-k 15) with small heading chunks, then either fuse BM25 and vectors or turn the reranker on so the best candidates are packed first.",
  },
];
