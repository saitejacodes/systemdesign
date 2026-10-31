import type { SimDefinition } from "@/lib/sim/definition";
import type { Depth } from "@/lib/content/schemas";

export interface SimEntry {
  id: string;
  /** Spec code shown in the header, e.g. "S-03". */
  code: string;
  title: string;
  phase: number;
  depth: Depth;
  sectionIds: string[];
  summary: string;
  models: string[];
  simplifies: string[];
  /** Must match the ids in the module's challenges (checked by registry.test.ts). */
  challengeIds: string[];
  load: () => Promise<{ definition: SimDefinition }>;
}

// Each simulator prompt adds one entry. load() is a dynamic import, so each one is its own chunk.
export const REGISTRY: SimEntry[] = [
  {
    id: "single-server-queue",
    code: "S-00",
    title: "Single-server queue",
    phase: 1,
    depth: "deep",
    sectionIds: ["p1-latency-throughput"],
    summary: "One server, random arrivals. See why latency explodes as utilization nears 100%.",
    models: ["Poisson arrivals at rate λ and exponential service at rate μ (an M/M/1 queue)", "First-come, first-served with an unbounded queue", "Latency = time waiting + time in service"],
    simplifies: ["One server, one queue, no timeouts or retries", "No request is ever dropped", "Service time doesn't depend on the request"],
    challengeIds: ["p99-under-200"],
    load: () => import("./single-server-queue"),
  },
];

export const getSim = (id: string) => REGISTRY.find((s) => s.id === id);
