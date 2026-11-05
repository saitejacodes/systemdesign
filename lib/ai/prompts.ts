import { z } from "@/lib/zod";
import type { CaseStudyMeta, Rubric } from "@/lib/content/schemas";
import type { InterviewSession } from "@/lib/interview/types";
import type { TrafficProfile } from "@/lib/studio/sim";
import type { StudioGraph } from "@/lib/studio/types";
import { serializeGraph, serializeRun, serializeSession, trim } from "./serialize";
import type { ChatMessage } from "./types";

/** Lesson text sent with every tutor turn is capped so long lessons stay cheap. */
export const LESSON_CHARS = 12_000;
/** Earlier tutor turns kept in the request; older ones stay stored but are not resent. */
export const TUTOR_HISTORY = 12;

export interface PageContext { url: string; title: string; topics: string[]; text: string }

const STYLE = "Write plain, direct English. Define any term the learner may not know. Use short paragraphs, Markdown lists and tables where they help, and real numbers with the arithmetic shown. If something is uncertain or the field disagrees, say so. Never invent statistics, quotes or URLs.";

export function tutorSystem(p: PageContext): string {
  return [
    "You are the tutor in SysDesign Lab, a site that teaches system design to backend engineers with 0–4 years of experience.",
    "The learner is reading the page below. Ground your answers in it, and say when you go beyond it.",
    STYLE,
    `<page url="${p.url}">`,
    `Title: ${p.title}`,
    p.topics.length ? `Topics: ${p.topics.join("; ")}` : "",
    "Page text:",
    trim(p.text, LESSON_CHARS),
    "</page>",
  ].filter(Boolean).join("\n");
}

export const TUTOR_MODES = [
  { id: "simpler", label: "Explain simpler", prompt: "Explain the main idea of this page more simply, as if to someone in their first year as a backend engineer. Use one everyday analogy, then say where the analogy breaks." },
  { id: "example", label: "Give me an example", prompt: "Give me one concrete, worked example of the main idea on this page, with realistic numbers and the arithmetic shown, and what goes wrong without it." },
  { id: "quiz", label: "Quiz me on this page", prompt: "Quiz me on this page. Ask one question at a time, starting easy; wait for my answer, tell me what I got right and wrong, then ask the next, slightly harder one. Ask the first question now." },
  { id: "check", label: "Check my understanding", prompt: "I am going to explain the main idea of this page in my own words. Critique my explanation: what is correct, what is missing, and what is wrong, most important first. Start by asking me to explain it." },
] as const;
export type TutorMode = (typeof TUTOR_MODES)[number]["id"];

/** The messages to send: the most recent turns only, always starting with a user turn. */
export function tutorMessages(history: ChatMessage[]): ChatMessage[] {
  let recent = history.slice(-TUTOR_HISTORY);
  while (recent.length && recent[0].role !== "user") recent = recent.slice(1);
  return recent;
}

// Interviewer ------------------------------------------------------------------------------------------------------

export function interviewerSystem(meta: CaseStudyMeta): string {
  return [
    "You are the interviewer in a mock system design interview. Stay in character: a friendly, experienced engineer.",
    `The prompt you gave the candidate: "${meta.interviewerPrompt}"`,
    "These are the facts you hold about the problem. Answer clarifying questions from them:",
    ...meta.clarifyingQuestions.map((q) => `- Q: ${q.question}\n  A: ${q.answer}`),
    "Rules:",
    "- Answer only what was asked, in 1–3 sentences, like a real interviewer. Do not volunteer the design or name the components they should use.",
    "- If the facts above do not cover the question, give a reasonable answer that is consistent with them and say it is your assumption for this interview.",
    "- If the candidate asks you to design it for them, decline politely and turn the question back to them.",
  ].join("\n");
}

