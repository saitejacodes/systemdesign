"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getAdapter } from "@/lib/db/adapter";
import { Simulation, type ChallengeOutcome } from "@/lib/sim/engine";
import type { SimDefinition } from "@/lib/sim/definition";

export interface ChallengeRun { id: string; status: "running" | "done"; outcome?: ChallengeOutcome }

/** Drives a Simulation with requestAnimationFrame and exposes it to React. */
export function useSimulation(simId: string, def: SimDefinition) {
  const [sim] = useState(() => new Simulation<unknown, unknown>(def.model, def.defaultConfig, 1));

  // One store version per rendered frame with progress; components read sim directly.
  const listeners = useRef(new Set<() => void>());
  const version = useRef(0);
  const notify = useCallback(() => { version.current++; listeners.current.forEach((l) => l()); }, []);
  const frame = useSyncExternalStore(
    (l) => { listeners.current.add(l); return () => listeners.current.delete(l); },
    () => version.current,
    () => 0,
  );

  const [run, setRunState] = useState<ChallengeRun | null>(null);
  // The frame loop reads the run from a ref so it never restarts.
  const runRef = useRef<ChallengeRun | null>(null);
  const setRun = useCallback((r: ChallengeRun | null) => { runRef.current = r; setRunState(r); }, []);

  const finish = useCallback(async () => {
    const r = runRef.current;
    const c = def.challenges.find((x) => x.id === r?.id);
    if (!r || !c) return;
    sim.pause();
    const outcome = c.winCondition(sim.metrics.history(), sim.state);
    setRun({ id: c.id, status: "done", outcome });
    const db = getAdapter();
    const prev = await db.get("challengeResults", [simId, c.id]);
    const lower = (c.better ?? "lower") === "lower";
    const best = !prev?.passed ? outcome.value : outcome.passed ? (lower ? Math.min(prev.bestValue, outcome.value) : Math.max(prev.bestValue, outcome.value)) : prev.bestValue;
    await db.put("challengeResults", { simulatorId: simId, challengeId: c.id, passed: !!prev?.passed || outcome.passed, bestValue: best, attempts: (prev?.attempts ?? 0) + 1, updatedAt: new Date().toISOString() });
  }, [def, sim, simId, setRun]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const n = sim.clock.advance(now - last);
      last = now;
      if (n > 0) {
        const r = runRef.current;
        const end = r?.status === "running" ? def.challenges.find((c) => c.id === r.id)?.durationMs : undefined;
        for (let i = 0; i < n; i++) {
          sim.step();
          if (end !== undefined && sim.clock.t >= end) { finish(); break; }
        }
        notify();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, def, notify, finish]);

  const api = {
    play: () => { sim.play(); notify(); },
    pause: () => { sim.pause(); notify(); },
    step: () => { sim.step(); notify(); },
    reset: (seed = sim.seed) => { setRun(null); sim.reset(sim.config, seed); notify(); },
    setSpeed: (s: number) => { sim.clock.setSpeed(s); notify(); },
    setConfig: (patch: Record<string, unknown>) => { sim.setConfig(patch); notify(); },
    toggleFault: (id: string) => { sim.toggleFault(id); notify(); },
    act: (name: string, payload?: unknown) => { sim.act(name, payload); notify(); },
    startChallenge: (id: string) => {
      const c = def.challenges.find((x) => x.id === id);
      if (!c) return;
      sim.reset({ ...(sim.config as object), ...c.setup }, sim.seed);
      sim.log.add(0, "info", `Challenge started: ${c.title}`);
      sim.play();
      setRun({ id, status: "running" });
      notify();
    },
    stopChallenge: () => { setRun(null); notify(); },
  };
  return { sim, frame, run, ...api };
}
