"use client";
import { createContext, memo, useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, useInternalNode, type EdgeProps, type EdgeTypes, type InternalNode, type NodeProps, type NodeTypes } from "@xyflow/react";
import { ComponentIcon } from "@/components/studio/ComponentIcon";
import { CATALOG } from "@/lib/studio/catalog";
import { edgeLine, keyProps, MIN_SIZE, type FlowEdge, type FlowNode, type Rect } from "@/lib/studio/serialize";
import type { ComponentKind } from "@/lib/studio/types";

/** Lets node components report the end of a resize to the editor (which commits it to history). */
export const NodeEvents = createContext<{ resized: (id: string) => void }>({ resized: () => {} });

const SIDES = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
] as const;

function Handles() {
  // ConnectionMode.Loose: every handle is a source and can connect to any other handle.
  return <>{SIDES.map((s) => <Handle key={s.id} id={s.id} type="source" position={s.position} className="sdl-handle" />)}</>;
}

const ComponentNode = memo(function ComponentNode({ data, selected }: NodeProps<FlowNode>) {
  const kind = data.kind as ComponentKind;
  const spec = CATALOG[kind];
  const props = keyProps(kind, data.props);
  return (
    <div className={`sdl-node${selected ? " is-selected" : ""}`}>
      <Handles />
      <ComponentIcon kind={kind} size={40} className="sdl-node__icon" />
      <div className="sdl-node__text">
        <div className="sdl-node__label" title={data.label}>{data.label || spec.title}</div>
        {props.map((p) => <div key={p} className="sdl-node__prop">{p}</div>)}
      </div>
      <span className="sdl-node__tag">{spec.title}</span>
    </div>
  );
});

const FrameNode = memo(function FrameNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { resized } = useContext(NodeEvents);
  return (
    <div className={`sdl-frame${selected ? " is-selected" : ""}`}>
      <NodeResizer isVisible={selected} minWidth={MIN_SIZE.frame.w} minHeight={MIN_SIZE.frame.h} onResizeEnd={() => resized(id)} lineClassName="sdl-resize-line" handleClassName="sdl-resize-handle" />
      <div className="sdl-frame__tab" title="Drag to move the frame">{data.label || "Frame"}</div>
    </div>
  );
});

const NoteNode = memo(function NoteNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { resized } = useContext(NodeEvents);
  const text = typeof data.props.text === "string" ? data.props.text : "";
  return (
    <div className={`sdl-note${selected ? " is-selected" : ""}`}>
      <NodeResizer isVisible={selected} minWidth={MIN_SIZE.note.w} minHeight={MIN_SIZE.note.h} onResizeEnd={() => resized(id)} lineClassName="sdl-resize-line" handleClassName="sdl-resize-handle" />
      <Handles />
      <div className="sdl-note__body">
        {text.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : <p className="fm-cap">Empty note · write it in Properties</p>}
      </div>
    </div>
  );
});

// Defined once at module level: React Flow warns when nodeTypes/edgeTypes change identity between renders.
export const nodeTypes: NodeTypes = { component: ComponentNode, frame: FrameNode, note: NoteNode };

const rectOf = (n: InternalNode): Rect => ({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w: n.measured.width ?? n.width ?? 0, h: n.measured.height ?? n.height ?? 0 });

const StudioEdgeView = memo(function StudioEdgeView({ id, source, target, data, selected }: EdgeProps<FlowEdge>) {
  const s = useInternalNode(source), t = useInternalNode(target);
  if (!s || !t || !data) return null;
  const { x1, y1, x2, y2 } = edgeLine(rectOf(s), rectOf(t));
  const path = `M${x1},${y1} L${x2},${y2}`;
  const marker = `url(#${selected ? "sdl-arrow-sel" : "sdl-arrow"})`;
  const markerEnd = data.direction !== "none" ? marker : undefined;
  const markerStart = data.direction === "both" ? marker : undefined;
  const color = selected ? "var(--cobalt)" : "var(--ink)";
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * 2.5, ny = ((x2 - x1) / len) * 2.5;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return (
    <>
      {data.kind === "replication" && (
        <>
          <path d={`M${x1 + nx},${y1 + ny} L${x2 + nx},${y2 + ny}`} className="sdl-edge-dots" style={{ stroke: color }} />
          <path d={`M${x1 - nx},${y1 - ny} L${x2 - nx},${y2 - ny}`} className="sdl-edge-dots" style={{ stroke: color }} />
        </>
      )}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={16}
        style={{ stroke: color, strokeWidth: selected ? 2 : 1.5, strokeDasharray: data.kind === "async" ? "7 5" : undefined, strokeOpacity: data.kind === "replication" ? 0 : 1 }}
      />
      {data.label && (
        <EdgeLabelRenderer>
          <div className={`sdl-edge-label nodrag nopan${selected ? " is-selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${mx}px, ${my}px)` }}>{data.label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes: EdgeTypes = { studio: StudioEdgeView };

/** Arrowheads referenced by every edge (url(#id) resolves across the page's SVGs). */
export function EdgeMarkers() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {[["sdl-arrow", "var(--ink)"], ["sdl-arrow-sel", "var(--cobalt)"]].map(([mid, fill]) => (
          <marker key={mid} id={mid} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill }} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
