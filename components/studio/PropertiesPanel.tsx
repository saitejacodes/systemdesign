"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, Trash2 } from "lucide-react";
import { ComponentIcon } from "@/components/studio/ComponentIcon";
import { CATALOG, runProps, validateProp, type PropSpec } from "@/lib/studio/catalog";
import { EDGE_KINDS, type ComponentKind, type EdgeKind, type PropValue, type StudioEdge, type StudioGraph, type StudioNode } from "@/lib/studio/types";
import { align, connect, counts, distribute, summaryText, updateEdge, updateNode, type AlignMode } from "./ops";

export type Lessons = Record<string, { href: string; title: string }>;
type Apply = (g: StudioGraph, key?: string, select?: string[]) => void;

export const EDGE_TEXT: Record<EdgeKind, { title: string; hint: string }> = {
  sync: { title: "Sync request", hint: "Caller waits for the answer. Solid line." },
  async: { title: "Async message", hint: "Fire and forget through a queue or topic. Dashed line." },
  replication: { title: "Replication", hint: "Data copied between stores. Dotted double line." },
};
const DIRECTIONS: { v: StudioEdge["direction"]; label: string }[] = [
  { v: "forward", label: "→ Arrow at target" },
  { v: "both", label: "⇄ Arrows at both ends" },
  { v: "none", label: "— No arrows" },
];

const kindTitle = (n: StudioNode) => (n.kind === "note" ? "Note" : CATALOG[n.kind].title);

export function PropertiesPanel({ graph, selection, apply, lessons, onDelete }: { graph: StudioGraph; selection: string[]; apply: Apply; lessons: Lessons; onDelete: () => void }) {
  const sel = new Set(selection);
  const nodes = graph.nodes.filter((n) => sel.has(n.id));
  const edges = graph.edges.filter((e) => sel.has(e.id));
  if (nodes.length + edges.length === 0) return <NothingSelected graph={graph} />;
  if (nodes.length === 1 && edges.length === 0) return <NodeProps key={nodes[0].id} node={nodes[0]} graph={graph} apply={apply} lessons={lessons} onDelete={onDelete} />;
  if (edges.length === 1 && nodes.length === 0) return <EdgeProps key={edges[0].id} edge={edges[0]} graph={graph} apply={apply} onDelete={onDelete} />;
  return <MultiProps nodes={nodes} edges={edges} graph={graph} apply={apply} onDelete={onDelete} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-line px-3 py-3" aria-label={title}>
      <h3 className="fm-cap">{title}</h3>
      {children}
    </section>
  );
}

function DeleteButton({ onDelete, what }: { onDelete: () => void; what: string }) {
  return (
    <button type="button" className="fm-btn fm-btn--tool fm-btn--danger justify-self-start" onClick={onDelete}>
      <Trash2 size={14} aria-hidden /> Delete {what}
    </button>
  );
}

function NothingSelected({ graph }: { graph: StudioGraph }) {
  const rows: [string, string][] = [
    ["V · H · A", "Select · Hand · Arrow tool"],
    ["Arrow tool", "Click a component, then another"],
    ["Hand tool, scroll or Space + drag", "Move the canvas"],
    ["F", "Focus mode (full screen)"],
    ["Click / Shift+click", "Select, add to selection"],
    ["Drag on empty canvas", "Box-select (Select tool)"],
    ["Delete", "Delete selection"],
    ["⌘/Ctrl C · V · D", "Copy · paste · duplicate"],
    ["⌘/Ctrl Z · Shift+Z", "Undo · redo (also Ctrl+Y)"],
    ["Arrows (Shift ×10)", "Nudge selection"],
    ["Esc", "Clear selection"],
  ];
  return (
    <div>
      <Section title="Design">
        <p className="text-[15px]">{summaryText(graph)}.</p>
        <p className="fm-help">Select a component or connection to edit it. Draw an arrow with the Arrow tool (A): click one component, then another. You can also drag from the dot on a card&apos;s edge, or use “Connect to” after selecting one.</p>
      </Section>
      <Section title="Keyboard">
        <table className="fm-parts !text-[11px]">
          <tbody>{rows.map(([k, v]) => <tr key={k}><td className="!normal-case">{k}</td><td className="!normal-case">{v}</td></tr>)}</tbody>
        </table>
      </Section>
    </div>
  );
}

