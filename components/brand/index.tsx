import type { ReactNode } from "react";
import { CASE_STUDY_COUNT, PHASES } from "@/lib/curriculum";
import { PHASE_PATH_MARKUP } from "./phase-path-markup";

/** FIG. 0 · ONE PATH · 7 PHASES — `bold` is the subject part. */
export function FigureCaption({ parts, bold = 1, className = "" }: { parts: string[]; bold?: number; className?: string }) {
  return (
    <div className={`fm-figcap ${className}`}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && <span className="sep">·</span>}
          {i === bold ? <b>{p}</b> : <span>{p}</span>}
        </span>
      ))}
    </div>
  );
}

export function NumberedCallout({ n, accent, small, label }: { n: number | string; accent?: boolean; small?: boolean; label?: string }) {
  return (
    <span className={`fm-num ${accent ? "fm-num--accent" : ""} ${small ? "fm-num--sm" : ""}`} aria-label={label}>
      {typeof n === "number" ? String(n).padStart(2, "0") : n}
    </span>
  );
}

export interface PartsRow { cells: ReactNode[] }
export function PartsList({ caption, head, rows, alignRight = [] }: { caption: string; head: string[]; rows: PartsRow[]; alignRight?: number[] }) {
  const r = (i: number) => (alignRight.includes(i) ? { textAlign: "right" as const, paddingRight: 0 } : undefined);
  return (
    <table className="fm-parts">
      <caption>{caption}</caption>
      <thead>
        <tr>{head.map((h, i) => <th key={h} style={r(i)}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>{row.cells.map((c, i) => <td key={i} style={r(i)}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export function PhaseSquare({ n }: { n: number }) {
  return <span className={`fm-sq fm-sq--${n}`} aria-label={`Phase ${n}`}>{n}</span>;
}

/** S-03 · LOAD BALANCER · LIVE — the last part prints muted (NTS / Live). */
export function SpecLabel({ code, parts, note }: { code: string; parts: string[]; note?: string }) {
  return (
    <span className="fm-spec">
      <span>{code}</span>
      {parts.map((p) => <span key={p}>{p}</span>)}
      {note && <span className="nts">{note}</span>}
    </span>
  );
}

export interface HudItem { k?: string; v: ReactNode; tone?: "ok" | "hot" | "over" }
export function HudBar({ live, items = [], right }: { live: string; items?: HudItem[]; right?: ReactNode }) {
  return (
    <div className="fm-hud" role="status" aria-label="Status bar">
      <span className="live">{live}</span>
      {items.map((it, i) => (
        <span key={i} className={it.tone ?? ""}>{it.k && <span className="k">{it.k}</span>}{it.v}</span>
      ))}
      {right && <span className="push">{right}</span>}
    </div>
  );
}

export type Depth = "deep" | "tradeoffs" | "awareness";
const GLYPH: Record<Depth, string> = { deep: "■■■", tradeoffs: "■■□", awareness: "■□□" };
export function DepthStamp({ depth }: { depth: Depth }) {
  return (
    <span className={`fm-stamp fm-stamp--${depth}`}>
      <span className="g" aria-hidden="true">{GLYPH[depth]}</span>
      {depth[0].toUpperCase() + depth.slice(1)}
    </span>
  );
}

export type Status = "ok" | "hot" | "over";
const STATUS: Record<Status, [string, string]> = { ok: ["●", "OK"], hot: ["▲", "Hot"], over: ["■", "Overloaded"] };
export function StatusLabel({ status, detail }: { status: Status; detail?: string }) {
  const [g, w] = STATUS[status];
  return (
    <span className={`fm-status fm-status--${status}`}>
      <span className="g" aria-hidden="true">{g}</span>{w}{detail && ` · ${detail}`}
    </span>
  );
}

/**
 * The curriculum as 7 isometric steps. Geometry is the approved drawing (phase-path-markup.ts);
 * hover/focus readouts, rise and draw-in motion are pure CSS in components.css.
 */
// The generated drawing carries counts from when it was drawn; write the current ones in.
const PATH_WITH_COUNTS = PHASES.reduce((m, p) => {
  const tail = p.n === 7 ? `${CASE_STUDY_COUNT} case studies` : `${p.simulators} simulators`;
  return m
    .replace(new RegExp(`(aria-label="Phase ${p.n}:[^"]*?, )\\d+ sections · \\d+ (simulators|case studies)"`), `$1${p.sections} sections · ${tail}"`)
    .replace(new RegExp(`(PHASE ${p.n} ·[^<]*</text><text[^>]*>[^<]*?· )\\d+ SECTIONS · \\d+ (SIMULATORS|CASE STUDIES)`), `$1${p.sections} SECTIONS · ${tail.toUpperCase()}`);
}, PHASE_PATH_MARKUP);

export function PhasePath({ active, labels = true, interactive = true, className = "" }: { active?: number; labels?: boolean; interactive?: boolean; className?: string }) {
  let markup = PATH_WITH_COUNTS;
  if (active) markup = markup.replace(`class="co" tabindex="0" role="button" aria-label="Phase ${active}:`, `class="co is-on" tabindex="0" role="button" aria-label="Phase ${active}:`);
  if (!interactive) markup = markup.replaceAll(` tabindex="0" role="button"`, "").replace(/<g class="tipbox"[\s\S]*?<\/g>/g, "");
  if (!labels) markup = markup.replace(/<text class="lbl(-sub)?"[^>]*>[^<]*<\/text>/g, "");
  return (
    <svg
      className={`fm-path ${className}`}
      viewBox="0 0 640 700"
      role={interactive ? "group" : "img"}
      aria-label="The learning path: seven steps rising from Phase 1, Foundations and Networking, to Phase 7, Interview Mastery. Each step carries a shape for what that phase teaches."
      xmlns="http://www.w3.org/2000/svg"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export function Wordmark() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg viewBox="0 0 28 22" width="28" height="22" aria-hidden="true">
        <polygon points="14,1 27,7.5 14,14 1,7.5" style={{ fill: "var(--cobalt)", stroke: "var(--ink)", strokeWidth: 1.25 }} />
        <polygon points="1,11.5 14,18 27,11.5" style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 1.25 }} />
        <polygon points="1,15 14,21.5 27,15" style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 1.25 }} />
      </svg>
      <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-.03em" }}>SysDesign Lab</span>
    </span>
  );
}

/** The one italic serif cobalt word in a headline. */
export function Em({ children }: { children: ReactNode }) {
  return <span className="fm-em">{children}</span>;
}
