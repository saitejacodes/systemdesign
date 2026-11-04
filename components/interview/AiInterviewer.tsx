"use client";
import { useState } from "react";
import { MessageSquare, Sparkles } from "lucide-react";
import { AddKeyNotice, AiError, AiText, AI_LABEL, RequestCost } from "@/components/ai/AiParts";
import { useAiConfig, useAiRequest } from "@/components/ai/useAi";
import { followUpPrompt, interviewerSystem, parseFeedback, scoringPrompt, SCORING_SYSTEM } from "@/lib/ai/prompts";
import type { ChatMessage } from "@/lib/ai/types";
import type { CaseStudyMeta, Rubric } from "@/lib/content/schemas";
import { readDesign } from "@/lib/interview/store";
import { revealedCount } from "@/lib/interview/timing";
import type { InterviewSession } from "@/lib/interview/types";
import type { StudioGraph } from "@/lib/studio/types";
import { SubHead, TextArea } from "./fields";

type Update = (fn: (s: InterviewSession) => InterviewSession) => void;
interface Props { meta: CaseStudyMeta; s: InterviewSession; set: Update; readOnly?: boolean }

const withAi = (s: InterviewSession, fn: (ai: NonNullable<InterviewSession["ai"]>) => NonNullable<InterviewSession["ai"]>): InterviewSession =>
  ({ ...s, ai: fn(s.ai ?? { on: true, asks: [], followUps: [] }) });

