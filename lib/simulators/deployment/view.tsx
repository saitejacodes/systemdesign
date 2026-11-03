"use client";
import { IsoBlock, Leader, Wire, lerp, type Tone } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { CODES, MIG_STEPS, N, ROWS, STRATEGIES, USERS, canarySteps, isReady, shares, type DeployConfig, type DeployState, type Mig, type Pod } from "./model";

type Act = ViewProps<DeployConfig, DeployState>["act"];
const R: [number, number] = [130, 165];
const LANE = { 1: 70, 2: 240 } as const;
const slotX = (k: number) => 200 + k * 49;
const DOT_MS = 400;
const sec = (ms: number) => `${Math.max(0, ms / 1000).toFixed(1)} s`;

export function DeployView(p: ViewProps<DeployConfig, DeployState>) {
  return p.config.mode === "migration" ? <MigView mig={p.state.mig} act={p.act} t={p.t} /> : <ReleaseView {...p} />;
}

function phaseText(s: DeployState, c: DeployConfig, t: number) {
  const d = s.deploy;
  const ready = (v: 1 | 2) => s.pods.filter((x) => x.ver === v && isReady(x, t)).length;
  if (!d) return "IDLE · 10 pods on v1. Press Deploy v2.";
  if (d.end !== undefined) return d.outcome === "promoted" ? `DONE · v2 promoted in ${sec(d.end - d.from)}` : `ROLLED BACK · v1 serving again, ${sec(d.end - d.rollback!.at)} after the decision`;
  if (d.rollback) return `ROLLING BACK (${d.rollback.manual ? "manual" : "analysis failed"}) · v1 ready ${ready(1)}/${N}`;
  if (d.strategy === "rolling") return `ROLLING · v2 ready ${ready(2)}/${N} · ${s.pods.length} pods (max ${N + (c.maxSurge || (c.maxUnavailable ? 0 : 1))}), ≥ ${N - c.maxUnavailable} ready`;
  if (d.strategy === "bluegreen") return d.stepAt < 0 ? `PROVISIONING GREEN · ${ready(2)}/${N} ready, no traffic yet` : `SWITCHED · 100% on green, blue kept warm ${sec(c.stepMs - (t - d.stepAt))} more`;
  const w = canarySteps(c.canarySteps)[d.step];
  return d.stepAt < 0 ? `CANARY · starting pods for ${w}%` : `CANARY · ${w}% on v2 · next step in ${sec(c.stepMs - (t - d.stepAt))}${c.analysis && !d.passes ? " after a passing analysis" : ""}`;
}

