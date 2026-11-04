import { CATALOG } from "@/lib/studio/catalog";
import { analyze, NO_FAULTS, steadyState, type TrafficProfile } from "@/lib/studio/sim";
import type { StudioGraph } from "@/lib/studio/types";
import type { InterviewSession } from "@/lib/interview/types";

/** Keeps prompts bounded: long free text is cut with a marker the model can see. */
export function trim(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()} … [trimmed]`;
}

const fmtProp = (v: number | string | boolean) => (typeof v === "number" ? Number(v.toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/,/g, "")) : v);

/**
 * A compact, line-per-item text form of a Design Studio graph for prompts: components with their kind and properties,
 * connections with their kind, and notes. Ids are kept so the model can refer to them; frames become groups.
 */
export function serializeGraph(g: StudioGraph, maxNoteChars = 1_500): string {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const name = (id: string) => { const n = byId.get(id); return n ? `${n.label || n.kind} (${id})` : id; };
  const comps = g.nodes.filter((n) => n.kind !== "note" && n.kind !== "frame");
  const frames = g.nodes.filter((n) => n.kind === "frame");
  const notes = g.nodes.filter((n) => n.kind === "note");
  const lines: string[] = [];
  lines.push(`Components (${comps.length}):`);
  if (!comps.length) lines.push("- none");
  for (const n of comps) {
    const props = Object.entries(n.props).filter(([k]) => k !== "costPerMonth").map(([k, v]) => `${k}=${fmtProp(v)}`).join(", ");
    const group = n.parentId ? ` in ${name(n.parentId)}` : "";
    lines.push(`- ${n.label || n.kind} (${n.id}) [${CATALOG[n.kind as keyof typeof CATALOG]?.title ?? n.kind}]${group}${props ? `: ${props}` : ""}`);
  }
  if (frames.length) lines.push(`Groups: ${frames.map((f) => name(f.id)).join("; ")}`);
  lines.push(`Connections (${g.edges.length}):`);
  if (!g.edges.length) lines.push("- none");
  for (const e of g.edges) {
    const arrow = e.direction === "both" ? "↔" : e.direction === "none" ? "—" : "→";
    lines.push(`- ${name(e.source)} ${arrow} ${name(e.target)} [${e.kind}]${e.label ? ` "${e.label}"` : ""}`);
  }
  if (notes.length) {
    lines.push("Notes on the canvas:");
    for (const n of notes) lines.push(`- ${trim(String(n.props.text ?? n.label ?? ""), maxNoteChars).replace(/\n+/g, " / ")}`);
  }
  return lines.join("\n");
}

/** The learner's interview panels (everything but the canvas) as labelled text. */
export function serializeSession(s: InterviewSession, deepDiveQuestions: string[] = []): string {
  const e = s.estimation;
  const out = [
    "## Requirements",
    `Functional: ${s.requirements.functional.join("; ") || "(none written)"}`,
    `Non-functional: ${s.requirements.nonFunctional.join("; ") || "(none written)"}`,
    "## Estimation inputs",
    `${e.dauM}M daily active users, ${e.actionsPerDay} actions/user/day, ${e.readsPerWrite} reads per write, ${e.itemBytes} bytes per item, ${e.retentionYears} years retention, peak ×${e.peakFactor}`,
    "## API",
    s.api.length ? s.api.map((a) => `${a.method} ${a.path} · in: ${a.request || "-"} · out: ${a.response || "-"}`).join("\n") : "(no endpoints)",
    "## Data model",
    s.dataModel.entities.length ? s.dataModel.entities.map((en) => `${en.name}(${en.fields.map((f) => `${f.name}:${f.type}${f.key ? ` ${f.key}` : ""}`).join(", ")})`).join("\n") : "(no entities)",
    `Database: ${s.dataModel.db || "(not chosen)"}. Why: ${trim(s.dataModel.justification, 800) || "(not written)"}`,
    "## High-level walkthrough",
    trim(s.highLevel, 2_000) || "(not written)",
    "## Deep dives",
    deepDiveQuestions.length
      ? deepDiveQuestions.map((q, i) => `Q${i + 1}: ${q}\nA: ${trim(s.deepDiveAnswers[i] ?? "", 1_000) || "(no answer)"}`).join("\n")
      : "(none)",
    "## Wrap-up",
    trim(s.wrapUp, 1_500) || "(not written)",
  ];
  if (s.ai?.asks.length) out.push("## Extra clarifying questions the candidate asked", ...s.ai.asks.map((x) => `Q: ${x.q}\nA: ${trim(x.a, 600)}`));
  if (s.ai?.followUps.length) out.push("## Follow-up questions on the design", ...s.ai.followUps.map((x) => `Q: ${x.q}\nA: ${trim(x.a, 1_000) || "(no answer)"}`));
  return out.join("\n");
}

/** Run Mode metrics for a design at average and peak traffic, as text the model can cite. */
export function serializeRun(g: StudioGraph, profile: TrafficProfile): string {
  const label = (id: string) => g.nodes.find((n) => n.id === id)?.label || id;
  const block = (peak: boolean) => {
    const faults = { ...NO_FAULTS, peak };
    const s = steadyState(g, profile, faults, 0);
    const a = analyze(g, profile, s, faults);
    const p99 = s.requestTypes.reduce((m, r) => Math.max(m, r.p99Ms), 0);
    return [
      `### ${peak ? `Peak (×${profile.peakMultiplier})` : "Average"} traffic`,
      `Offered ${Math.round(s.totals.offeredQps)} QPS, served ${Math.round(s.totals.okQps)} QPS, error rate ${s.totals.errorRatePct.toFixed(1)}%, worst p99 ${Math.round(p99)} ms`,
      `Availability estimate ${a.availabilityPct.toFixed(3)}%, cost about $${Math.round(a.costPerMonth)}/month`,
      `Bottlenecks (utilization > 80%): ${a.bottlenecks.map((b) => `${label(b.id)} ${Math.round(b.rho * 100)}%`).join(", ") || "none"}`,
      `Single points of failure: ${a.spofs.map((x) => label(x.id)).join(", ") || "none"}`,
      ...s.requestTypes.map((r) => `- ${r.name}: ${Math.round(r.okQps)}/${Math.round(r.offeredQps)} QPS ok, p99 ${Math.round(r.p99Ms)} ms${r.reachable ? "" : ", NOT REACHABLE"}`),
    ].join("\n");
  };
  return [
    `Traffic profile: ${profile.qps} QPS average, ${profile.readWriteRatio}:1 reads per write, peak ×${profile.peakMultiplier}; request types: ${profile.requestTypes.map((r) => `${r.name} (${r.op})`).join(", ")}`,
    block(false),
    block(true),
  ].join("\n");
}
