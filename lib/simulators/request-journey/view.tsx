"use client";
import { Dot, IsoBlock, Wire } from "@/components/sim/draw";
import type { ViewProps } from "@/lib/sim/definition";
import { TOGGLES, assetsMs, journey, type RjConfig, type RjState, type Step } from "./model";

type P = [number, number];
const NODE: Record<string, P> = {
  browser: [52, 95], resolver: [150, 40], root: [250, 40], tld: [350, 40], auth: [450, 40],
  edge: [215, 150], lb: [340, 150], app: [440, 150], cache: [540, 110], db: [580, 160],
};
const LABEL: Record<string, string> = { browser: "BROWSER", resolver: "RESOLVER", root: "ROOT", tld: "TLD", auth: "AUTH NS", edge: "CDN EDGE", lb: "LB", app: "APP", cache: "CACHE", db: "DB" };
const CAT = [
  { ids: ["resolver", "root", "tld", "auth"], label: "DNS", color: "var(--phase-4)" },
  { ids: ["tcp", "tls"], label: "Handshakes", color: "var(--phase-3)" },
  { ids: ["send", "recv"], label: "Network", color: "var(--cobalt)" },
  { ids: ["edge", "lb", "app", "cache", "db"], label: "Server", color: "var(--phase-1)" },
];

/** Where the request dot is during a step, given progress f (0–1) through it. */
function dotPath(st: Step, cdn: boolean, f: number): [P, P, number] | null {
  const target = cdn ? NODE.edge : NODE.lb;
  const out = (a: P, b: P): [P, P, number] => [a, b, 1 - Math.abs(2 * f - 1)]; // there and back
  switch (st.id) {
    case "resolver": return out(NODE.browser, NODE.resolver);
    case "root": case "tld": case "auth": return out(NODE.resolver, NODE[st.id]);
    case "tcp": case "tls": return out(NODE.browser, target);
    case "send": return [NODE.browser, target, f];
    case "recv": return [target, NODE.browser, f];
    case "lb": return [NODE.lb, NODE.lb, 0];
    case "app": return [NODE.lb, NODE.app, f];
    case "cache": return out(NODE.app, NODE.cache);
    case "db": return out(NODE.app, NODE.db);
    case "edge": return [NODE.edge, NODE.edge, 0];
    default: return null;
  }
}

