"use client";
import { useEffect, useState } from "react";
import type { SimDefinition } from "@/lib/sim/definition";
import { getSim } from "@/lib/simulators/registry";
import type { SimulatorShell as Shell } from "./SimulatorShell";

/** Loads a registered simulator's code-split module and the shell (with its chart library) together, so lesson pages stay light until a simulator mounts. */
export function SimulatorLoader({ id, compact = false }: { id: string; compact?: boolean }) {
  const entry = getSim(id);
  const [loaded, setLoaded] = useState<{ def: SimDefinition; Shell: typeof Shell } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (entry) Promise.all([entry.load(), import("./SimulatorShell")]).then(([m, s]) => live && setLoaded({ def: m.definition, Shell: s.SimulatorShell }), (e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [entry]);
  if (!entry) return null;
  if (error) return <p role="alert" className="fm-help is-error">Couldn&apos;t load the simulator: {error}</p>;
  if (!loaded) return <div className="fm-grid grid h-64 place-items-center border border-ink" style={{ borderRadius: 2 }}><span className="fm-cap">Loading {entry.title}…</span></div>;
  return <loaded.Shell entry={entry} def={loaded.def} compact={compact} />;
}
