import { createHash } from "node:crypto";
import { Admission } from "./admission";
import { Breaker } from "./breaker";
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
 *
 * Stage 9 adds: a circuit breaker per replica (open replicas are skipped), a canary replica that receives
 * CANARY_PERCENT of interactive traffic with a different model version, and a fallback replica running a smaller
 * model, used only when every primary replica is open or full.
 */
export type Policy = "round_robin" | "least_outstanding" | "prefix_affinity";

export interface Replica {
  name: string;
  url: string;
  /** Model version served here; part of cache keys, so answers from one version are never served as another's. */
  version: string;
  model: string;
  breaker: Breaker;
  admission: Admission;
  routed: number;
  prefillTokens: number;
  cachedTokens: number;
}

function makeReplica(url: string, model: string, version: string): Replica {
  const name = new URL(url).hostname;
  return {
    name,
    url,
    model,
    version,
    breaker: new Breaker(name, config.breakerFailureThreshold, config.breakerCooldownMs),
    admission: new Admission(name, config.slotsPerReplica, config.maxQueue, config.maxQueueWaitMs),
    routed: 0,
    prefillTokens: 0,
    cachedTokens: 0,
  };
}

export const replicas: Replica[] = config.llmReplicas.map((url) => makeReplica(url, config.modelName, config.modelVersion));
export const canary: Replica | null = config.canaryUrl ? makeReplica(config.canaryUrl, config.modelName, config.canaryVersion) : null;
export const fallback: Replica | null = config.fallbackUrl ? makeReplica(config.fallbackUrl, config.fallbackModel, config.fallbackModel) : null;
export const allReplicas = [...replicas, ...(canary ? [canary] : []), ...(fallback ? [fallback] : [])];

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
function primaryOrder(messages: ChatMessage[], pool: Replica[]): Replica[] {
  if (pool.length === 0) return [];
  if (policy === "round_robin") {
    const start = rr++ % pool.length;
    return [...pool.slice(start), ...pool.slice(0, start)];
  }
  if (policy === "least_outstanding") return byLoad(pool);
  const ordered = hrwOrder(prefixKey(messages), pool);
  if (ordered[0].admission.outstanding < config.affinityMaxOutstanding) return ordered;
  return byLoad(pool); // the owner is hot: trade the cache hit for not queueing behind it
}

/**
 * Replicas in the order to try them. Breakers are consulted here: an open replica is not offered at all.
 * The fallback, if allowed, is always last: a smaller model's answer beats a 503, but only when nothing else can.
 */
export function candidates(messages: ChatMessage[], opts: { allowFallback: boolean; allowCanary: boolean }): Replica[] {
  const healthy = replicas.filter((r) => r.breaker.allow());
  let order = primaryOrder(messages, healthy);
  if (opts.allowCanary && canary && Math.random() * 100 < config.canaryPercent && canary.breaker.allow()) order = [canary, ...order];
  if (opts.allowFallback && fallback && fallback.breaker.allow()) order = [...order, fallback];
  return order;
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
    replicas: allReplicas.map((r) => ({
      name: r.name,
      version: r.version,
      breaker: r.breaker.state,
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
