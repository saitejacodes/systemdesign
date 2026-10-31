"use client";
import Link from "next/link";
import { useState } from "react";
import { DepthStamp } from "@/components/brand";
import { PHASES } from "@/lib/curriculum";
import { useChallengeResults } from "@/lib/db/hooks";
import { REGISTRY } from "@/lib/simulators/registry";

export function SimGrid() {
  const [phase, setPhase] = useState(0);
  const results = useChallengeResults() ?? [];
  const sims = REGISTRY.filter((s) => !phase || s.phase === phase);
  return (
    <div className="grid gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by phase">
        <button type="button" aria-pressed={phase === 0} className={`fm-btn fm-btn--tool ${phase === 0 ? "is-on" : ""}`} onClick={() => setPhase(0)}>All</button>
        {PHASES.filter((p) => p.simulators > 0).map((p) => (
          <button key={p.n} type="button" aria-pressed={phase === p.n} className={`fm-btn fm-btn--tool ${phase === p.n ? "is-on" : ""}`} onClick={() => setPhase(p.n)}>{p.n} · {p.short}</button>
        ))}
      </div>
      {sims.length === 0 ? <p className="text-ink-muted">This phase&apos;s simulators arrive with its lessons. Try another phase.</p> : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sims.map((s) => {
            const passed = results.filter((r) => r.simulatorId === s.id && r.passed).length;
            return (
              <li key={s.id}>
                <Link href={`/simulators/${s.id}`} className="fm-card block h-full no-underline" style={{ color: "var(--ink)" }}>
                  <div className="fm-card__head"><span>{s.code} · Phase {s.phase}</span><span>{passed}/{s.challengeIds.length} challenges</span></div>
                  <div className="fm-card__body grid gap-3">
                    <h2 className="text-[20px] font-semibold">{s.title}</h2>
                    <p className="text-[15px] text-ink-muted">{s.summary}</p>
                    <div className="flex items-center justify-between"><DepthStamp depth={s.depth} /><span className="fm-cap" aria-hidden>Open →</span></div>
                  </div>
                  <div className="h-1.5 bg-line"><div className="h-full" style={{ width: `${(passed / s.challengeIds.length) * 100}%`, background: `var(--phase-${s.phase})` }} /></div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
