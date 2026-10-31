import type { SimRegistry } from "@/lib/learning/progress";
import { REGISTRY } from "./registry";

/** Challenge ids of every registered simulator, used by progress weighting. */
export const SIM_CHALLENGES: SimRegistry = Object.fromEntries(REGISTRY.map((s) => [s.id, s.challengeIds]));