function TextField({ label, value, onChange, maxLength = 120, multiline }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number; multiline?: boolean }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="fm-label">{label}</label>
      {multiline ? (
        <textarea id={id} className="fm-input fm-input--mono !h-40 resize-y p-2 !text-[13px] leading-relaxed" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="fm-input !h-9" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/** Keeps the typed text even when it is invalid; only valid numbers reach the graph. */
function NumberField({ spec, value, onValid }: { spec: PropSpec; value: number; onValid: (v: number) => void }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) { setSeen(value); if (Number(text) !== value) setText(String(value)); } // undo/redo or restore changed it
  const parsed = text.trim() === "" ? NaN : Number(text);
  const error = validateProp(spec, parsed);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="fm-label">{spec.label}{spec.unit ? ` (${spec.unit})` : ""}</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          className={`fm-input fm-input--mono !h-9 ${error ? "is-error" : ""}`}
          value={text}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : spec.help ? `${id}-help` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const v = e.target.value.trim() === "" ? NaN : Number(e.target.value);
            if (!validateProp(spec, v)) onValid(v);
          }}
        />
        {spec.unit && <span className="fm-cap w-14 shrink-0">{spec.unit}</span>}
      </div>
      {error ? <p id={`${id}-err`} className="fm-help is-error" role="alert">■ {error} · not applied</p> : spec.help ? <p id={`${id}-help`} className="fm-help">{spec.help}</p> : null}
    </div>
  );
}

