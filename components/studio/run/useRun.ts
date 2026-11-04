"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CATALOG } from "@/lib/studio/catalog";
import { initSim, stepSim } from "@/lib/studio/sim";
import type { Faults, SimState, TrafficProfile } from "@/lib/studio/sim/types";
import type { StudioGraph } from "@/lib/studio/types";
import { STATUS_TEXT } from "./config";

export const STEP_S = 0.5;
export interface RunLogEntry { id: number; t: number; level: "info" | "warn" | "error"; text: string }
export const NO_FAULTS: Faults = { killed: [], slowed: [], trafficMultiplier: 1, peak: false };
const LOG_LIMIT = 200;

export const nodeName = (graph: StudioGraph, id: string) => {
  const n = graph.nodes.find((x) => x.id === id);
  return n ? n.label || (n.kind === "note" ? "Note" : CATALOG[n.kind].title) : id;
};

/**
 * Drives the Run-mode model: a requestAnimationFrame loop advances sim time by real time × speed and calls stepSim once
 * per 0.5 s of sim time, so React re-renders 2–8 times a second, never per frame (edge dashes are CSS animations).
 */
export function useRun(graph: StudioGraph, profile: TrafficProfile, active: boolean) {
  const [state, setStateRaw] = useState<SimState | null>(null);
  const [faults, setFaultsRaw] = useState<Faults>(NO_FAULTS);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedRaw] = useState(1);
  const [log, setLog] = useState<RunLogEntry[]>([]);

  const stateRef = useRef<SimState | null>(null);
  const faultsRef = useRef<Faults>(NO_FAULTS);
  const speedRef = useRef(1);
  const input = useRef({ graph, profile });
  useEffect(() => { input.current = { graph, profile }; }, [graph, profile]);
  const logId = useRef(0);

  const addLog = useCallback((items: Omit<RunLogEntry, "id">[]) => {
    if (!items.length) return;
    setLog((l) => [...l, ...items.map((x) => ({ ...x, id: ++logId.current }))].slice(-LOG_LIMIT));
  }, []);

  const setState = useCallback((s: SimState | null) => { stateRef.current = s; setStateRaw(s); }, []);

  const advance = useCallback((n: number) => {
    const { graph: g, profile: p } = input.current;
    let s = stateRef.current ?? initSim(g, p);
    const events: Omit<RunLogEntry, "id">[] = [];
    for (let i = 0; i < n; i++) {
      const next = stepSim(g, p, s, faultsRef.current, STEP_S);
      for (const id of Object.keys(next.nodes)) {
        const a = s.nodes[id]?.status, b = next.nodes[id].status;
        if (a && a !== b) {
          const level = b === "ok" ? "info" : b === "hot" ? "warn" : "error";
          events.push({ t: next.t, level, text: `${nodeName(g, id)}: ${STATUS_TEXT[a].word} → ${STATUS_TEXT[b].glyph} ${STATUS_TEXT[b].word}` });
        }
      }
      s = next;
    }
    setState(s);
    addLog(events);
  }, [addLog, setState]);

  useEffect(() => {
    if (!active || !playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      acc += ((now - last) / 1000) * speedRef.current;
      last = now;
      const n = Math.min(8, Math.floor(acc / STEP_S)); // a backgrounded tab doesn't replay minutes of steps at once
      if (n > 0) { acc = Math.min(acc - n * STEP_S, STEP_S); advance(n); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, playing, advance]);

  const setFaults = useCallback((f: Faults, message?: string, level: RunLogEntry["level"] = "warn") => {
    faultsRef.current = f;
    setFaultsRaw(f);
    if (message) addLog([{ t: stateRef.current?.t ?? 0, level, text: message }]);
  }, [addLog]);

  const reset = useCallback(() => {
    const { graph: g, profile: p } = input.current;
    setPlaying(false);
    faultsRef.current = { ...NO_FAULTS, peak: faultsRef.current.peak };
    setFaultsRaw(faultsRef.current);
    setState(initSim(g, p));
    setLog([]);
  }, [setState]);

  const stop = useCallback(() => { setPlaying(false); setState(null); }, [setState]);
  const setSpeed = useCallback((s: number) => { speedRef.current = s; setSpeedRaw(s); }, []);

  return {
    state, faults, playing, speed, log,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    step: () => advance(1),
    reset, stop, setSpeed, setFaults,
  };
}
export type RunApi = ReturnType<typeof useRun>;
