"use client";
import { useEffect, useState } from "react";
import type { SimDefinition } from "@/lib/sim/definition";
import { getSim } from "@/lib/simulators/registry";
import { SimulatorShell } from "./SimulatorShell";

/** Loads a registered simulator's code-split module and renders it in the shell. */
export function SimulatorLoader({ id, compact = false }: { id: string; compact?: boolean }) {
  const entry = getSim(id);
  const [def, setDef] = useState<SimDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    entry?.load().then((m) => live && setDef(m.definition), (e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [entry]);
  if (!entry) return null;
  if (error) return <p role="alert" className="fm-help is-error">Couldn&apos;t load the simulator: {error}</p>;
  if (!def) return <div className="fm-grid grid h-64 place-items-center border border-ink" style={{ borderRadius: 2 }}><span className="fm-cap">Loading {entry.title}…</span></div>;
  return <SimulatorShell entry={entry} def={def} compact={compact} />;
}
