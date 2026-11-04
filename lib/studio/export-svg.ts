import tokens from "@/design/tokens.json";
import { CATALOG } from "./catalog";
import { iconMarkup } from "./icons";
import { absoluteRects, boundsOf, COMPONENT_SIZE, edgeLine, keyProps, parentsFirst, type Rect } from "./serialize";
import type { StudioEdge, StudioGraph, StudioNode } from "./types";

export type ExportTheme = "paper" | "blueprint";

export interface SvgOptions {
  /** Shown as the SVG <title> and in the caption strip. */
  title?: string;
  /** Space around the diagram, in canvas px. */
  margin?: number;
}

type TokenRow = { name: string; value: Record<string, string> };
const COLOR_ROWS = (tokens as unknown as { color: { tokens: TokenRow[] } }).color.tokens;
const FONTS = (tokens as unknown as { type: { families: Record<"display" | "sans" | "mono", string> } }).type.families;

/** Every colour token's value for one theme (the same values tokens.css puts on :root / [data-theme]). */
export function themeColors(theme: ExportTheme): Record<string, string> {
  return Object.fromEntries(COLOR_ROWS.map((t) => [t.name, t.value[theme] ?? t.value.paper]));
}

/** Replaces var(--token) (with or without a fallback) by the theme's literal value, so the file renders anywhere. */
export function inlineVars(markup: string, colors: Record<string, string>): string {
  return markup.replace(/var\(--([a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/gi, (m, name: string, fallback?: string) => colors[name] ?? fallback?.trim() ?? m);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r = (v: number) => String(Math.round(v * 100) / 100);
const fit = (s: string, maxChars: number) => (s.length > maxChars ? `${s.slice(0, Math.max(1, maxChars - 1))}…` : s);
const attrFont = (f: string) => esc(f);

/** Plain text lines for a note: markdown markers dropped, wrapped to the box width. */
function noteLines(text: string, width: number, height: number): string[] {
  const perLine = Math.max(8, Math.floor((width - 20) / 6.6));
  const maxLines = Math.max(1, Math.floor((height - 20) / 16));
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "• ").replace(/[*_`]/g, "");
    if (!line.trim()) { if (out.length) out.push(""); continue; }
    let rest = line;
    while (rest.length > perLine) {
      const cut = rest.lastIndexOf(" ", perLine);
      const at = cut > perLine / 2 ? cut : perLine;
      out.push(rest.slice(0, at));
      rest = rest.slice(at).trimStart();
    }
    out.push(rest);
  }
  const lines = out.slice(0, maxLines);
  if (out.length > maxLines) lines[maxLines - 1] = fit(`${lines[maxLines - 1]}…`, perLine);
  return lines;
}

function frameSvg(n: StudioNode, b: Rect): string {
  const label = fit((n.label || "Frame").toUpperCase(), Math.floor((b.w - 20) / 8.2));
  const tabW = Math.min(b.w, label.length * 8.2 + 20);
  return (
    `<g data-kind="frame">` +
    `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}" fill="var(--surface)" fill-opacity="0.35" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="8 5"/>` +
    `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(tabW)}" height="22" fill="var(--ink)"/>` +
    `<text x="${r(b.x + 10)}" y="${r(b.y + 15)}" font-family="${attrFont(FONTS.mono)}" font-size="11" font-weight="600" letter-spacing="1.4" fill="var(--paper)">${esc(label)}</text>` +
    `</g>`
  );
}

function noteSvg(n: StudioNode, b: Rect): string {
  const text = typeof n.props.text === "string" ? n.props.text : "";
  const lines = noteLines(text || n.label, b.w, b.h);
  return (
    `<g data-kind="note">` +
    `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}" rx="2" fill="var(--surface-sunk)" stroke="var(--ink)" stroke-width="1"/>` +
    `<text font-family="${attrFont(FONTS.sans)}" font-size="12" fill="var(--ink)">` +
    lines.map((l, i) => `<tspan x="${r(b.x + 10)}" y="${r(b.y + 20 + i * 16)}">${esc(l)}</tspan>`).join("") +
    `</text></g>`
  );
}

function componentSvg(n: StudioNode, b: Rect): string {
  if (n.kind === "note" || n.kind === "frame") return "";
  const spec = CATALOG[n.kind];
  const props = keyProps(n.kind, n.props);
  const icon = 40;
  return (
    `<g data-kind="${n.kind}">` +
    `<rect x="${r(b.x)}" y="${r(b.y)}" width="${COMPONENT_SIZE.w}" height="${COMPONENT_SIZE.h}" rx="2" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"/>` +
    `<svg x="${r(b.x + 8)}" y="${r(b.y + 8)}" width="${icon}" height="${icon}" viewBox="0 0 64 64">${iconMarkup(n.kind)}</svg>` +
    `<text x="${r(b.x + 56)}" y="${r(b.y + 24)}" font-family="${attrFont(FONTS.sans)}" font-size="14" font-weight="600" fill="var(--ink)">${esc(fit(n.label || spec.title, 17))}</text>` +
    props.map((p, i) => `<text x="${r(b.x + 56)}" y="${r(b.y + 41 + i * 14)}" font-family="${attrFont(FONTS.mono)}" font-size="10.5" fill="var(--ink-muted)">${esc(fit(p, 20))}</text>`).join("") +
    `<text x="${r(b.x + 8)}" y="${r(b.y + 72)}" font-family="${attrFont(FONTS.mono)}" font-size="9" font-weight="600" letter-spacing="1.2" fill="var(--ink-muted)">${esc(fit(spec.title.toUpperCase(), 14))}</text>` +
    `</g>`
  );
}

function edgeSvg(e: StudioEdge, a: Rect, b: Rect): string {
  const { x1, y1, x2, y2 } = edgeLine(a, b);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const markers = `${e.direction !== "none" ? ` marker-end="url(#sdl-arrow)"` : ""}${e.direction === "both" ? ` marker-start="url(#sdl-arrow)"` : ""}`;
  const seg = (o: number, extra: string) => `<line x1="${r(x1 + nx * o)}" y1="${r(y1 + ny * o)}" x2="${r(x2 + nx * o)}" y2="${r(y2 + ny * o)}" ${extra}/>`;
  let body: string;
  if (e.kind === "replication") {
    const dotted = `stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="0.1 4.5"`;
    body = seg(2.5, dotted) + seg(-2.5, dotted) + seg(0, `stroke="var(--ink)" stroke-opacity="0" stroke-width="1.5"${markers}`);
  } else {
    body = seg(0, `stroke="var(--ink)" stroke-width="1.5"${e.kind === "async" ? ` stroke-dasharray="7 5"` : ""}${markers}`);
  }
  let label = "";
  if (e.label) {
    const t = fit(e.label, 28), w = t.length * 6.6 + 12, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    label = `<rect x="${r(mx - w / 2)}" y="${r(my - 9)}" width="${r(w)}" height="18" fill="var(--paper)" stroke="var(--line)" stroke-width="1"/>` +
      `<text x="${r(mx)}" y="${r(my + 4)}" text-anchor="middle" font-family="${attrFont(FONTS.mono)}" font-size="11" fill="var(--ink)">${esc(t)}</text>`;
  }
  return `<g data-edge="${e.kind}">${body}${label}</g>`;
}

/**
 * The whole diagram as a standalone SVG document: fitted to its bounds plus a margin, with the theme's token
 * values written in (no CSS variables left), so it opens in any viewer and can be drawn onto a canvas for PNG.
 */
export function toSvg(graph: StudioGraph, theme: ExportTheme, opts: SvgOptions = {}): string {
  const margin = opts.margin ?? 48;
  const colors = themeColors(theme);
  const rects = absoluteRects(graph.nodes);
  const b = boundsOf(rects.values()) ?? { x: 0, y: 0, w: 320, h: 160 };
  const caption = 28;
  const vx = b.x - margin, vy = b.y - margin, vw = b.w + margin * 2, vh = b.h + margin * 2 + caption;
  const ordered = parentsFirst(graph.nodes);
  const frames = ordered.filter((n) => n.kind === "frame").map((n) => frameSvg(n, rects.get(n.id)!)).join("");
  const edges = graph.edges.map((e) => (rects.has(e.source) && rects.has(e.target) ? edgeSvg(e, rects.get(e.source)!, rects.get(e.target)!) : "")).join("");
  const nodes = ordered.filter((n) => n.kind !== "frame").map((n) => (n.kind === "note" ? noteSvg(n, rects.get(n.id)!) : componentSvg(n, rects.get(n.id)!))).join("");
  const components = graph.nodes.filter((n) => n.kind !== "frame" && n.kind !== "note").length;
  const title = opts.title?.trim() || "Design";
  const capText = `${title} · ${components} component${components === 1 ? "" : "s"} · ${graph.edges.length} connection${graph.edges.length === 1 ? "" : "s"}`;
  const empty = graph.nodes.length ? "" : `<text x="${r(b.x + b.w / 2)}" y="${r(b.y + b.h / 2)}" text-anchor="middle" font-family="${attrFont(FONTS.mono)}" font-size="12" letter-spacing="1.4" fill="var(--ink-muted)">EMPTY DESIGN</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r(vw)}" height="${r(vh)}" viewBox="${r(vx)} ${r(vy)} ${r(vw)} ${r(vh)}" data-theme="${theme}">` +
    `<title>${esc(title)}</title>` +
    `<defs>` +
    `<pattern id="sdl-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern>` +
    `<marker id="sdl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink)"/></marker>` +
    `</defs>` +
    `<rect x="${r(vx)}" y="${r(vy)}" width="${r(vw)}" height="${r(vh)}" fill="var(--paper)"/>` +
    `<rect x="${r(vx)}" y="${r(vy)}" width="${r(vw)}" height="${r(vh - caption)}" fill="url(#sdl-grid)"/>` +
    frames + edges + nodes + empty +
    `<line x1="${r(vx)}" y1="${r(vy + vh - caption)}" x2="${r(vx + vw)}" y2="${r(vy + vh - caption)}" stroke="var(--ink)" stroke-width="1"/>` +
    `<text x="${r(vx + 12)}" y="${r(vy + vh - 10)}" font-family="${attrFont(FONTS.mono)}" font-size="10.5" letter-spacing="1.2" fill="var(--ink-muted)">${esc(capText.toUpperCase())}</text>` +
    `<text x="${r(vx + vw - 12)}" y="${r(vy + vh - 10)}" text-anchor="end" font-family="${attrFont(FONTS.mono)}" font-size="10.5" letter-spacing="1.2" fill="var(--ink-muted)">SYSDESIGN LAB · ${theme.toUpperCase()}</text>` +
    `</svg>`;
  return inlineVars(svg, colors);
}