/** Requirements: ask the interviewer anything; answers come in character, grounded in the case's clarifying answers. */
export function AskInterviewer({ meta, s, set, readOnly }: Props) {
  const cfg = useAiConfig();
  const ai = useAiRequest(cfg);
  const [q, setQ] = useState("");
  const asks = s.ai?.asks ?? [];

  const ask = async () => {
    const question = q.trim();
    if (!question || ai.busy) return;
    const history: ChatMessage[] = asks.flatMap((x) => [{ role: "user" as const, content: x.q }, { role: "assistant" as const, content: x.a }]);
    const r = await ai.run({ system: interviewerSystem(meta), messages: [...history, { role: "user", content: question }], effort: "low", maxTokens: 4_000 });
    if (r) { set((x) => withAi(x, (a) => ({ ...a, asks: [...a.asks, { q: question, a: r.text.trim() }] }))); setQ(""); }
  };

  return (
    <section className="grid gap-2" aria-labelledby="ask-h" data-testid="ai-interviewer">
      <SubHead><span id="ask-h">Ask the interviewer · AI</span></SubHead>
      {asks.length > 0 && (
        <ul className="grid gap-2">
          {asks.map((x, i) => (
            <li key={i} className="grid gap-1">
              <p className="text-[15px]"><span className="fm-cap">You · </span>{x.q}</p>
              <p className="border-l-2 border-cobalt pl-3 text-[15px]"><span className="fm-cap">Interviewer · {AI_LABEL} · </span>{x.a}</p>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (cfg ? (
        <>
          {ai.busy && <AiText text={ai.text} busy />}
          {ai.error && <AiError message={ai.error} />}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
            <label htmlFor="ask-q" className="sr-only">Your question for the interviewer</label>
            <input id="ask-q" className="fm-input min-w-0 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Any question the list above doesn't cover…" />
            <button type="submit" className="fm-btn" disabled={!q.trim() || ai.busy}><MessageSquare size={14} aria-hidden /> Ask</button>
          </form>
          {ai.meta && <RequestCost meta={ai.meta} />}
        </>
      ) : <AddKeyNotice feature="The AI interviewer" />)}
    </section>
  );
}

/** Deep Dives: a follow-up question generated from the learner's current design and panels. */
export function AiFollowUps({ meta, s, set, readOnly, elapsed }: Props & { elapsed: number }) {
  const cfg = useAiConfig();
  const ai = useAiRequest(cfg);
  const followUps = s.ai?.followUps ?? [];

  const askNext = async () => {
    const d = await readDesign(s.designId);
    const shown = revealedCount(meta.deepDiveQuestions.length, s.durationMin, elapsed, s.deepDivesOpenedAt, s.deepDivesRequested);
    const asked = [...meta.deepDiveQuestions.slice(0, shown), ...followUps.map((f) => f.q)];
    const r = await ai.run({ system: interviewerSystem(meta), messages: [{ role: "user", content: followUpPrompt(meta, s, d?.graph ?? { version: 1, nodes: [], edges: [] }, asked) }], effort: "medium", maxTokens: 8_000 });
    if (r) { set((x) => withAi(x, (a) => ({ ...a, followUps: [...a.followUps, { q: r.text.trim(), a: "" }] }))); }
  };

  return (
    <section className="grid gap-3" aria-labelledby="fu-h" data-testid="ai-followups">
      <SubHead><span id="fu-h">Follow-ups on your design · AI</span></SubHead>
      {followUps.length > 0 && (
        <ol className="grid gap-3">
          {followUps.map((f, i) => (
            <li key={i} className="grid gap-1.5">
              <p className="border-l-2 border-cobalt pl-3 text-[15px]"><span className="fm-cap">Interviewer · AI follow-up {i + 1} · {AI_LABEL} · </span>{f.q}</p>
              <TextArea label={`Your answer to follow-up ${i + 1}`} rows={3} value={f.a} readOnly={readOnly}
                onChange={(v) => set((x) => withAi(x, (a) => ({ ...a, followUps: a.followUps.map((y, k) => (k === i ? { ...y, a: v } : y)) })))} />
            </li>
          ))}
        </ol>
      )}
      {!readOnly && (cfg ? (
        <>
          {ai.busy && <AiText text={ai.text} busy />}
          {ai.error && <AiError message={ai.error} />}
          <button type="button" className="fm-btn fm-btn--tool justify-self-start" disabled={ai.busy} onClick={askNext}><Sparkles size={14} aria-hidden /> {ai.busy ? "Reading your design…" : "Ask a follow-up about my design"}</button>
          {ai.meta && <RequestCost meta={ai.meta} />}
        </>
      ) : <AddKeyNotice feature="The AI interviewer" />)}
    </section>
  );
}

/** Self-review: the AI grades the attempt against the rubric. Its scores sit beside the learner's and never replace them. */
export function AiGrader({ meta, rubric, s, set, mine }: { meta: CaseStudyMeta; rubric: Rubric; s: InterviewSession; set: Update; mine: StudioGraph | null }) {
  const cfg = useAiConfig();
  const ai = useAiRequest(cfg);
  const [bad, setBad] = useState(false);
  const fb = s.ai?.feedback;

  const grade = async () => {
    setBad(false);
    const r = await ai.run({ system: SCORING_SYSTEM, messages: [{ role: "user", content: scoringPrompt(meta, rubric, s, mine ?? { version: 1, nodes: [], edges: [] }, meta.trafficProfile) }], effort: "high", maxTokens: 32_000 });
    if (!r) return;
    const parsed = parseFeedback(r.text, rubric);
    if (!parsed) { setBad(true); return; }
    set((x) => withAi(x, (a) => ({ ...a, feedback: { ...parsed, model: r.model } })));
  };

  return (
    <section aria-labelledby="aifb-h" className="grid gap-3" data-testid="ai-grader">
      <h3 id="aifb-h" className="fm-cap border-b border-ink pb-1">AI feedback · optional</h3>
      {!cfg ? <AddKeyNotice feature="AI grading" /> : (
        <>
          <p className="text-[15px] text-ink-muted">The AI scores your attempt against the same rubric, with a reason for each score and 3 improvements. Its scores appear next to yours; your self-scores are what count.</p>
          <button type="button" className="fm-btn justify-self-start" disabled={ai.busy} onClick={grade}><Sparkles size={14} aria-hidden /> {ai.busy ? "Grading…" : fb ? "Grade again" : "Get AI feedback"}</button>
          {ai.busy && <p className="fm-help" aria-live="polite">Reading your design, panels and Run Mode results…</p>}
          {ai.error && <AiError message={ai.error} />}
          {bad && <p role="alert" className="fm-help is-error">The AI&apos;s reply was not in the expected format. Try again.</p>}
          {ai.meta && <RequestCost meta={ai.meta} />}
        </>
      )}
      {fb && (
        <div className="grid gap-2">
          <p className="fm-cap text-cobalt">{AI_LABEL} · {fb.model} · AI total {fb.scores.reduce((a, x) => a + x.score, 0)}/{rubric.criteria.length * 2}</p>
          <p className="font-medium">3 improvements</p>
          <ol className="grid list-decimal gap-1 pl-5 text-[15px]">{fb.improvements.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </div>
      )}
    </section>
  );
}

/** The AI's score for one criterion, shown under the learner's radio buttons. */
export function AiCriterionScore({ s, id }: { s: InterviewSession; id: string }) {
  const x = s.ai?.feedback?.scores.find((y) => y.id === id);
  if (!x) return null;
  const mine = s.selfScores[id];
  return (
    <p className="border-l-2 border-cobalt pl-3 text-[15px]" data-testid="ai-score">
      <span className="fm-cap">AI · {x.score} point{x.score === 1 ? "" : "s"}{mine !== undefined && mine !== x.score ? ` · you said ${mine}` : ""} · </span>{x.justification}
    </p>
  );
}
