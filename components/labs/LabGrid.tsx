"use client";
import Link from "next/link";
import { useChallengeResults } from "@/lib/db/hooks";

export interface LabCard { id: string; title: string; summary: string; phase: number; phaseShort: string; lesson: string }

/** All labs in the simulator-card style, with passed status from challengeResults. */
export function LabGrid({ labs }: { labs: LabCard[] }) {
  const results = useChallengeResults() ?? [];
  const passed = new Set(results.filter((r) => r.simulatorId === "code-labs" && r.passed).map((r) => r.challengeId));
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {labs.map((l) => {
        const ok = passed.has(l.id);
        return (
          <li key={l.id}>
            <Link href={`/simulators/code-labs/${l.id}`} className="fm-card block h-full no-underline" style={{ color: "var(--ink)" }}>
              <div className="fm-card__head"><span>Phase {l.phase}</span><span>{ok ? "✓ Passed" : "Not passed"}</span></div>
              <div className="fm-card__body grid gap-3">
                <h2 className="text-[20px] font-semibold">{l.title}</h2>
                <p className="text-[15px] text-ink-muted">{l.summary}</p>
                <div className="flex items-center justify-between gap-3"><span className="fm-cap">{l.phaseShort} · {l.lesson}</span><span className="fm-cap" aria-hidden>Open →</span></div>
              </div>
              <div className="h-1.5 bg-line"><div className="h-full" style={{ width: ok ? "100%" : "0%", background: `var(--phase-${l.phase})` }} /></div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
