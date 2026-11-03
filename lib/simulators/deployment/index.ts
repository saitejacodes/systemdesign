import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { CANARY_PRESETS, STRATEGIES, deployModel, type DeployConfig, type DeployState } from "./model";
import { DeployView } from "./view";

const errTone = (v: number) => (v >= 5 ? "over" : v > 0 ? "hot" : "ok");
const usersTone = (v: number) => (v >= 1 ? "over" : v > 0 ? "hot" : "ok");
const quiet = <T extends string>(x: T) => (x === "ok" ? undefined : x);

export const definition: SimDefinition<DeployConfig, DeployState> = {
  model: deployModel,
  defaultConfig: { mode: "release", strategy: "rolling", build: "mystery", rps: 200, maxSurge: 3, maxUnavailable: 2, canarySteps: "10,25,50,100", stepMs: 5000, analysis: true, analysisMs: 5000, errorThreshold: 5, badErrorPct: 20, startMs: 3000 },
  controls: [
    { key: "mode", label: "Mode", type: "select", options: [{ value: "release", label: "Release v2 to 10 pods" }, { value: "migration", label: "Database migration (rename a column)" }] },
    { key: "strategy", label: "Strategy", type: "select", options: STRATEGIES, help: "Read when you press Deploy." },
    { key: "build", label: "v2 build", type: "select", options: [{ value: "mystery", label: "Unknown (seeded: good or bad)" }, { value: "good", label: "Good" }, { value: "bad", label: "Bad (returns errors)" }], help: "A bad build still passes its readiness probe." },
    { key: "maxSurge", label: "Rolling: maxSurge", type: "number", min: 0, max: 10, step: 1, unit: " pods", help: "Extra pods allowed above 10. Kubernetes' default 25% rounds up to 3." },
    { key: "maxUnavailable", label: "Rolling: maxUnavailable", type: "number", min: 0, max: 10, step: 1, unit: " pods", help: "Pods allowed below 10 ready. The default 25% rounds down to 2. Both 0 is invalid; surge 1 is used." },
    { key: "canarySteps", label: "Canary: traffic steps", type: "select", options: CANARY_PRESETS },
    { key: "stepMs", label: "Canary pause / blue-green bake", type: "number", min: 1000, max: 30000, step: 1000, unit: " ms" },
    { key: "analysis", label: "Automated analysis + rollback", type: "toggle", help: "Canary and blue-green only. A Kubernetes rolling update checks readiness, not error rates." },
    { key: "analysisMs", label: "Analysis interval", type: "number", min: 2000, max: 20000, step: 1000, unit: " ms" },
    { key: "errorThreshold", label: "Fail if v2 error rate >", type: "number", min: 1, max: 50, step: 1, unit: "%" },
    { key: "badErrorPct", label: "Bad build error rate", type: "number", min: 2, max: 100, step: 1, unit: "%" },
    { key: "rps", label: "Traffic", type: "number", min: 50, max: 250, step: 10, unit: " req/s", help: "Each pod serves 25 req/s; 10 pods = 250." },
    { key: "startMs", label: "Pod start time", type: "number", min: 1000, max: 10000, step: 500, unit: " ms", help: "Image pull + boot + readiness probe. The clock is compressed: think minutes." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "Ten pods, live traffic", body: "A router spreads 200 req/s over ten v1 pods. Each dot is a request; red ones failed. The lower lane is where v2 pods appear." },
    { target: "controls", title: "Pick a strategy", body: "Rolling replaces pods in batches (maxSurge / maxUnavailable). Blue-green starts a full second fleet and flips the router. Canary sends a small % of traffic to v2 and grows it step by step." },
    { target: "canvas", title: "Is v2 any good?", body: "You don't know until it takes traffic: a bad build passes its readiness probe and fails real requests. Press Deploy v2 and watch the v2 lane." },
    { target: "metrics", title: "What it cost", body: "Users affected, deployment time, the peak extra capacity you paid for and how long rollback took. Every strategy trades these four." },
    { target: "controls", title: "Database migrations", body: "Switch Mode to Database migration: order the expand/contract steps for a column rename. Old and new code run side by side during each deploy." },
    { target: "challenges", title: "Prove it", body: "Contain a bad build to under 1% of users, roll out cheaply with zero errors, and rename a column with zero downtime." },
  ],
  View: DeployView,
  cards: [
    { key: "affectedPct", label: "Users affected", unit: "%", digits: 2, tone: usersTone },
    { key: "errPct", label: "Error rate (1 s)", unit: "%", digits: 1, tone: errTone },
    { key: "deployS", label: "Deployment time", unit: "s", digits: 1 },
    { key: "extraPct", label: "Peak extra capacity", unit: "%", digits: 0, tone: (v) => (v >= 100 ? "over" : v > 20 ? "hot" : "ok") },
    { key: "rollbackS", label: "Rollback time", unit: "s", digits: 1 },
    { key: "v2Pct", label: "Traffic on v2", unit: "%", digits: 0 },
    { key: "migFailed", label: "Migration: failed requests", digits: 0, tone: (v) => (v > 0 ? "over" : undefined) },
    { key: "migBad", label: "Migration: wrong reads", digits: 0, tone: (v) => (v > 0 ? "over" : undefined) },
  ],
  charts: [
    { title: "Error rate", unit: "%", keys: [{ key: "errPct", label: "Errors", color: "var(--status-over)" }] },
    { title: "Traffic on v2", unit: "%", keys: [{ key: "v2Pct", label: "v2 share", color: "var(--phase-5)" }] },
    { title: "Ready pods", keys: [{ key: "v1Ready", label: "v1", color: "var(--cobalt)" }, { key: "v2Ready", label: "v2", color: "var(--phase-5)" }] },
  ],
  hud: (m) => [
    { k: "USERS HIT", v: `${(m.affectedPct ?? 0).toFixed(2)}%`, tone: quiet(usersTone(m.affectedPct ?? 0)) },
    { k: "ERR", v: `${(m.errPct ?? 0).toFixed(1)}%`, tone: quiet(errTone(m.errPct ?? 0)) },
    { k: "V2", v: `${Math.round(m.v2Pct ?? 0)}%` },
  ],
};
