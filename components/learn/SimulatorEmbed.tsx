"use client";
import { SimulatorLoader } from "@/components/sim/SimulatorLoader";
import { getSim } from "@/lib/simulators/registry";

/** Inline simulator in a lesson; falls back to the static card until the simulator is registered. */
export function SimulatorEmbed({ id, fallback }: { id: string; fallback: React.ReactNode }) {
  if (!getSim(id)) return <>{fallback}</>;
  return <div data-sim-embed className="my-10 border-y border-ink py-6"><SimulatorLoader id={id} compact /></div>;
}