export function followUpPrompt(meta: CaseStudyMeta, s: InterviewSession, graph: StudioGraph, asked: string[]): string {
  return [
    "Here is the candidate's work so far.",
    "<design>", serializeGraph(graph), "</design>",
    "<panels>", serializeSession(s, meta.deepDiveQuestions.slice(0, Object.keys(s.deepDiveAnswers).length)), "</panels>",
    asked.length ? `Questions already asked (do not repeat them):\n${asked.map((q) => `- ${q}`).join("\n")}` : "",
    "Ask ONE follow-up deep-dive question that pushes on the weakest or riskiest part of THIS design: a component under load, a single point of failure, a consistency or ordering problem, or a requirement the design does not meet. Name the component or decision you are probing. Reply with the question only, one or two sentences, no preamble.",
  ].filter(Boolean).join("\n");
}

// Scoring ----------------------------------------------------------------------------------------------------------

export const AiFeedback = z.object({
  scores: z.array(z.object({ id: z.string(), score: z.number().int().min(0).max(2), justification: z.string().min(1) })),
  improvements: z.array(z.string().min(1)).min(1).max(5),
});
export type AiFeedback = z.infer<typeof AiFeedback>;

export function scoringPrompt(meta: CaseStudyMeta, rubric: Rubric, s: InterviewSession, graph: StudioGraph, profile: TrafficProfile | null): string {
  return [
    `Grade this mock interview answer to: "${meta.interviewerPrompt}"`,
    "Score each rubric criterion 0, 1 or 2 using its level descriptions. Be strict: a 2 needs the specific evidence the level describes. Justify each score in one or two sentences that quote or point at what the candidate wrote or drew. Then give exactly 3 specific improvements, most valuable first, each naming what to change in this design.",
    "<rubric>",
    ...rubric.criteria.map((c) => `- id: ${c.id} · step: ${c.step} · ${c.title}\n  0: ${c.levels["0"]}\n  1: ${c.levels["1"]}\n  2: ${c.levels["2"]}`),
    "</rubric>",
    "<design>", serializeGraph(graph), "</design>",
    profile && graph.nodes.length ? `<run_mode>\n${serializeRun(graph, profile)}\n</run_mode>` : "",
    "<panels>", serializeSession(s, meta.deepDiveQuestions), "</panels>",
    "Reply with only a JSON object in a ```json fenced block, in exactly this shape:",
    '{"scores":[{"id":"<criterion id>","score":0,"justification":"..."}],"improvements":["...","...","..."]}',
    `Include every criterion id exactly once: ${rubric.criteria.map((c) => c.id).join(", ")}.`,
  ].filter(Boolean).join("\n");
}

export const SCORING_SYSTEM = `You are a senior engineer grading a system design interview against a rubric. You are fair, specific and strict. ${STYLE}`;

/** Reads the model's JSON, keeping only scores for criteria in the rubric. Null when it is not usable. */
export function parseFeedback(text: string, rubric: Rubric): AiFeedback | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return null; }
  const r = AiFeedback.safeParse(json);
  if (!r.success) return null;
  const ids = new Set(rubric.criteria.map((c) => c.id));
  const seen = new Set<string>();
  const scores = r.data.scores.filter((x) => ids.has(x.id) && !seen.has(x.id) && seen.add(x.id));
  return scores.length ? { scores, improvements: r.data.improvements.slice(0, 3) } : null;
}

// Explain my design ------------------------------------------------------------------------------------------------

export const EXPLAIN_SYSTEM = `You review system designs drawn in SysDesign Lab's Design Studio for a learner. ${STYLE}`;

export function explainDesignPrompt(graph: StudioGraph, profile: TrafficProfile, title: string): string {
  return [
    `Review the design "${title}".`,
    "<design>", serializeGraph(graph), "</design>",
    "<run_mode>", serializeRun(graph, profile), "</run_mode>",
    "Run Mode is a steady-state flow model: utilization = load ÷ capacity, latency grows as utilization nears 100%, requests drop above about 95%.",
    "Answer in three Markdown sections, citing the Run Mode numbers above:",
    "## Bottlenecks — what saturates first at average and at peak, and the smallest change that fixes it.",
    "## Single points of failure — each one, what fails with it, and how to remove it.",
    "## Missing pieces — components or decisions a strong design for this traffic would have (cache, queue, replicas, rate limiting, monitoring, …), and only if they are really missing.",
    "Keep it under 450 words.",
  ].join("\n");
}