function PropField({ spec, value, onChange }: { spec: PropSpec; value: PropValue; onChange: (v: PropValue, coalesce: boolean) => void }) {
  const id = useId();
  if (spec.type === "number") return <NumberField spec={spec} value={typeof value === "number" ? value : Number(spec.default)} onValid={(v) => onChange(v, true)} />;
  if (spec.type === "text") return <TextField label={spec.label} value={String(value)} maxLength={120} onChange={(v) => onChange(v, true)} />;
  if (spec.type === "select") {
    return (
      <div className="grid gap-1.5">
        <label htmlFor={id} className="fm-label">{spec.label}</label>
        <select id={id} className="fm-input !h-9" value={String(value)} onChange={(e) => onChange(e.target.value, false)}>
          {spec.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  const on = value === true;
  return (
    <div className="grid gap-1.5">
      <button type="button" role="switch" aria-checked={on} className="fm-toggle justify-self-start" onClick={() => onChange(!on, false)}>
        <span className="track" aria-hidden /> {spec.label} <span className="state">{on ? "On" : "Off"}</span>
      </button>
      {spec.help && <p className="fm-help">{spec.help}</p>}
    </div>
  );
}

function NodeProps({ node, graph, apply, lessons, onDelete }: { node: StudioNode; graph: StudioGraph; apply: Apply; lessons: Lessons; onDelete: () => void }) {
  const spec = node.kind === "note" ? null : CATALOG[node.kind];
  const lesson = spec ? lessons[spec.sectionId] : undefined;
  const set = (patch: Parameters<typeof updateNode>[2], key?: string) => apply(updateNode(graph, node.id, patch), key, [node.id]);
  return (
    <div>
      <Section title={kindTitle(node)}>
        <div className="flex items-start gap-3">
          <ComponentIcon kind={node.kind} size={40} />
          <p className="fm-help">{spec ? spec.blurb : "A text note on the canvas. Markdown is rendered on the card."}</p>
        </div>
        <TextField label={node.kind === "frame" ? "Frame label" : "Label"} value={node.label} onChange={(v) => set({ label: v }, `label:${node.id}`)} />
        {node.kind === "note" && <TextField label="Note text (Markdown)" multiline maxLength={20_000} value={typeof node.props.text === "string" ? node.props.text : ""} onChange={(v) => set({ props: { text: v } }, `text:${node.id}`)} />}
        {spec?.props.map((p) => (
          <PropField key={p.key} spec={p} value={node.props[p.key] ?? p.default} onChange={(v, coalesce) => set({ props: { [p.key]: v } }, coalesce ? `prop:${node.id}:${p.key}` : undefined)} />
        ))}
        {lesson && <Link href={lesson.href} className="fm-btn fm-btn--tool justify-self-start">Open lesson · {lesson.title} <span aria-hidden>→</span></Link>}
      </Section>
      {spec && runProps(spec.kind).length > 0 && (
        <Section title="Run mode">
          <p className="fm-help">Assumptions for Run mode&apos;s availability and cost estimates.</p>
          {runProps(spec.kind).map((p) => (
            <PropField key={p.key} spec={p} value={node.props[p.key] ?? p.default} onChange={(v, coalesce) => set({ props: { [p.key]: v } }, coalesce ? `prop:${node.id}:${p.key}` : undefined)} />
          ))}
        </Section>
      )}
      {node.kind !== "frame" && <Connections node={node} graph={graph} apply={apply} />}
      <div className="px-3 py-3"><DeleteButton onDelete={onDelete} what={node.kind === "frame" ? "frame" : node.kind === "note" ? "note" : "component"} /></div>
    </div>
  );
}

/** The keyboard path for wiring: pick a target and a kind, then Connect. Also lists this node's connections. */
function Connections({ node, graph, apply }: { node: StudioNode; graph: StudioGraph; apply: Apply }) {
  const id = useId();
  const others = graph.nodes.filter((n) => n.id !== node.id && n.kind !== "frame");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<EdgeKind>("sync");
  const [msg, setMsg] = useState("");
  const label = (nid: string) => { const n = graph.nodes.find((x) => x.id === nid); return n ? n.label || kindTitle(n) : nid; };
  const mine = graph.edges.filter((e) => e.source === node.id || e.target === node.id);
  const tgt = others.some((o) => o.id === target) ? target : "";
  return (
    <Section title={`Connections · ${mine.length}`}>
      {mine.length > 0 && (
        <ul className="grid gap-1">
          {mine.map((e) => (
            <li key={e.id}>
              <button type="button" className="fm-btn fm-btn--tool w-full !justify-start !normal-case !tracking-normal" onClick={() => apply(graph, undefined, [e.id])} aria-label={`Select ${EDGE_TEXT[e.kind].title} ${e.source === node.id ? "to" : "from"} ${label(e.source === node.id ? e.target : e.source)}`}>
                <span aria-hidden>{e.source === node.id ? "→" : "←"}</span>
                <span className="truncate">{label(e.source === node.id ? e.target : e.source)}</span>
                <span className="ml-auto text-[10px] uppercase tracking-[.12em]">{e.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 ? (
        <div className="grid gap-2">
          <label htmlFor={`${id}-t`} className="fm-label">Connect to</label>
          <select id={`${id}-t`} className="fm-input !h-9" value={tgt} onChange={(e) => { setTarget(e.target.value); setMsg(""); }}>
            <option value="">Choose a component…</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.label || kindTitle(o)} · {kindTitle(o)}</option>)}
          </select>
          <label htmlFor={`${id}-k`} className="fm-label">As</label>
          <select id={`${id}-k`} className="fm-input !h-9" value={kind} onChange={(e) => setKind(e.target.value as EdgeKind)}>
            {EDGE_KINDS.map((k) => <option key={k} value={k}>{EDGE_TEXT[k].title}</option>)}
          </select>
          <button
            type="button"
            className="fm-btn fm-btn--tool justify-self-start"
            disabled={!tgt}
            onClick={() => {
              const r = connect(graph, node.id, tgt, kind);
              if (!r) { setMsg("That connection already exists."); return; }
              apply(r.graph, undefined, [node.id]);
              setMsg(`Connected to ${label(tgt)}.`);
              setTarget("");
            }}
          >
            Connect
          </button>
          <p className="fm-help" role="status">{msg}</p>
        </div>
      ) : (
        <p className="fm-help">Add another component to connect this one to it.</p>
      )}
    </Section>
  );
}

function EdgeProps({ edge, graph, apply, onDelete }: { edge: StudioEdge; graph: StudioGraph; apply: Apply; onDelete: () => void }) {
  const name = (nid: string) => { const n = graph.nodes.find((x) => x.id === nid); return n ? n.label || kindTitle(n) : nid; };
  const set = (patch: Parameters<typeof updateEdge>[2], key?: string) => apply(updateEdge(graph, edge.id, patch), key, [edge.id]);
  const dirId = useId();
  return (
    <div>
      <Section title="Connection">
        <p className="text-[15px]"><b>{name(edge.source)}</b> → <b>{name(edge.target)}</b></p>
        <fieldset className="grid gap-1.5">
          <legend className="fm-label mb-1.5">Kind</legend>
          {EDGE_KINDS.map((k) => (
            <label key={k} className="fm-check">
              <input type="radio" name={`kind-${edge.id}`} checked={edge.kind === k} onChange={() => set({ kind: k })} className="!rounded-full" />
              <span><b className="text-[14px]">{EDGE_TEXT[k].title}</b><br /><span className="fm-help">{EDGE_TEXT[k].hint}</span></span>
            </label>
          ))}
        </fieldset>
        <TextField label="Label" value={edge.label ?? ""} onChange={(v) => set({ label: v }, `elabel:${edge.id}`)} />
        <div className="grid gap-1.5">
          <label htmlFor={dirId} className="fm-label">Arrows</label>
          <select id={dirId} className="fm-input !h-9" value={edge.direction} onChange={(e) => set({ direction: e.target.value as StudioEdge["direction"] })}>
            {DIRECTIONS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </div>
        <button type="button" className="fm-btn fm-btn--tool justify-self-start" onClick={() => apply({ ...graph, edges: graph.edges.map((e) => (e.id === edge.id ? { ...e, source: e.target, target: e.source } : e)) }, undefined, [edge.id])}>
          ⇄ Reverse
        </button>
      </Section>
      <div className="px-3 py-3"><DeleteButton onDelete={onDelete} what="connection" /></div>
    </div>
  );
}

const ALIGN: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
  { mode: "left", label: "Align left", Icon: AlignStartVertical },
  { mode: "center", label: "Align centre", Icon: AlignCenterVertical },
  { mode: "right", label: "Align right", Icon: AlignEndVertical },
  { mode: "top", label: "Align top", Icon: AlignStartHorizontal },
  { mode: "middle", label: "Align middle", Icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom", Icon: AlignEndHorizontal },
];

function MultiProps({ nodes, edges, graph, apply, onDelete }: { nodes: StudioNode[]; edges: StudioEdge[]; graph: StudioGraph; apply: Apply; onDelete: () => void }) {
  const c = counts({ version: 1, nodes, edges: [] });
  const ids = [...nodes.map((n) => n.id), ...edges.map((e) => e.id)];
  const parts = [c.components && `${c.components} component${c.components === 1 ? "" : "s"}`, c.frames && `${c.frames} frame${c.frames === 1 ? "" : "s"}`, c.notes && `${c.notes} note${c.notes === 1 ? "" : "s"}`, edges.length && `${edges.length} connection${edges.length === 1 ? "" : "s"}`].filter(Boolean);
  const kinds = [...new Set(nodes.filter((n) => n.kind !== "note" && n.kind !== "frame").map((n) => n.kind as ComponentKind))];
  return (
    <div>
      <Section title={`${ids.length} selected`}>
        <p className="text-[15px]">{parts.join(", ")}.</p>
        {kinds.length > 0 && <p className="fm-help">{kinds.map((k) => CATALOG[k].title).join(", ")}</p>}
      </Section>
      {nodes.length >= 2 && (
        <Section title="Align">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Align selected">
            {ALIGN.map(({ mode, label, Icon }) => (
              <button key={mode} type="button" className="fm-btn fm-btn--tool !px-2" aria-label={label} title={label} onClick={() => apply(align(graph, ids, mode), undefined, ids)}>
                <Icon size={16} aria-hidden />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Distribute selected">
            <button type="button" className="fm-btn fm-btn--tool" disabled={nodes.length < 3} onClick={() => apply(distribute(graph, ids, "horizontal"), undefined, ids)}>
              <AlignHorizontalDistributeCenter size={16} aria-hidden /> Distribute across
            </button>
            <button type="button" className="fm-btn fm-btn--tool" disabled={nodes.length < 3} onClick={() => apply(distribute(graph, ids, "vertical"), undefined, ids)}>
              <AlignVerticalDistributeCenter size={16} aria-hidden /> Distribute down
            </button>
          </div>
          {nodes.length < 3 && <p className="fm-help">Select 3 or more to distribute.</p>}
        </Section>
      )}
      <div className="px-3 py-3"><DeleteButton onDelete={onDelete} what={`${ids.length} items`} /></div>
    </div>
  );
}
