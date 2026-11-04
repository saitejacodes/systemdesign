import type { CaseStudyMeta } from "@/lib/content/schemas";
import type { Step } from "./types";

const fmt = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toPrecision(3)}M` : n >= 1e3 ? `${+(n / 1e3).toPrecision(3)}K` : `${+n.toPrecision(3)}`);

// Words that place a common mistake under a step, so the step's second hint can warn about it.
const STEP_WORDS: Partial<Record<Step, RegExp>> = {
  Requirements: /requirement|scope|clarif|assum|functional/i,
  Estimation: /estimat|qps|storage|bandwidth|capacity|peak|number/i,
  API: /api|endpoint|idempot|paginat|rest|grpc|request/i,
  "Data Model": /data model|schema|database|db\b|sql|nosql|key|index|partition|shard/i,
  "High-Level Design": /cache|load balanc|cdn|queue|single point|spof|replica/i,
  "Deep Dives": /fail|retry|consisten|race|hot|order|duplicate|timeout/i,
};

/**
 * Two hints for a step, derived from the case meta (the schema has no hints field on purpose): the first nudges the
 * method, the second gives something case-specific. `asked` lets the Requirements hint point at questions not yet asked.
 */
export function stepHints(meta: CaseStudyMeta, step: Step, asked: number[] = []): [string, string] {
  const tp = meta.trafficProfile;
  const types = tp.requestTypes.map((r) => `${r.name} (${r.op})`).join(", ");
  const mistake = (fallback: string) => {
    const re = STEP_WORDS[step];
    return (re && meta.commonMistakes.find((m) => re.test(m))) || fallback;
  };
  switch (step) {
    case "Requirements": {
      const open = meta.clarifyingQuestions.map((q, i) => ({ q, i })).filter(({ i }) => !asked.includes(i)).slice(0, 2).map(({ q }) => q.question);
      return [
        open.length ? `Pin down scope before you draw. Worth asking: ${open.join(" · ")}` : "You have asked every clarifying question; write the answers down as functional and non-functional requirements.",
        `Size the non-functional side: plan for about ${fmt(tp.qps)} requests/s on average, ${fmt(tp.readWriteRatio)}:1 reads to writes, peaking at ${tp.peakMultiplier}× average.`,
      ];
    }
    case "Estimation":
      return [
        "Average QPS = daily users × actions per user ÷ 86,400 s; peak = average × peak factor. Storage = writes/day × item size × retention.",
        `This case runs at about ${fmt(tp.qps)}/s average and ${fmt(tp.qps * tp.peakMultiplier)}/s at peak, ${fmt(tp.readWriteRatio)}:1 read:write. Check your numbers land in that range.`,
      ];
    case "API":
      return [
        `Write one endpoint per request type: ${types}. Reads are usually GET, writes POST or PUT.`,
        mistake("Make writes safe to retry with an idempotency key, and paginate list reads with a cursor rather than an offset."),
      ];
    case "Data Model":
      return [
        `Start from the access patterns (${types}); pick the key the hottest one looks up by, then choose the store that serves that lookup.`,
        mistake("Justify the database by its access pattern and consistency need, not by habit: say what the alternative was and why it lost."),
      ];
    case "High-Level Design":
      return [
        `Walk each request type through the diagram, component by component: ${types}.`,
        `The reference design must pass "${meta.runChallenge.title}": ${meta.runChallenge.description}`,
      ];
    case "Deep Dives":
      return [
        "Answer each push in four beats: what saturates or fails, how you detect it, what a request sees meanwhile, and the fix with its cost.",
        mistake(meta.commonMistakes[0]),
      ];
    case "Wrap-up":
      return [
        "Close with what breaks first at 10× load, the two or three trade-offs you made (and the alternative each time), and what you would alert on.",
        `Check yourself against common mistakes: ${meta.commonMistakes.slice(0, 2).join(" · ")}`,
      ];
  }
}
