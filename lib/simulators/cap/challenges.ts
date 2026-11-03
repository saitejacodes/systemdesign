import type { Challenge } from "@/lib/sim/engine";
import { cutCount, type CapConfig, type CapState } from "./model";

const base = { nodes: 3, delay: 40, rate: 5, readPct: 50 } as const;
const mean = (x: { n: number; sum: number }) => (x.n ? x.sum / x.n : 0);
const CALM_N = 30;

export const challenges: Challenge<CapConfig, CapState>[] = [
  {
    id: "ap-stale-read",
    title: "Catch a stale read",
    description: "AP mode, 3 replicas. Make a client read a cart that is missing a write another node already acknowledged, because the write is stuck behind a cut link. Click a link (or use the buttons under the canvas) to cut it.",
    setup: { ...base, mode: "ap" },
    durationMs: 60_000,
    better: "higher",
    done: (s) => s.stalePart >= 1,
    winCondition: (_h, s) => (s.stalePart >= 1
      ? { passed: true, value: s.stalePart, detail: `${s.stalePart} stale read${s.stalePart > 1 ? "s" : ""}: the node answered from its own copy because it could not hear about the other side's write. That is the A in CAP, paid for with C.` }
      : { passed: false, value: 0, detail: s.stale ? `${s.stale} reads were stale only because replication was still in flight (the PACELC else case). Cut a link so a write can't reach a reader at all.` : "No read missed an acknowledged write. Cut a link and let both sides keep working." }),
    hint: "Isolate one node: its client keeps reading its own copy while the other two keep writing.",
  },
  {
    id: "cp-unavailable",
    title: "Make the minority refuse",
    description: "CP mode, 3 replicas. Partition the cluster so one side's clients get errors while the other side keeps committing writes: at least 5 rejected requests and 5 writes committed during the partition.",
    setup: { ...base, mode: "cp" },
    durationMs: 60_000,
    better: "higher",
    done: (s) => s.rejected >= 5 && s.cutCommits >= 5,
    winCondition(_h, s) {
      if (s.rejected >= 5 && s.cutCommits >= 5) return { passed: true, value: s.rejected, detail: `${s.rejected} requests refused on the minority side while the majority committed ${s.cutCommits} writes. No stale reads (${s.stale}): consistency was kept by giving up availability.` };
      if (s.rejected >= 5) return { passed: false, value: s.rejected, detail: `${s.rejected} requests refused, but only ${s.cutCommits} writes committed during the partition. Leave a majority connected: 2 of 3 can still agree.` };
      return { passed: false, value: s.rejected, detail: `${s.rejected} requests refused. A node needs a majority (2 of 3) for every read and write; cut it off from both peers.` };
    },
    hint: "Isolating N3 leaves N1 and N2 as a majority. Cutting every link leaves nobody with a majority.",
  },
  {
    id: "heal-siblings",
    title: "Heal without losing a write",
    description: "AP mode, 3 replicas. Partition the cluster, let both sides write to the same carts, then heal every link. The replicas must detect the conflicts, resolve them with a later write, and lose zero acknowledged writes.",
    setup: { ...base, mode: "ap" },
    durationMs: 60_000,
    better: "lower",
    done: (s) => s.conflicts > 0 && s.resolved > 0 && cutCount(s) === 0 && s.lost === 0,
    winCondition(_h, s) {
      if (s.lost) return { passed: false, value: s.lost, detail: `${s.lost} acknowledged write${s.lost > 1 ? "s were" : " was"} silently dropped: last-write-wins kept one version per cart and threw the concurrent one away.` };
      if (!s.conflicts) return { passed: false, value: 0, detail: "No conflicts yet. Both sides must write the same cart while partitioned, then heal." };
      if (cutCount(s)) return { passed: false, value: 0, detail: `${s.conflicts} conflicts so far, but ${cutCount(s)} link${cutCount(s) > 1 ? "s are" : " is"} still cut. Heal the partition.` };
      return s.resolved
        ? { passed: true, value: 0, detail: `${s.conflicts} conflicts detected by version vectors, kept as siblings, then merged by the next write (${s.resolved} merges). Zero writes lost: the Dynamo shopping-cart design.` }
        : { passed: false, value: 0, detail: `${s.conflicts} conflicts kept as siblings, waiting for a client to write the merged cart back.` };
    },
    hint: "Last write wins keeps one version and discards the other. Switch conflict resolution to keep siblings before you heal.",
  },
  {
    id: "else-latency",
    title: "Price the ELSE branch",
    description: `No partition at all. Measure write latency with every link up in both modes: at least ${CALM_N} writes in CP and ${CALM_N} in AP, and never cut a link. PACELC's else: even when nothing is broken, consistency costs latency.`,
    setup: { ...base },
    durationMs: 60_000,
    better: "higher",
    done: (s) => !s.everCut && s.calm.cp.n >= CALM_N && s.calm.ap.n >= CALM_N,
    winCondition(_h, s) {
      const cp = mean(s.calm.cp), ap = mean(s.calm.ap);
      if (s.everCut) return { passed: false, value: 0, detail: "A link was cut. This one is about the price of consistency when nothing is broken." };
      if (s.calm.cp.n < CALM_N || s.calm.ap.n < CALM_N) return { passed: false, value: 0, detail: `${s.calm.cp.n} CP writes and ${s.calm.ap.n} AP writes measured. Switch the mode so both reach ${CALM_N}.` };
      return { passed: true, value: Math.round(cp - ap), detail: `CP writes took ${Math.round(cp)} ms (a majority round trip), AP writes ${ap.toFixed(1)} ms. AP also served ${s.calmStale} stale reads with nothing broken: that is EL vs EC.` };
    },
    hint: "Run a few seconds in CP, then switch the mode control to AP.",
  },
];
