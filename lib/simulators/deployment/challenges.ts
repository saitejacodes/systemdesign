import type { Challenge } from "@/lib/sim/engine";
import { N, USERS, type DeployConfig, type DeployState } from "./model";

const pct = (s: DeployState) => (s.affected / USERS) * 100;
const ended = (s: DeployState) => s.deploy?.end !== undefined;
const TIME_LIMIT = 25;
const EXTRA_LIMIT = 20;

export const challenges: Challenge<DeployConfig, DeployState>[] = [
  {
    id: "bad-under-1pct",
    title: "Ship a bad build to < 1% of users",
    description: `v2 is broken: 20% of its requests fail, and its readiness probe passes anyway. Deploy it and get back to v1 with fewer than 1% of ${USERS.toLocaleString()} users seeing an error.`,
    setup: { mode: "release", build: "bad", badErrorPct: 20, rps: 200, startMs: 3000 },
    durationMs: 90_000,
    done: ended,
    winCondition(_h, s) {
      const v = Math.round(pct(s) * 100) / 100;
      if (!s.deploys) return { passed: false, value: 100, detail: "No deploy started. Press Deploy v2." };
      if (!ended(s)) return { passed: false, value: v, detail: `Still deploying or rolling back after 90 s; ${s.affected} users hit an error so far.` };
      if (s.deploy!.outcome === "promoted") return { passed: false, value: v, detail: `The bad build reached every pod: ${s.affected} users (${v}%) saw errors. Readiness probes only ask "is the process up?", not "is it correct?".` };
      return v < 1
        ? { passed: true, value: v, detail: `Rolled back with ${s.affected} users (${v}%) affected. A small first step limits the blast radius; automated analysis limits how long it lasts.` }
        : { passed: false, value: v, detail: `Rolled back, but ${s.affected} users (${v}%) saw errors. Expose less traffic to v2, or detect the problem sooner.` };
    },
    hint: "Blast radius = share of traffic on v2 × error rate × time until rollback. A canary starting at 1–10% with automated analysis keeps all three small.",
  },
  {
    id: "cheap-rollout",
    title: "Fast, cheap and error-free",
    description: `v2 is good. Roll it out to all ${N} pods within ${TIME_LIMIT} s, with at most ${EXTRA_LIMIT}% extra capacity (2 extra pods) at any moment, and zero failed requests. 200 req/s on pods that serve 25 req/s each.`,
    setup: { mode: "release", build: "good", rps: 200, startMs: 3000 },
    durationMs: 60_000,
    done: ended,
    winCondition(_h, s) {
      const d = s.deploy;
      const extra = (s.peakExtra / N) * 100;
      if (!d || d.end === undefined || d.outcome !== "promoted") return { passed: false, value: 999, detail: "v2 didn't finish rolling out. Press Deploy v2 and let it complete." };
      const time = Math.round((d.end - d.from) / 100) / 10;
      const why = [
        time > TIME_LIMIT && `took ${time} s (limit ${TIME_LIMIT} s)`,
        extra > EXTRA_LIMIT && `peaked at ${extra.toFixed(0)}% extra capacity (limit ${EXTRA_LIMIT}%)`,
        s.errors > 0 && `${s.errors} requests failed (too few pods for 200 req/s)`,
      ].filter(Boolean);
      return why.length
        ? { passed: false, value: time, detail: `The rollout ${why.join(", ")}.` }
        : { passed: true, value: time, detail: `Done in ${time} s with ${extra.toFixed(0)}% extra pods and no errors. maxSurge buys speed with spare capacity; maxUnavailable buys it with headroom you may not have.` };
    },
    hint: "Blue-green doubles the fleet. Each rolling batch waits one pod start (~3 s), so the batch size sets the time. 8 pods carry 200 req/s; 7 don't.",
  },
  {
    id: "zero-downtime-rename",
    title: "Rename a column with zero errors",
    description: "Migration mode: rename users.name to full_name while the app keeps serving 40 req/s. Order the six expand/contract steps and run them; finish with zero failed requests and zero wrong reads. Rolling deploys run old and new code side by side.",
    setup: { mode: "migration" },
    durationMs: 600_000,
    done: (s) => s.mig.cleanRuns > 0,
    winCondition(_h, s) {
      const m = s.mig;
      if (m.cleanRuns) return { passed: true, value: 0, detail: "Expand, migrate, contract: at every moment, every running version of the app found the columns it reads and writes, filled in." };
      if (!m.runs) return { passed: false, value: 999, detail: "No migration run finished. Order the steps, then press Run migration." };
      return { passed: false, value: m.failed + m.bad, detail: `Last run: ${m.failed} failed requests and ${m.bad} wrong reads. ${m.reasons[0] ?? ""}` };
    },
    hint: "Never let running code see a column it doesn't expect. Add before anyone writes it, write before you backfill, backfill before anyone reads it, and drop only after no pod touches it.",
  },
];
