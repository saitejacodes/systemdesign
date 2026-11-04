"use client";
import "@xyflow/react/dist/style.css";
import "@/components/studio/studio.css";
import { useMemo } from "react";
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { edgeTypes, EdgeMarkers, nodeTypes } from "@/components/studio/nodes";
import { toFlow, type FlowEdge, type FlowNode } from "@/lib/studio/serialize";
import type { StudioGraph } from "@/lib/studio/types";

/**
 * A read-only Design Studio graph (a case's design.json, or a saved attempt's design): pan and zoom only, nodes are not
 * draggable, connectable or selectable. Renders the studio's own node and edge components via toFlow.
 * `markers` adds the arrowhead defs; pass false when another viewer or the editor on the page already renders them.
 */
export function DesignViewer({ graph, label, height = 420, markers = true }: { graph: StudioGraph; label: string; height?: number; markers?: boolean }) {
  const flow = useMemo(() => toFlow(graph), [graph]);
  const n = graph.nodes.filter((x) => x.kind !== "frame" && x.kind !== "note").length;
  return (
    <ReactFlowProvider>
      <figure className="relative m-0 border border-ink" style={{ height, borderRadius: 2 }} aria-label={`${label}: ${n} component${n === 1 ? "" : "s"}, ${graph.edges.length} connection${graph.edges.length === 1 ? "" : "s"}`}>
        {markers && <EdgeMarkers />}
        {graph.nodes.length === 0 ? (
          <p className="grid h-full place-items-center p-6 text-center text-ink-muted">Nothing was drawn on this canvas.</p>
        ) : (
          <ReactFlow<FlowNode, FlowEdge>
            className="sdl-flow sdl-flow--readonly"
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            zoomOnDoubleClick={false}
            minZoom={0.1}
            maxZoom={1.5}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Lines} gap={32} color="var(--grid)" />
            <Controls showInteractive={false} aria-label={`Zoom controls for ${label}`} />
          </ReactFlow>
        )}
        <figcaption className="fm-cap pointer-events-none absolute left-2 top-1 bg-paper/80 px-1">{label}</figcaption>
      </figure>
    </ReactFlowProvider>
  );
}