export function RjView({ state, config, reducedMotion, act }: ViewProps<RjConfig, RjState>) {
  const steps = journey(config, state.faults);
  const starts = steps.map((_, i) => steps.slice(0, i).reduce((a, s) => a + s.ms, 0));
  const rows = steps.map((st, i) => ({ st, start: starts[i] }));
  const total = starts.at(-1)! + steps.at(-1)!.ms;
  const cur = rows.find((r) => state.cursor >= r.start && state.cursor < r.start + r.st.ms) ?? (state.cursor >= total ? rows.at(-1)! : rows[0]);
  const f = cur.st.ms ? Math.min(1, (state.cursor - cur.start) / cur.st.ms) : 1;
  const path = dotPath(cur.st, config.cdn, f);
  const active = new Set(["browser", ...(config.dnsCached ? [] : ["resolver", "root", "tld", "auth"]), ...(config.cdn ? ["edge"] : ["lb", "app", "cache", ...(config.cacheHit && !state.faults.cacheDown ? [] : ["db"])])]);
  const nodeOf = (id: string) => (id === "tcp" || id === "tls" || id === "send" || id === "recv" ? (config.cdn ? "edge" : "lb") : id);
  const assets = assetsMs(config);
  return (
    <div className="grid gap-4">
      <div className="min-w-0 overflow-x-auto" tabIndex={0}>
      <svg viewBox="0 0 640 195" className="h-auto w-full max-sm:min-w-[560px]" role="img" aria-label={`Request journey: ${steps.filter((s) => !s.skipped).map((s) => s.label).join(", ")}. Time to first byte ${Math.round(total)} ms.`}>
        <Wire from={NODE.browser} to={NODE.resolver} />
        {(["root", "tld", "auth"] as const).map((k) => <Wire key={k} from={NODE.resolver} to={NODE[k]} />)}
        <Wire from={NODE.browser} to={config.cdn ? NODE.edge : NODE.lb} />
        <Wire from={NODE.lb} to={NODE.app} /><Wire from={NODE.app} to={NODE.cache} /><Wire from={NODE.app} to={NODE.db} />
        {Object.entries(NODE).map(([id, [x, y]]) => (
          <g key={id} opacity={active.has(id) ? 1 : 0.35}>
            <IsoBlock x={x - 38} y={y - 15} w={76} h={30} d={8} tone={nodeOf(cur.st.id) === id ? "ok" : "idle"} label={LABEL[id]} />
          </g>
        ))}
        {path && !reducedMotion && <Dot from={path[0]} to={path[1]} p={path[2]} />}
        {path && reducedMotion && <Dot from={path[1]} to={path[1]} p={1} />}
        <text x={8} y={188} className="sim-sub" fill="var(--ink)">{cur.st.label.toUpperCase()} · T = {Math.round(Math.min(state.cursor, total))} / {Math.round(total)} MS</text>
      </svg>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("prev")}>◀ Prev step</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("next")}>Next step ▶</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("restart")}>Restart</button>
      </div>
      <p className="fm-card p-3 text-[15px]" aria-live="polite"><strong>{cur.st.label}.</strong> {cur.st.explain}</p>

      <table className="w-full font-mono text-[12px] tabular-nums">
        <thead><tr className="fm-cap text-left"><th className="py-1">Step</th><th className="text-right">ms</th><th className="text-right">At</th></tr></thead>
        <tbody>
          {rows.map(({ st, start }) => (
            <tr key={st.id} className={`cursor-pointer border-t border-line ${st === cur.st ? "bg-[var(--status-ok-fill)]" : ""} ${st.skipped ? "text-ink-muted line-through" : ""}`} onClick={() => act("seek", start)}>
              <td className="py-1">{st.label}</td><td className="text-right">{Math.round(st.ms * 10) / 10}</td><td className="text-right">{Math.round(start + st.ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <figure className="grid gap-1">
        <figcaption className="fm-cap">Time to first byte · {Math.round(total)} ms · full page with 12 assets ≈ {Math.round(total + assets)} ms ({config.http2 ? "HTTP/2, one round" : "HTTP/1.1, 6 connections, two rounds"})</figcaption>
        <div className="flex h-5 border border-ink" style={{ borderRadius: 2 }}>
          {CAT.map((c) => {
            const ms = steps.filter((s) => c.ids.includes(s.id)).reduce((a, s) => a + s.ms, 0);
            return ms > 0 ? <div key={c.label} title={`${c.label} ${Math.round(ms)} ms`} style={{ width: `${(ms / (total + assets)) * 100}%`, background: c.color }} /> : null;
          })}
          <div title={`Assets ${Math.round(assets)} ms`} style={{ width: `${(assets / (total + assets)) * 100}%` }} className="fm-grid" />
        </div>
        <div className="flex flex-wrap gap-x-3 font-mono text-[11px]">
          {CAT.map((c) => <span key={c.label} className="inline-flex items-center gap-1"><span aria-hidden className="inline-block size-2" style={{ background: c.color }} />{c.label} {Math.round(steps.filter((s) => c.ids.includes(s.id)).reduce((a, s) => a + s.ms, 0))}</span>)}
          <span className="inline-flex items-center gap-1"><span aria-hidden className="fm-grid inline-block size-2 border border-ink" />Assets {Math.round(assets)}</span>
        </div>
      </figure>

      <fieldset className="fm-card grid gap-2 p-3">
        <legend className="fm-cap px-1">Quiz · from all toggles off, which one alone saves the most time to first byte?</legend>
        <div className="flex flex-wrap gap-2">
          {TOGGLES.map((t) => (
            <button key={t.key} type="button" aria-pressed={state.answer === t.key} className={`fm-btn fm-btn--tool !h-8 ${state.answer === t.key ? "is-on" : ""}`} onClick={() => act("answer", t.key)}>{t.label}</button>
          ))}
        </div>
        {state.answer && (
          <p className="text-[15px]" aria-live="polite">
            {state.answer === state.correct ? "✓ Correct. " : `✗ Not quite: ${TOGGLES.find((t) => t.key === state.correct)?.label} saves the most. `}
            Every round trip to a far server costs the full RTT, so moving the server closer beats shaving work off it.
          </p>
        )}
      </fieldset>
    </div>
  );
}
