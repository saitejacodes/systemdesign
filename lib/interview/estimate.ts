import { estimate, fmt, fmtBytes } from "@/lib/simulators/estimation-calculator/model";
import type { EstimationInput } from "./types";

/**
 * The Interview Mode mini calculator, on top of the estimation calculator's pure estimate(): one action count split
 * into reads and writes by the read:write ratio, every item the same size, one copy stored.
 */
export function miniEstimate(e: EstimationInput) {
  const writes = e.actionsPerDay / (e.readsPerWrite + 1);
  const reads = e.actionsPerDay - writes;
  const r = estimate(
    { dauM: e.dauM, peakFactor: e.peakFactor, retentionYears: e.retentionYears, replication: 1, cacheHit: 0, qpsPerServer: 1_000, hotPct: 20 },
    [{ name: "read", count: reads, kind: "read", bytes: e.itemBytes }, { name: "write", count: writes, kind: "write", bytes: e.itemBytes }],
  );
  const by = (k: string) => r.outs.find((o) => o.key === k)!;
  const rows = [by("avg"), by("peak"), by("avg-read"), by("avg-write"), by("day"), by("total"), by("ingress"), by("egress")];
  return {
    avgQps: r.avg,
    peakQps: r.peak,
    totalBytes: by("total").value,
    rows: rows.map((o) => ({ key: o.key, label: o.key === "total" ? `Storage over ${e.retentionYears} years` : o.key === "avg-read" ? "Reads · avg" : o.key === "avg-write" ? "Writes · avg" : o.label, value: fmt(o), formula: o.formula })),
  };
}

export { fmtBytes };
