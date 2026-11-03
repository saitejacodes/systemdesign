"use client";
import type { ViewProps } from "@/lib/sim/definition";
import { POLICIES, compose, layoutOf, lifetimeYears, machineIdOf, maxMachines, perMs, type Batch, type Layout, type SnowConfig, type SnowState } from "./model";

const FIELDS = [
  { k: "sign", label: "Sign", color: "var(--ink-muted)" },
  { k: "ts", label: "Timestamp ms", color: "var(--cobalt)" },
  { k: "dc", label: "Datacenter", color: "var(--phase-4)" },
  { k: "worker", label: "Worker", color: "var(--phase-1)" },
  { k: "seq", label: "Sequence", color: "var(--phase-3)" },
] as const;
const widths = (l: Layout) => [1, l.ts, l.dc, l.worker, l.seq];
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString());
const REFS = [
  { name: "Twitter", ts: 41, dc: 5, worker: 5 },
  { name: "4,096 machines", ts: 41, dc: 2, worker: 10 },
];
const STATE = { ok: ["OK", "var(--status-ok)"], waiting: ["WAITING", "var(--status-hot)"], refusing: ["REFUSING", "var(--status-over)"] } as const;

function Bits({ l, id }: { l: Layout; id?: bigint }) {
  const bin = id !== undefined ? id.toString(2).padStart(64, "0") : undefined;
  let at = 0;
  return (
    <div className="flex w-full font-mono text-[11px]" role="img" aria-label={FIELDS.map((f, i) => `${f.label} ${widths(l)[i]} bits`).join(", ")}>
      {FIELDS.map((f, i) => {
        const w = widths(l)[i];
        const part = bin?.slice(at, (at += w));
        if (!w) return null;
        return (
          <div key={f.k} className="min-w-0 overflow-hidden border border-ink px-0.5 py-1 text-center" style={{ flexGrow: w, flexBasis: 0, background: `color-mix(in srgb, ${f.color} 22%, transparent)`, borderRadius: 2 }}>
            <div className="truncate font-semibold">{w}</div>
            <div className="truncate opacity-80 max-sm:hidden">{part ?? f.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function SnowView({ state: s, config: c }: ViewProps<SnowConfig, SnowState>) {
  const l = s.layout;
  const shared = c.machines > maxMachines(l);
  const sorted = [...s.recent].map((b) => ({ b, id: compose(l, b.ts, b.mid, b.from) })).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const newest = s.recent.at(-1);
  const stats = [
    ["Lifetime", `${lifetimeYears(l).toFixed(1)} years`, "2^ts ms from your epoch"],
    ["Machine IDs", fmt(maxMachines(l)), `2^${l.dc + l.worker}`],
    ["IDs per ms", fmt(perMs(l)), `2^${l.seq} per machine`],
    ["IDs per second", fmt(perMs(l) * 1000), "per machine, at most"],
  ];
  return (
    <div className="grid gap-3 text-[14px] [&>*]:min-w-0">
      <figure className="grid gap-2">
        <figcaption className="fm-cap">64-bit ID · {FIELDS.map((f, i) => `${f.label} ${widths(l)[i]}`).join(" | ")}{newest ? ` · bits of the newest ID (M${newest.m + 1})` : ""}</figcaption>
        <Bits l={l} id={newest ? compose(l, newest.ts, newest.mid, newest.to) : undefined} />
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(([k, v, sub]) => (
            <div key={k} className="fm-card p-2"><dt className="fm-cap">{k}</dt><dd className="font-mono text-[18px] font-semibold">{v}</dd><dd className="fm-cap opacity-70">{sub}</dd></div>
          ))}
        </dl>
        <p className="fm-cap">Compare: {REFS.map((r) => { const x = layoutOf({ tsBits: r.ts, dcBits: r.dc, workerBits: r.worker }); return `${r.name} ${r.ts}|${r.dc + r.worker}|${x.seq} → ${lifetimeYears(x).toFixed(1)} y, ${fmt(maxMachines(x))} machines, ${fmt(perMs(x))}/ms`; }).join(" · ")}</p>
      </figure>

      <section aria-label="Generators" className="grid gap-2 sm:grid-cols-2">
        {s.gens.slice(0, c.machines).map((g, m) => {
          const mid = machineIdOf(l, m);
          const [txt, col] = STATE[g.state];
          return (
            <div key={m} className="fm-card grid gap-0.5 p-2 font-mono text-[12px]" style={{ borderLeft: `4px solid ${col}` }}>
              <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">M{m + 1} · ID {mid} (dc {mid >> l.worker}, worker {mid & (2 ** l.worker - 1)})</span><span style={{ color: col }}>{txt}</span></div>
              <div>clock {g.off >= 0 ? "+" : ""}{g.off} ms · last ts {g.last} · seq {g.seq}</div>
              <div>backlog {g.backlog.toLocaleString()} · out of order {g.outOfOrder}{g.aheadMs ? ` · IDs ${g.aheadMs} ms ahead of clock` : ""}</div>
            </div>
          );
        })}
      </section>
      {shared && <p role="alert" className="fm-card p-2" style={{ borderColor: "var(--status-over)", color: "var(--status-over)" }}>OVER CAPACITY · {c.machines} generators share {maxMachines(l)} machine IDs: generators with the same ID mint the same IDs.</p>}

      <figure className="grid gap-1">
        <figcaption className="fm-cap">Latest batches sorted by ID · one row = one machine-millisecond · true ms shows k-sortability{s.dups ? ` · ${s.dups.toLocaleString()} duplicates so far` : ""}</figcaption>
        <div className="overflow-x-auto border border-ink" style={{ borderRadius: 2 }}>
          <table className="w-full font-mono text-[12px]">
            <thead><tr>{["First ID (decimal)", "M", "ts", "seq", "True ms", ""].map((h, i) => <th key={i} className="whitespace-nowrap border-b border-ink px-2 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {sorted.map(({ b, id }, i) => <Row key={i} b={b} id={id} prevTru={i ? sorted[i - 1].b.tru : -Infinity} />)}
            </tbody>
          </table>
        </div>
        <p className="fm-cap">Policy: {POLICIES.find((p) => p.value === c.policy)?.label}{c.stepBackMs ? ` · M1 steps back ${c.stepBackMs} ms every 3 s` : ""}</p>
      </figure>
    </div>
  );
}

function Row({ b, id, prevTru }: { b: Batch; id: bigint; prevTru: number }) {
  const late = b.tru < prevTru;
  const note = b.dup ? `DUPLICATE ×${b.dup}` : late ? "EARLIER BY TIME" : "";
  return (
    <tr style={{ color: b.dup ? "var(--status-over)" : late ? "var(--status-hot)" : undefined }}>
      <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{id.toString()}</td>
      <td className="border-b border-line px-2 py-0.5">M{b.m + 1}</td>
      <td className="border-b border-line px-2 py-0.5">{b.ts}</td>
      <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{b.from}{b.to > b.from ? `–${b.to}` : ""}</td>
      <td className="border-b border-line px-2 py-0.5">{b.tru}</td>
      <td className="whitespace-nowrap border-b border-line px-2 py-0.5">{note}</td>
    </tr>
  );
}
