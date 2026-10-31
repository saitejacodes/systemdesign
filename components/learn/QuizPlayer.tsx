"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { getAdapter } from "@/lib/db/adapter";
import { useQuizAttempts } from "@/lib/db/hooks";
import type { QuizAnswer } from "@/lib/db/types";
import type { QuizQuestion } from "@/lib/content/schemas";
import { checkCompletion } from "@/lib/learning/completion";
import { bestQuizScore, type SectionInfo } from "@/lib/learning/progress";

const KEYS = "ABCDEFGH";
const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const Md = ({ children }: { children: string }) => <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{children}</ReactMarkdown>;

interface Run { questions: QuizQuestion[]; order: Record<string, string[]>; startedAt: string }
const newRun = (qs: QuizQuestion[]): Run => ({ questions: qs, order: Object.fromEntries(qs.map((q) => [q.id, shuffle(q.options.map((o) => o.id))])), startedAt: new Date().toISOString() });

export function QuizPlayer({ section, questions, topics }: { section: SectionInfo; questions: QuizQuestion[]; topics: Record<string, string> }) {
  const attempts = useQuizAttempts();
  const [run, setRun] = useState<Run | null>(null);
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [checked, setChecked] = useState(false);
  const best = attempts ? bestQuizScore(attempts, section.id) : 0;

  const start = (qs: QuizQuestion[]) => { setRun(newRun(qs)); setI(0); setSelected([]); setAnswers([]); setChecked(false); };

  if (!run) {
    return (
      <div className="fm-card">
        <div className="fm-card__head"><span>{questions.length} questions</span><span>Best {Math.round(best * 100)}%</span></div>
        <div className="fm-card__body grid gap-3">
          <p className="m-0">One question at a time. After each answer you see why the right option is right and why the others are wrong.</p>
          <button type="button" className="fm-btn fm-btn--primary justify-self-start" onClick={() => start(questions)}>Start quiz <span className="arr">→</span></button>
        </div>
      </div>
    );
  }

  const finished = answers.length === run.questions.length && !checked;
  if (finished) {
    const score = answers.filter((a) => a.correct).length;
    const byTopic = Object.entries(Object.groupBy(answers, (a) => a.topicId)).map(([t, as]) => [t, as!.filter((a) => a.correct).length, as!.length] as const);
    const wrong = run.questions.filter((q) => answers.find((a) => a.questionId === q.id && !a.correct));
    return (
      <div className="fm-card" role="region" aria-label="Quiz results">
        <div className="fm-card__head"><span>Result</span><span>{score >= run.questions.length * 0.8 ? "● Pass" : "■ Below 80%"}</span></div>
        <div className="fm-card__body grid gap-4">
          <div><span className="fm-metric">{score}/{run.questions.length}</span><span className="fm-cap ml-3">{Math.round((score / run.questions.length) * 100)}%</span></div>
          <table className="fm-parts">
            <caption>Per topic</caption>
            <tbody>{byTopic.map(([t, r, n]) => <tr key={t}><td className="!normal-case">{topics[t] ?? t}</td><td style={{ textAlign: "right", paddingRight: 0 }}>{r}/{n}</td></tr>)}</tbody>
          </table>
          <div className="flex flex-wrap gap-3">
            {wrong.length > 0 && <button type="button" className="fm-btn fm-btn--primary" onClick={() => start(wrong)}>Retry wrong only ({wrong.length})</button>}
            <button type="button" className="fm-btn" onClick={() => start(questions)}>Retry all</button>
          </div>
        </div>
      </div>
    );
  }

  const q = run.questions[i];
  const opts = run.order[q.id].map((id) => q.options.find((o) => o.id === id)!);
  const multi = q.type === "multi";
  const isRight = same(selected, q.correct);

  const check = () => {
    setChecked(true);
    setAnswers((a) => [...a, { questionId: q.id, selected, correct: isRight, topicId: q.topicId }]);
  };
  const next = async () => {
    setChecked(false);
    setSelected([]);
    if (i + 1 < run.questions.length) { setI(i + 1); return; }
    // Only full runs count toward the best score; "retry wrong only" is practice.
    if (run.questions.length === questions.length) {
      await getAdapter().put("quizAttempts", { id: crypto.randomUUID(), sectionId: section.id, score: answers.filter((a) => a.correct).length, total: answers.length, answers, startedAt: run.startedAt, finishedAt: new Date().toISOString() });
      await checkCompletion(section);
    }
  };

  return (
    <div className="fm-card">
      <div className="fm-card__head">
        <span>Question {i + 1} / {run.questions.length}{q.type === "scenario" && " · Scenario"}{multi && " · Select all that apply"}</span>
        <span>{"■".repeat(q.difficulty)}{"□".repeat(3 - q.difficulty)}</span>
      </div>
      <div className="h-1 bg-surface-sunk" role="progressbar" aria-valuemin={0} aria-valuemax={run.questions.length} aria-valuenow={i + (checked ? 1 : 0)} aria-label="Quiz progress">
        <div className="h-full bg-cobalt" style={{ width: `${((i + (checked ? 1 : 0)) / run.questions.length) * 100}%` }} />
      </div>
      <div className="fm-card__body grid gap-4">
        {q.scenario && <p className="m-0 border-l-2 border-ink pl-3 text-ink-muted"><Md>{q.scenario}</Md></p>}
        <p className="m-0 text-[18px] font-semibold" id={`q-${q.id}`}><Md>{q.prompt}</Md></p>
        <div role={multi ? "group" : "radiogroup"} aria-labelledby={`q-${q.id}`} className="grid gap-2.5">
          {opts.map((o, k) => {
            const sel = selected.includes(o.id);
            const correct = q.correct.includes(o.id);
            const cls = !checked ? (sel ? "is-selected" : "") : correct ? "is-correct" : sel ? "is-wrong" : "is-dim";
            return (
              <button
                key={o.id}
                type="button"
                role={multi ? "checkbox" : "radio"}
                aria-checked={sel}
                aria-disabled={checked}
                className={`fm-opt text-left ${cls}`}
                onClick={() => !checked && setSelected(multi ? (sel ? selected.filter((x) => x !== o.id) : [...selected, o.id]) : [o.id])}
              >
                <span className="key">{KEYS[k]}</span>
                <span><Md>{o.text}</Md></span>
                <span className="verdict">{checked ? (correct ? "● Correct" : sel ? "■ Incorrect" : "") : sel ? "Selected" : ""}</span>
              </button>
            );
          })}
        </div>
        {checked && (
          <div className="fm-box" role="status">
            <div className="fm-box__head">{isRight ? "● Correct" : "■ Not quite"} · Why</div>
            <div className="fm-box__body"><Md>{q.explanation}</Md></div>
          </div>
        )}
        <div>
          {!checked ? (
            <button type="button" className="fm-btn fm-btn--primary" disabled={!selected.length} onClick={check}>Check answer</button>
          ) : (
            <button type="button" className="fm-btn fm-btn--primary" onClick={next}>{i + 1 < run.questions.length ? "Next" : "See result"} <span className="arr">→</span></button>
          )}
        </div>
      </div>
    </div>
  );
}
