import { createHash } from "node:crypto";
import { Admission } from "./admission";
import { config } from "./config";
import type { ChatMessage } from "./openai";

/**
 * Picks which model replica serves a request. Three policies, switchable with ROUTER_POLICY:
 *
 *   round_robin        next replica in turn. Even spread, ignores load and ignores what each replica has cached.
 *   least_outstanding  replica with the fewest running + queued requests (from THIS gateway's point of view).
 *   prefix_affinity    rendezvous hash of the system prompt, so every request sharing a system prompt goes to the
 *                      same replica, whose slot KV cache already holds that prefix (llama.cpp cache_prompt).
 *                      Bounded: if that replica is busier than AFFINITY_MAX_OUTSTANDING, fall back to least loaded.
 *
 * The hash is deterministic (no in-memory index), so two gateways agree on the owner and a restart loses nothing.
 */
export type Policy = "round_robin" | "least_outstanding" | "prefix_affinity";

export interface Replica {
  name: string;
  url: string;
  admission: Admission;
  routed: number;
  prefillTokens: number;
  cachedTokens: number;
}

export const replicas: Replica[] = config.llmReplicas.map((url) => {
  const name = new URL(url).hostname;
  return {
    name,
    url,
    admission: new Admission(name, config.slotsPerReplica, config.maxQueue, config.maxQueueWaitMs),
    routed: 0,
    prefillTokens: 0,
    cachedTokens: 0,
  };
});

const policy = config.routerPolicy as Policy;
if (!["round_robin", "least_outstanding", "prefix_affinity"].includes(policy)) throw new Error(`unknown ROUTER_POLICY "${policy}"`);
export const routerPolicy = policy;

let rr = 0;

/** The part of the prompt that repeats across requests: the system prompt, or the first message if there is none. */
export function prefixKey(messages: ChatMessage[]): string {
  const sys = messages.find((m) => m.role === "system");
  return (sys ?? messages[0]).content;
}

/** Rendezvous (highest-random-weight) hashing: each replica scores hash(key, replica); the highest wins. Removing
 * a replica only moves the keys it owned, unlike hash(key) % N which reshuffles almost everything. */
function hrwOrder(key: string, pool: Replica[]): Replica[] {
  const score = (r: Replica) => createHash("sha256").update(`${r.name}\u0000${key}`).digest().readUInt32BE(0);
  return [...pool].sort((a, b) => score(b) - score(a));
}

const byLoad = (pool: Replica[]) => [...pool].sort((a, b) => a.admission.outstanding - b.admission.outstanding);

/** Replicas in the order to try them: the first is the policy's choice, the rest are spill-over candidates. */
export function candidates(messages: ChatMessage[]): Replica[] {
  const pool = replicas;
  if (policy === "round_robin") {
    const start = rr++ % pool.length;
    return [...pool.slice(start), ...pool.slice(0, start)];
  }
  if (policy === "least_outstanding") return byLoad(pool);
  const ordered = hrwOrder(prefixKey(messages), pool);
  if (ordered[0].admission.outstanding < config.affinityMaxOutstanding) return ordered;
  return byLoad(pool); // the owner is hot: trade the cache hit for not queueing behind it
}

export function recordTimings(r: Replica, timings: Record<string, number> | undefined): void {
  r.routed++;
  if (!timings) return;
  r.prefillTokens += timings.prompt_n ?? 0;
  r.cachedTokens += timings.cache_n ?? 0;
}

export function routerStats() {
  return {
    policy,
    replicas: replicas.map((r) => ({
      name: r.name,
      routed: r.routed,
      inflight: r.admission.inflight,
      queued: r.admission.queued,
      prefillTokens: r.prefillTokens,
      cachedTokens: r.cachedTokens,
      // Share of prompt tokens served from the replica's KV cache instead of being prefilled again.
      prefixHitRatio: r.prefillTokens + r.cachedTokens > 0 ? +(r.cachedTokens / (r.prefillTokens + r.cachedTokens)).toFixed(3) : null,
    })),
  };
}
