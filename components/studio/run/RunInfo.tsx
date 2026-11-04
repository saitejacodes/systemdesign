"use client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// Plain-words version of the routing rules in lib/studio/sim/types.ts. Keep the two in step.
const MODELS = [
  "Traffic starts at every client, split by each client's Users, and each request type flows along sync and async edges toward the components it targets. It only follows edges that can still reach a target.",
  "Load balancers and API gateways split across live targets: evenly for round-robin and consistent-hash, by capacity for weighted and least-connections. Killing a target moves its share to the others.",
  "Caches and CDNs answer their hit rate of reads and pass misses (and every write) downstream. A service that talks to a cache and a database reads from the cache first and only sends misses to the database.",
  "SQL databases send writes to the primary and spread reads over the primary, its read replicas and any database linked by a replication edge.",
  "Each component's utilization ρ is its incoming QPS over its capacity (instances × capacity per instance). Latency grows as base ÷ (1 − ρ). Above ρ 0.95 the excess is dropped and counted as errors; rate limits drop their excess too.",
  "An async edge hands the message to a queue and returns at once. Workers drain the queue at instances × 1000 ÷ processing time; the depth grows whenever more arrives than they can process.",
  "Faults: a killed component takes no traffic; a slowed one has 5× the latency and a fifth of the capacity. Cache flush starts every cache cold and ramps the hit rate back over 60 s.",
  "Availability multiplies along each path and combines instances and split targets in parallel, from the per-instance availability you set. A component shared by several paths (one database behind many servers) is counted once: the estimate conditions on it being up or down. Cost is cost per instance × instances.",
];
const SIMPLIFIES = [
  "It is a steady-state flow model, not a request-by-request simulation: it recomputes the flows every 0.5 s of sim time and moves the numbers toward them smoothly (time constant 1.5 s), so changes take a few seconds to settle.",
  "p99 is approximated as mean latency × (1 + 3.6 ρ*), where ρ* is the busiest hop on the path: equal to the mean on an idle system, about 4.6× near saturation (the M/M/1 tail). Real tails also come from GC pauses, slow disks and noisy neighbours.",
  "No retries, timeouts or circuit breakers: a dropped request is simply an error, so it never amplifies load the way retry storms do.",
  "No network latency between components and no bandwidth limits, unless you model them as a component's latency.",
  "Every request of a type costs the same; there are no hot keys, so sharded stores and consistent hashing are perfectly balanced.",
  "Caches keep a fixed hit rate (except after a flush); size, eviction and invalidation are not modelled. Replication is instant: no replica lag or failover delay.",
  "Availability treats failures as independent. Correlated failures (a region outage, a bad deploy everywhere) are what the Lose an AZ scenario is for.",
];

export function RunInfo({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle className="fm-h4">Run mode</DialogTitle>
        <DialogDescription>A traffic model of your design: rough enough to be fast, honest about what it leaves out.</DialogDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><h3 className="fm-cap mb-2">What this models</h3><ul className="grid list-disc gap-1.5 pl-5 text-[15px]">{MODELS.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div><h3 className="fm-cap mb-2">What it simplifies</h3><ul className="grid list-disc gap-1.5 pl-5 text-[15px]">{SIMPLIFIES.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