function ReleaseView({ state: s, config: c, t, reducedMotion, act }: ViewProps<DeployConfig, DeployState>) {
  const d = s.deploy;
  const running = d && d.end === undefined;
  const sh = shares(s);
  const pos = new Map<number, [number, number]>();
  const lanes = ([1, 2] as const).map((v) => s.pods.filter((x) => x.ver === v).sort((a, b) => a.id - b.id));
  lanes.forEach((ps, i) => ps.forEach((x, k) => pos.set(x.id, [slotX(k) + 20, LANE[(i + 1) as 1 | 2] + 22])));
  const recentErr = new Set(s.trail.filter((x) => x.err && t - x.at < 600).map((x) => x.pod));
  const health = c.build !== "mystery" ? { text: `v2 BUILD · ${c.build.toUpperCase()} (you picked it)`, tone: c.build === "bad" ? "over" : "ok" }
    : s.bugErrors > 0 ? { text: "v2 BUILD · BAD: its pods are failing requests", tone: "over" }
    : d?.outcome === "promoted" ? { text: "v2 BUILD · no errors seen", tone: "ok" }
    : { text: "v2 BUILD · UNKNOWN until it takes traffic", tone: undefined };
  const laneName = (v: 1 | 2) => (c.strategy === "bluegreen" ? (v === 1 ? "BLUE · v1" : "GREEN · v2") : c.strategy === "canary" ? (v === 1 ? "STABLE · v1" : "CANARY · v2") : `v${v}`);
  const steps = canarySteps(c.canarySteps);
  return (
    <div className="grid gap-3 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool is-on !h-8" disabled={!!running || s.live === 2} onClick={() => act("deploy", { strategy: c.strategy })}>
          Deploy v2 · {STRATEGIES.find((x) => x.value === c.strategy)!.label}
        </button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={!running || !!d?.rollback} onClick={() => act("rollback")}>Roll back</button>
        <span className="fm-cap" style={{ color: health.tone ? `var(--status-${health.tone})` : undefined }}>{health.text}</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox="0 0 700 330" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`${s.pods.length} pods: ${lanes[0].length} on v1, ${lanes[1].length} on v2. ${Math.round(sh[1] * 100)}% of traffic on v2.`}>
          {([1, 2] as const).map((v) => (
            <g key={v}>
              <Wire from={R} to={[195, LANE[v] + 22]} />
              <text x={200} y={LANE[v] - 16} className="sim-sub" fill="var(--ink)">{laneName(v)} · {Math.round(sh[v - 1] * 100)}% OF TRAFFIC · {lanes[v - 1].filter((x) => isReady(x, t)).length} READY</text>
              {Array.from({ length: N }, (_, k) => {
                const pod = lanes[v - 1][k];
                return pod ? <PodBlock key={pod.id} pod={pod} k={k} y={LANE[v]} t={t} err={recentErr.has(pod.id)} /> : <rect key={`e${k}`} x={slotX(k)} y={LANE[v]} width={40} height={44} fill="none" stroke="var(--line)" strokeDasharray="3 3" />;
              })}
            </g>
          ))}
          {!reducedMotion && s.trail.filter((x) => t - x.at < DOT_MS && pos.has(x.pod)).map((x, i) => {
            const [cx, cy] = lerp(R, pos.get(x.pod)!, (t - x.at) / DOT_MS);
            return <circle key={i} cx={cx} cy={cy} r={3.5} fill={x.err ? "var(--status-over)" : "var(--cobalt)"} stroke="var(--ink)" strokeWidth={1} />;
          })}
          <IsoBlock x={20} y={135} w={110} h={60} d={14} label="ROUTER" sub={`${Math.round(s.load)} req/s`} />
          <Leader from={[75, 195]} to={[45, 290]}>{c.strategy === "rolling" ? "SERVICE: EVERY READY POD, EQUALLY" : "WEIGHTED ROUTE (MESH / LB)"}</Leader>
        </svg>
      </div>

      <section aria-label="Deployment status" className="fm-card grid gap-2 p-3 text-[14px]">
        <p className="fm-cap !text-ink" role="status">{phaseText(s, c, t)}</p>
        {c.strategy === "canary" && (
          <ol className="flex flex-wrap gap-1.5 font-mono text-[12px]" aria-label="Canary steps">
            {steps.map((w, i) => {
              const now = running && !d.rollback && d.strategy === "canary" && d.step === i;
              const past = d?.strategy === "canary" && (d.step > i || d.outcome === "promoted");
              return <li key={w} className="border px-2 py-0.5" style={{ borderRadius: 2, borderColor: now ? "var(--cobalt)" : "var(--line)", borderWidth: now ? 2 : 1 }}>{past ? "✓ " : now ? "▶ " : ""}{w}%</li>;
            })}
          </ol>
        )}
        {d?.last && (
          <p className="font-mono text-[12px]" style={{ color: d.last.verdict === "fail" ? "var(--status-over)" : d.last.verdict === "pass" ? "var(--status-ok)" : "var(--status-hot)" }}>
            ANALYSIS {d.last.verdict.toUpperCase()} · {d.last.err}/{d.last.req} v2 requests failed{d.last.req ? ` (${((d.last.err / d.last.req) * 100).toFixed(1)}%)` : ""} · threshold {c.errorThreshold}%{d.last.verdict === "inconclusive" ? " · too few samples, waiting" : ""}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[12px] sm:grid-cols-4">
          <div><dt className="fm-cap">Users hit</dt><dd>{s.affected} / {USERS.toLocaleString()}</dd></div>
          <div><dt className="fm-cap">Failed requests</dt><dd>{s.errors} · bug {s.bugErrors} · 503 {s.overloadErrors} · boot {s.coldErrors}</dd></div>
          <div><dt className="fm-cap">Peak extra pods</dt><dd>+{s.peakExtra} ({s.peakExtra * 10}%)</dd></div>
          <div><dt className="fm-cap">Capacity now</dt><dd>{s.pods.filter((x) => isReady(x, t)).length * 25} / {Math.round(s.load)} req/s</dd></div>
        </dl>
      </section>
    </div>
  );
}

function PodBlock({ pod, k, y, t, err }: { pod: Pod; k: number; y: number; t: number; err: boolean }) {
  const ready = isReady(pod, t), warm = t >= pod.warmAt;
  const [tone, sub]: [Tone, string] = !ready ? ["idle", `${Math.ceil((pod.readyAt - t) / 1000)}s`] : !warm ? ["hot", "BOOT"] : err ? ["over", "ERR"] : ["ok", "OK"];
  return (
    <g opacity={ready ? 1 : 0.6} aria-hidden>
      <IsoBlock x={slotX(k)} y={y} w={40} h={44} d={7} tone={tone} label={`v${pod.ver}`} sub={sub} />
    </g>
  );
}

const TAG: Record<string, string> = { add: "EXPAND", dual: "EXPAND", backfill: "MIGRATE", readNew: "MIGRATE", newOnly: "CONTRACT", drop: "CONTRACT" };
const CELL = 30;

function MigView({ mig: m, act, t }: { mig: Mig; act: Act; t: number }) {
  const cur = m.running && m.stepAt >= 0 ? MIG_STEPS.find((x) => x.id === m.order[m.idx]) : undefined;
  const p = cur ? Math.min(1, (t - m.stepAt) / cur.ms) : 0;
  const finished = !m.running && m.runs > 0;
  const clean = finished && !m.failed && !m.bad;
  const colState = (col: "name" | "full") => (m.cols[col] ? "PRESENT" : col === "name" ? "DROPPED" : "NOT YET ADDED");
  return (
    <div className="grid gap-3 text-[14px] md:grid-cols-2 [&>*]:min-w-0">
      <section aria-label="Migration plan" className="grid content-start gap-2">
        <p>Rename <code>users.name</code> to <code>full_name</code> while 40 req/s keep flowing (70% reads). Order the steps; each deploy is a rolling update, so the previous and the new app version serve traffic together.</p>
        <ol className="grid gap-1.5">
          {m.order.map((id, i) => {
            const st = MIG_STEPS.find((x) => x.id === id)!;
            const tally = m.perStep[i];
            const hurt = tally.failed + tally.bad;
            const now = cur?.id === id;
            return (
              <li key={id} className="fm-card flex items-center gap-2 p-2" style={{ borderColor: now ? "var(--cobalt)" : hurt ? "var(--status-over)" : undefined, borderWidth: now || hurt ? 2 : undefined }}>
                <span className="fm-cap w-5 shrink-0">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="fm-cap mr-1">{TAG[id]}</span>{st.label}
                  {(hurt > 0 || (finished && !hurt)) && <span className="block font-mono text-[12px]" style={{ color: hurt ? "var(--status-over)" : "var(--status-ok)" }}>{hurt ? `${tally.failed} failed · ${tally.bad} wrong reads` : "OK · no errors"}</span>}
                  {now && <span className="block font-mono text-[12px]">RUNNING · {Math.round(p * 100)}%</span>}
                </span>
                <button type="button" className="fm-btn fm-btn--tool !h-8 !px-2" disabled={m.running || i === 0} aria-label={`Move step ${i + 1} up`} onClick={() => act("migMove", { id, dir: -1 })}>↑</button>
                <button type="button" className="fm-btn fm-btn--tool !h-8 !px-2" disabled={m.running || i === m.order.length - 1} aria-label={`Move step ${i + 1} down`} onClick={() => act("migMove", { id, dir: 1 })}>↓</button>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="fm-btn fm-btn--tool is-on !h-8" disabled={m.running} onClick={() => act("migRun")}>{m.runs ? "Run again" : "Run migration"}</button>
          <span className="fm-cap">{m.running ? "Press Play if paused" : `${m.runs} run${m.runs === 1 ? "" : "s"} · ${m.cleanRuns} clean`}</span>
        </div>
      </section>

      <section aria-label="Database and app state" className="grid content-start gap-2">
        <p className="fm-cap !text-ink" role="status">
          {cur?.kind === "deploy" ? `ROLLING DEPLOY · ${CODES[m.prev].label} → ${CODES[m.code].label} · ${Math.round(p * 100)}% new` : `APP · ${CODES[m.code].label}`}
        </p>
        <p className="font-mono text-[12px]">users.name: {colState("name")} · users.full_name: {colState("full")}</p>
        <figure className="grid gap-1">
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${20 * CELL} ${10 * 16 + 4}`} className="h-auto w-full max-sm:min-w-[340px]" role="img" aria-label={`${ROWS} rows. Left half name, right half full_name. Green holds the current value, red is NULL or stale, empty is no column.`}>
              {Array.from(m.rows, (v, i) => {
                const x = (i % 20) * CELL + 1, y = Math.floor(i / 20) * 16 + 2;
                const fill = (col: "name" | "full", bit: number) => (!m.cols[col] ? "none" : v & bit ? "var(--status-ok)" : "var(--status-over)");
                return (
                  <g key={i}>
                    <rect x={x} y={y} width={CELL / 2 - 2} height={12} fill={fill("name", 1)} stroke="var(--ink)" strokeWidth={0.5} />
                    <rect x={x + CELL / 2 - 2} y={y} width={CELL / 2 - 2} height={12} fill={fill("full", 2)} stroke="var(--ink)" strokeWidth={0.5} strokeDasharray={m.cols.full ? undefined : "2 2"} />
                  </g>
                );
              })}
            </svg>
          </div>
          <figcaption className="fm-cap">Each row: name | full_name · green = current value · red = NULL or stale · empty = column absent</figcaption>
        </figure>
        {m.reasons.length > 0 && (
          <ul className="grid gap-1 font-mono text-[12px]" aria-label="Errors seen" style={{ color: "var(--status-over)" }}>
            {m.reasons.map((r) => <li key={r}>✗ {r}</li>)}
          </ul>
        )}
        {finished && <p className="font-semibold" style={{ color: clean ? "var(--status-ok)" : "var(--status-over)" }}>{clean ? "CLEAN · zero failed requests, zero wrong reads" : `ERRORS · ${m.failed} failed requests, ${m.bad} wrong reads`}</p>}
      </section>
    </div>
  );
}
