"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { COMMAND_NAMES, EXERCISES, fmtScore, hllCount, type Entry, type RedisConfig, type RedisState } from "./model";

const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}…` : s);

function preview(e: Entry) {
  switch (e.type) {
    case "string": return clip(JSON.stringify(e.v));
    case "hash": return clip([...e.v].map(([f, v]) => `${f}=${v}`).join(", "));
    case "list": return clip(`[${e.v.join(", ")}]`);
    case "set": return clip(`{${[...e.v].join(", ")}}`);
    case "zset": return clip([...e.v].sort((a, b) => b[1] - a[1]).map(([m, s]) => `${m}:${fmtScore(s)}`).join(", "));
    case "hll": return `≈ ${hllCount(e.v)} distinct · 1,024 registers`;
  }
}

export function RedisView({ state, config, reducedMotion, act }: ViewProps<RedisConfig, RedisState>) {
  return (
    <div className="grid gap-4 p-3 text-[14px] [&>*]:min-w-0">
      <p className="fm-cap" role="note">A simulation of Redis behavior, not a real Redis server.</p>
      <Exercises group={config.group} passed={state.passed} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="fm-cap tabular-nums">Sim clock {fmtClock(state.now)}</span>
        {([[10, "+10 s"], [60, "+1 min"], [1800, "+30 min"]] as const).map(([sec, label]) => (
          <button key={sec} type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("forward", sec)} aria-label={`Fast-forward time ${label.slice(1)}`}>{label}</button>
        ))}
        <span className="fm-cap">Play runs the clock; fast-forward jumps it</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Terminal state={state} reducedMotion={reducedMotion} act={act} />
        <KeyBrowser state={state} />
      </div>
    </div>
  );
}

function Exercises({ group, passed }: { group: RedisConfig["group"]; passed: RedisState["passed"] }) {
  const list = EXERCISES.filter((e) => e.group === group);
  const [hint, setHint] = useState<string | null>(null);
  return (
    <section aria-label="Exercises" className="grid gap-2 md:grid-cols-2">
      {list.map((ex) => (
        <div key={ex.id} className="fm-card grid content-start gap-1.5 p-3">
          <h3 className="font-semibold">
            {ex.title}
            <span className="fm-cap ml-2" style={{ color: passed[ex.id] ? "var(--status-ok)" : undefined }}>{passed[ex.id] ? "✓ Passed" : "Not yet"}</span>
          </h3>
          <p>{ex.goal}</p>
          <button type="button" className="fm-btn fm-btn--tool !h-8 justify-self-start" aria-expanded={hint === ex.id} onClick={() => setHint(hint === ex.id ? null : ex.id)}>Hint</button>
          {hint === ex.id && <p className="fm-help font-mono">{ex.hint}</p>}
        </div>
      ))}
    </section>
  );
}

function Terminal({ state, reducedMotion, act }: { state: RedisState; reducedMotion: boolean; act: ViewProps<RedisConfig, RedisState>["act"] }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [pos, setPos] = useState<number | null>(null);
  const out = useRef<HTMLDivElement>(null);
  const prompt = state.tx ? "127.0.0.1:6379(TX)>" : "127.0.0.1:6379>";

  useEffect(() => {
    out.current?.scrollTo({ top: out.current.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  }, [state.lines.length, reducedMotion]);

  const word = input.trimStart().split(/\s/)[0].toUpperCase();
  const typingName = word.length > 0 && !/\s/.test(input.trimStart());
  const matches = typingName ? COMMAND_NAMES.filter((c) => c.startsWith(word) && c !== word) : [];

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (input.trim()) { act("exec", input); setHistory((h) => [...h, input].slice(-100)); }
      setInput("");
      setPos(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!history.length) return;
      e.preventDefault();
      const up = e.key === "ArrowUp";
      const next = pos === null ? (up ? history.length - 1 : null) : up ? Math.max(0, pos - 1) : pos + 1 >= history.length ? null : pos + 1;
      setPos(next);
      setInput(next === null ? "" : history[next]);
    } else if (e.key === "Tab" && matches.length) {
      e.preventDefault();
      // One match completes the name; several complete their common prefix.
      const common = matches.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
      setInput(matches.length === 1 ? `${matches[0]} ` : common);
    }
  };

  return (
    <section aria-label="Redis terminal" className="grid content-start gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="fm-cap">redis-cli · ↑/↓ history · Tab completes</span>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("clear")}>Clear screen</button>
      </div>
      <div ref={out} role="log" aria-live="polite" aria-label="Terminal output" className="h-80 overflow-auto border border-ink p-2 font-mono text-[12.5px] leading-snug" style={{ borderRadius: 2 }}>
        {state.lines.length === 0 && <p className="opacity-70">Try: SET greeting &quot;hello world&quot; · GET greeting · PING</p>}
        {state.lines.map((l, i) => (
          <div key={i} className="mb-1">
            <div className="break-all"><span className="opacity-70">&gt; </span>{l.input}</div>
            {l.out.map((o, j) => <div key={j} className="whitespace-pre-wrap break-all" style={{ color: o.startsWith("(error)") ? "var(--status-over)" : undefined }}>{o}</div>)}
            {l.note && <div style={{ color: "var(--status-hot)" }}>WARNING: {l.note}</div>}
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 font-mono text-[12.5px]">
        <span className="shrink-0">{prompt}</span>
        <input aria-label="Redis command" className="fm-input fm-input--mono !h-9 min-w-0 flex-1" value={input} autoComplete="off" autoCapitalize="off" spellCheck={false}
          onChange={(e) => { setInput(e.target.value); setPos(null); }} onKeyDown={onKey} />
      </label>
      {matches.length > 0 && <p className="fm-cap break-words" aria-live="polite">{matches.slice(0, 12).join(" · ")}{matches.length > 12 ? " …" : ""}</p>}
    </section>
  );
}

function KeyBrowser({ state }: { state: RedisState }) {
  const keys = [...state.db.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return (
    <section aria-label="Key browser" className="grid content-start gap-2">
      <span className="fm-cap">Keys · {state.db.size} in memory</span>
      {keys.length === 0 ? <p className="fm-help">No keys yet. Anything you write shows up here with its type and TTL.</p> : (
        <div className="max-h-96 overflow-auto border border-ink" style={{ borderRadius: 2 }}>
          <table className="w-full font-mono text-[12px]">
            <thead className="sticky top-0 bg-surface"><tr>{["Key", "Type", "TTL", "Value"].map((h) => <th key={h} className="border-b border-ink px-2 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {keys.slice(0, 100).map(([k, e]) => {
                const left = e.exp === undefined ? null : e.exp - state.now;
                const gone = left !== null && left <= 0;
                return (
                  <tr key={k} style={{ opacity: gone ? 0.75 : undefined }}>
                    <td className="break-all border-b border-line px-2 py-0.5">{k}</td>
                    <td className="border-b border-line px-2 py-0.5">{e.type === "hll" ? "hyperloglog" : e.type}</td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-0.5 tabular-nums" style={{ color: gone ? "var(--status-hot)" : undefined }}>
                      {left === null ? "none" : gone ? "EXPIRED · not reclaimed yet" : `${Math.ceil(left / 1000)} s`}
                    </td>
                    <td className="break-all border-b border-line px-2 py-0.5">{preview(e)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="fm-help">An expired key stays in memory until a command touches it (lazy expiry) or the active cycle samples it, ten times a sim second. A read never returns it.</p>
    </section>
  );
}
