"use client";
import type { ViewProps } from "@/lib/sim/definition";
import { CAPACITY, MAX_CELEBS, MAX_SHARDS, STRATEGY_LABEL, maxAvg, status, type ShConfig, type ShState } from "./model";

const TAG = { ok: "OK", hot: "HOT", over: "OVERLOADED" } as const;

export function ShView({ state: s, reducedMotion, act }: ViewProps<ShConfig, ShState>) {
  const dir = s.strategy === "directory";
  const full = s.n >= MAX_SHARDS;
  const celebShard = (u: number) => (s.salted[u] ? "ALL" : `S${s.owner[u] + 1}`);
  return (
    <div className="grid gap-3 p-3 text-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={full} onClick={() => act("addShard")}>{s.strategy === "hash" ? "+ Add shard (rehash)" : "+ Split hot shard"}</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={s.celebs.length >= MAX_CELEBS} onClick={() => act("celebrity")}>★ Mark celebrity</button>
        <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => act("salt")}>Salt hottest key</button>
        {dir && <button type="button" className="fm-btn fm-btn--tool !h-8" disabled={full} onClick={() => act("isolate")}>Dedicated shard for hottest key</button>}
      </div>
      <p className="fm-cap">{STRATEGY_LABEL[s.strategy]} · {s.n} shards · 10,000 users · skew {s.skew === 0 ? "uniform" : `Zipf ${s.skew}`} · capacity {CAPACITY.toLocaleString()} req/s each · max/avg {maxAvg(s).toFixed(2)}×</p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Load per shard">
        {Array.from({ length: s.n }, (_, i) => {
          const st = status(s.load[i]);
          const live = s.obs[i] ?? s.load[i];
          const celebs = s.celebs.filter((u) => !s.salted[u] && s.owner[u] === i).length;
          return (
            <li key={i} className="fm-card grid gap-1 p-2" style={{ background: `var(--status-${st}-fill)`, borderColor: `var(--status-${st})` }} aria-label={`Shard ${i + 1}: ${Math.round(s.load[i])} requests per second, ${s.users[i]} users, ${TAG[st]}`}>
              <div className="flex items-baseline justify-between gap-1 font-mono">
                <span className="font-semibold">S{i + 1}{celebs ? ` ${"★".repeat(celebs)}` : ""}</span>
                <span className="text-[11px] font-semibold" style={{ color: "var(--ink)" }}>{TAG[st]}</span>
              </div>
              <div className="font-mono text-[18px] tabular-nums">{Math.round(live).toLocaleString()}<span className="text-[11px]"> req/s</span></div>
              <div className="h-1.5 w-full border border-ink" style={{ borderRadius: 2 }}>
                <div className="h-full" style={{ width: `${Math.min(100, (live / CAPACITY) * 100)}%`, background: `var(--status-${st})`, transition: reducedMotion ? "none" : "width 200ms" }} />
              </div>
              <div className="fm-cap">{s.users[i].toLocaleString()} users</div>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-2 sm:grid-cols-2">
        <section className="fm-card grid content-start gap-1 p-2" aria-label="Last change">
          <h3 className="fm-cap !text-ink">Data moved by last change</h3>
          <div className="h-3 w-full border border-ink" style={{ borderRadius: 2 }}>
            <div className="h-full" style={{ width: `${(s.last?.moved ?? 0) * 100}%`, background: (s.last?.moved ?? 0) > 0.5 ? "var(--status-over)" : "var(--status-ok)" }} />
          </div>
          <p className="font-mono text-[12px]">{s.last ? `${(s.last.moved * 100).toFixed(1)}% · ${s.last.label}` : "Add a shard or switch strategy to compare."}</p>
        </section>
        <section className="fm-card grid content-start gap-1 p-2" aria-label="Feed queries and hot keys">
          <h3 className="fm-cap !text-ink">Friends&apos; posts query</h3>
          <p className="font-mono text-[12px]">{s.perQuery.toFixed(2)} shards per query · {(s.crossShard * 100).toFixed(0)}% cross-shard</p>
          {s.celebs.length > 0 && <p className="font-mono text-[12px]">★ {s.celebs.map((u) => `${s.names[u]} (${celebShard(u)})`).join(" · ")}</p>}
          {s.salted.some(Boolean) && <p className="fm-cap">Salted keys live on every shard; reads gather from all {s.n}.</p>}
        </section>
      </div>
    </div>
  );
}
