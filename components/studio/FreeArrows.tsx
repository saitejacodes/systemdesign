"use client";
import { useState } from "react";
import { useReactFlow, useStore, ViewportPortal } from "@xyflow/react";
import { arrowMid, arrowPath, moveArrowPart, type ArrowPart } from "@/lib/studio/arrows";
import type { FreeArrow } from "@/lib/studio/types";

/** The arrow being drawn (Arrow tool), before it is committed. */
export type Draft = { x1: number; y1: number; x2: number; y2: number; toNode: boolean };

/**
 * Free-drawn arrows, in canvas coordinates (inside React Flow's viewport, so they pan and zoom with the design).
 * In the Select tool an arrow can be clicked to select it, then dragged by its line, ends or middle dot (to curve it).
 */
export function FreeArrowLayer({ arrows, selected, draft, interactive, onSelect, onChange }: {
  arrows: FreeArrow[];
  selected: string | null;
  draft: Draft | null;
  interactive: boolean;
  onSelect: (id: string) => void;
  onChange: (a: FreeArrow) => void;
}) {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const [live, setLive] = useState<FreeArrow | null>(null);

  const begin = (e: React.PointerEvent<SVGElement>, a: FreeArrow, part: ArrowPart) => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(a.id);
    const el = e.currentTarget as SVGElement;
    const p0 = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    el.setPointerCapture(e.pointerId);
    let cur = a;
    const move = (ev: PointerEvent) => {
      const p = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      cur = moveArrowPart(a, part, p, p.x - p0.x, p.y - p0.y, ev.shiftKey);
      setLive(cur);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setLive(null);
      if (cur !== a) onChange(cur);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const shown = live ? arrows.map((a) => (a.id === live.id ? live : a)) : arrows;
  const sel = shown.find((a) => a.id === selected);
  const hr = 5.5 / zoom; // handles keep their screen size at any zoom
  const handle = (a: FreeArrow, part: Exclude<ArrowPart, "body">, x: number, y: number, label: string) => (
    <circle key={part} className={`sdl-free-handle is-${part} nopan nodrag`} cx={x} cy={y} r={part === "mid" ? hr * 0.9 : hr} strokeWidth={1.5 / zoom}
      aria-label={label} onPointerDown={(e) => begin(e, a, part)} onClick={(e) => e.stopPropagation()} />
  );

  return (
    <ViewportPortal>
      <svg className="sdl-free" aria-hidden={shown.length === 0 && !draft} style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
        {shown.map((a) => {
          const head = a.head ?? "end";
          const on = a.id === selected;
          const m = arrowMid(a);
          return (
            <g key={a.id} data-arrow-id={a.id} className={`sdl-free-arrow${on ? " is-selected" : ""}`}>
              <path d={arrowPath(a)} className="sdl-free-hit nopan nodrag" style={{ pointerEvents: interactive ? "stroke" : "none" }} strokeWidth={14 / zoom}
                onPointerDown={(e) => begin(e, a, "body")} onClick={(e) => e.stopPropagation()} />
              <path d={arrowPath(a)} className="sdl-free-line" markerEnd={head !== "none" ? `url(#${on ? "sdl-arrow-sel" : "sdl-arrow"})` : undefined}
                markerStart={head === "both" ? `url(#${on ? "sdl-arrow-sel" : "sdl-arrow"})` : undefined} />
              {a.label && <text x={m.x} y={m.y - 8} textAnchor="middle" className="sdl-free-label">{a.label}</text>}
            </g>
          );
        })}
        {draft && <path d={`M${draft.x1},${draft.y1} L${draft.x2},${draft.y2}`} className={`sdl-free-draft${draft.toNode ? " is-to-node" : ""}`} markerEnd="url(#sdl-arrow-sel)" />}
        {sel && interactive && (
          <g style={{ pointerEvents: "all" }}>
            {handle(sel, "start", sel.x1, sel.y1, "Arrow start")}
            {handle(sel, "end", sel.x2, sel.y2, "Arrow end")}
            {handle(sel, "mid", arrowMid(sel).x, arrowMid(sel).y, "Bend point")}
          </g>
        )}
      </svg>
    </ViewportPortal>
  );
}
