"use client";
import "@xyflow/react/dist/style.css";
import "./studio.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  applyEdgeChanges, applyNodeChanges, Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type EdgeChange, type NodeChange,
} from "@xyflow/react";
import { Hand, Maximize2, Minimize2, MousePointer2, MoveUpRight, PanelLeft, PanelRight, Pencil, Play, Redo2, Sparkles, Undo2, X } from "lucide-react";
import { SetHud } from "@/components/layout/SetHud";
import { getAdapter } from "@/lib/db/adapter";
import type { Design, DesignVersion } from "@/lib/db/types";
import { CATALOG } from "@/lib/studio/catalog";
import { toSvg } from "@/lib/studio/export-svg";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/studio/history";
import { copySelection, exportJson, fromFlow, pasteClip, toFlow, type Clip, type FlowEdge, type FlowNode } from "@/lib/studio/serialize";
import { defaultProfile } from "@/lib/studio/sim";
import type { TrafficProfile } from "@/lib/studio/sim/types";
import { templateById } from "@/lib/studio/templates";
import { StudioGraph, type NodeKind } from "@/lib/studio/types";
import { downloadBlob, slug, svgToPng } from "./download";
import { ExportMenu, HistoryTab, NotesTab, TitleEditor, timeOf, type ExportKind } from "./EditorParts";
import { edgeTypes, EdgeMarkers, NodeEvents, nodeTypes } from "./nodes";
import { addNode, connect, counts, deleteIds, nudge, reparent, sameGraph, summaryText } from "./ops";
import { DRAG_MIME, Palette } from "./Palette";
import { PropertiesPanel, type Lessons } from "./PropertiesPanel";
import { fmtMs, fmtPct, fmtQps, savedProfile, STATUS_TEXT, type CaseRuns } from "./run/config";
import { RunViewContext, type RunView } from "./run/context";
import { RunInfo } from "./run/RunInfo";
import { ExplainDesign } from "./ExplainDesign";
import { RunPanel } from "./run/RunPanel";
import { fmtClock, RunStrip } from "./run/RunStrip";
import { useRun } from "./run/useRun";
import { createDesign, designGraph, designNotes, listVersions, saveDesign } from "./store";

type Flow = { nodes: FlowNode[]; edges: FlowEdge[] };

// Copy/paste works across designs in this tab.
let CLIPBOARD: { clip: Clip; pastes: number } | null = null;

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const coarseQuery = () => window.matchMedia("(pointer: coarse)");
const subscribeCoarse = (cb: () => void) => { const m = coarseQuery(); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

/** Reuses unchanged node objects (and keeps React Flow's measurements) so an edit doesn't re-measure every node. */
function mergeFlow(prev: Flow, next: Flow): Flow {
  const old = new Map(prev.nodes.map((n) => [n.id, n]));
  const key = (n: FlowNode) => JSON.stringify([n.type, n.position, n.data, n.parentId, n.width, n.height, !!n.selected, n.ariaLabel]);
  const nodes = next.nodes.map((n) => {
    const o = old.get(n.id);
    if (!o) return n;
    if (key(o) === key(n)) return o;
    return o.measured ? { ...n, measured: o.measured } : n;
  });
  const oldE = new Map(prev.edges.map((e) => [e.id, e]));
  const ekey = (e: FlowEdge) => JSON.stringify([e.source, e.target, e.data, !!e.selected, e.ariaLabel]);
  const edges = next.edges.map((e) => { const o = oldE.get(e.id); return o && ekey(o) === ekey(e) ? o : e; });
  return { nodes, edges };
}

/** Creates a design (blank, or from ?template=) and replaces the URL with it: /studio/new is the "new design" route. */
export function NewDesign({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createDesign({ template: templateId ? templateById(templateId) : undefined })
      .then((d) => router.replace(`/studio/${d.id}`))
      .catch((e: Error) => setError(e.message));
  }, [router, templateId]);
  return (
    <div className="grid gap-3 p-8">
      <h1 className="fm-h4">{error ? "Could not create the design" : "Creating design…"}</h1>
      {error && <p className="fm-help is-error" role="alert">■ {error}</p>}
      <Link href="/studio" className="fm-btn fm-btn--tool justify-self-start">← All designs</Link>
    </div>
  );
}

type Load = { s: "loading" } | { s: "missing" } | { s: "broken"; design: Design } | { s: "ready"; design: Design; graph: StudioGraph };

export function DesignEditor({ designId, lessons, caseRuns = {} }: { designId: string; lessons: Lessons; caseRuns?: CaseRuns }) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  useEffect(() => {
    let live = true;
    getAdapter().get("designs", designId).then((d) => {
      if (!live) return;
      if (!d) return setLoad({ s: "missing" });
      const g = designGraph(d);
      setLoad(g ? { s: "ready", design: d, graph: g } : { s: "broken", design: d });
    });
    return () => { live = false; };
  }, [designId]);

  if (load.s === "ready") return <ReactFlowProvider><Editor key={load.design.id} design={load.design} initial={load.graph} lessons={lessons} caseRuns={caseRuns} /></ReactFlowProvider>;
  return (
    <div className="grid gap-3 p-8">
      <h1 className="fm-h4">{load.s === "loading" ? "Loading design…" : load.s === "missing" ? "Design not found" : load.design.title}</h1>
      {load.s === "missing" && <p className="text-ink-muted">There is no design with this id on this device. Designs are saved in this browser only.</p>}
      {load.s === "broken" && <p className="fm-help is-error" role="alert">■ This design&apos;s saved data does not match the Studio format, so it can&apos;t be opened. Restore a backup in Settings, or delete it from the design list.</p>}
      {load.s !== "loading" && <Link href="/studio" className="fm-btn fm-btn--tool justify-self-start">← All designs</Link>}
    </div>
  );
}

/** A component's display name, for the arrow tool's prompts. */
function nodeLabel(graph: StudioGraph, id: string) {
  const n = graph.nodes.find((x) => x.id === id);
  return n ? n.label || CATALOG[n.kind as keyof typeof CATALOG]?.title || "component" : "component";
}

function Editor({ design, initial, lessons, caseRuns }: { design: Design; initial: StudioGraph; lessons: Lessons; caseRuns: CaseRuns }) {
  const rf = useReactFlow<FlowNode, FlowEdge>();
  const coarse = useSyncExternalStore(subscribeCoarse, () => coarseQuery().matches, () => false);

  const [hist, setHistState] = useState<History<StudioGraph>>(() => createHistory(initial));
  const histRef = useRef(hist);
  const [flow, setFlowState] = useState<Flow>(() => toFlow(initial));
  const flowRef = useRef(flow);
  const [title, setTitleState] = useState(design.title);
  const [notes, setNotesState] = useState(designNotes(design));
  const latest = useRef<{ title: string; notes: string; run?: string }>({ title: design.title, notes: designNotes(design), run: design.panels?.run });
  const [mode, setMode] = useState<"edit" | "run">("edit");
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const [runInfo, setRunInfo] = useState(false);
  const [explain, setExplain] = useState(false);
  const [savedRun, setSavedRun] = useState<TrafficProfile | null>(() => savedProfile(design.panels));

  const [save, setSave] = useState<{ state: "saved" | "saving" | "error"; at?: Date; error?: string }>({ state: "saved" });
  const [tab, setTab] = useState<"properties" | "notes" | "history">("properties");
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheet, setSheet] = useState<"palette" | "panel" | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [announce, setAnnounce] = useState("");
  // Canvas tool, as in diagram tools: Select (box-select on empty drag), Hand (drag pans), Arrow (click two components).
  const [tool, setToolState] = useState<"select" | "hand" | "arrow">("select");
  const [arrowFrom, setArrowFrom] = useState<string | null>(null);
  const setTool = useCallback((t: "select" | "hand" | "arrow") => {
    setToolState(t);
    setArrowFrom(null);
    setAnnounce(t === "arrow" ? "Arrow tool. Click the component the arrow starts from." : t === "hand" ? "Hand tool. Drag to move the canvas." : "Select tool");
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(true);
  // Focus mode: the editor fills the window (and the screen, where the browser allows it), with the app chrome hidden.
  const [focus, setFocusState] = useState(false);
  const setFocus = useCallback((on: boolean) => {
    setFocusState(on);
    try {
      if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
      if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch { /* fullscreen not allowed here: the in-window focus layout still applies */ }
  }, []);
  useEffect(() => {
    // Leaving browser full screen (Esc) leaves focus mode too.
    const onChange = () => { if (!document.fullscreenElement) setFocusState(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const focusRef = useRef(focus);
  useEffect(() => { focusRef.current = focus; }, [focus]);
  const arrowFromRef = useRef(arrowFrom);
  useEffect(() => { arrowFromRef.current = arrowFrom; }, [arrowFrom]);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ---- persistence ----
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef(false);
  const lastSnapshot = useRef<number | undefined>(undefined);
  const versions = useLiveQuery(() => listVersions(design.id), [design.id]);
  useEffect(() => { listVersions(design.id).then((v) => { if (v[0] && lastSnapshot.current === undefined) lastSnapshot.current = Date.parse(v[0].createdAt); }); }, [design.id]);

  const flush = useCallback(async (force = false) => {
    clearTimeout(timer.current);
    pending.current = false;
    const panels: Record<string, string> = { ...design.panels, notes: latest.current.notes };
    if (latest.current.run) panels.run = latest.current.run; else delete panels.run;
    const d: Design = { ...design, title: latest.current.title, graph: histRef.current.present, panels };
    try {
      const r = await saveDesign(d, { force, lastSnapshotAt: lastSnapshot.current });
      if (r.snapshotAt) lastSnapshot.current = r.snapshotAt;
      if (!pending.current) setSave({ state: "saved", at: new Date() });
    } catch (e) {
      setSave({ state: "error", error: (e as Error).message });
    }
  }, [design]);
  const scheduleSave = useCallback(() => {
    pending.current = true;
    setSave({ state: "saving" });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }, [flush]);
  useEffect(() => () => { if (pending.current) void flush(); }, [flush]);
  useEffect(() => {
    const before = () => { if (pending.current) void flush(); };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [flush]);

  // ---- graph state ----
  const setFlow = useCallback((f: Flow) => { flowRef.current = f; setFlowState(f); }, []);
  const setHist = useCallback((h: History<StudioGraph>) => { const changed = h.present !== histRef.current.present; histRef.current = h; setHistState(h); if (changed) scheduleSave(); }, [scheduleSave]);
  const selectedIds = useCallback(() => [...flowRef.current.nodes.filter((n) => n.selected).map((n) => n.id), ...flowRef.current.edges.filter((e) => e.selected).map((e) => e.id)], []);

  /** Commit a new graph (unless nothing changed) and show it, selecting `select` (default: keep the selection). */
  const apply = useCallback((next: StudioGraph, key?: string, select?: string[]) => {
    const sel = new Set(select ?? selectedIds());
    if (!sameGraph(next, histRef.current.present)) setHist(commit(histRef.current, next, { key }));
    setFlow(mergeFlow(flowRef.current, toFlow(histRef.current.present, sel)));
  }, [selectedIds, setFlow, setHist]);

  const doUndo = useCallback(() => { if (!canUndo(histRef.current)) return; setHist(undo(histRef.current)); setFlow(mergeFlow(flowRef.current, toFlow(histRef.current.present, new Set(selectedIds())))); setAnnounce("Undone"); }, [selectedIds, setFlow, setHist]);
  const doRedo = useCallback(() => { if (!canRedo(histRef.current)) return; setHist(redo(histRef.current)); setFlow(mergeFlow(flowRef.current, toFlow(histRef.current.present, new Set(selectedIds())))); setAnnounce("Redone"); }, [selectedIds, setFlow, setHist]);
  const doDelete = useCallback(() => {
    const ids = selectedIds();
    if (!ids.length) return;
    apply(deleteIds(histRef.current.present, ids), undefined, []);
    setAnnounce(`Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}`);
  }, [apply, selectedIds]);
  const doCopy = useCallback(() => {
    const clip = copySelection(histRef.current.present, selectedIds());
    if (!clip) return false;
    CLIPBOARD = { clip, pastes: 0 };
    setAnnounce(`Copied ${clip.nodes.length} item${clip.nodes.length === 1 ? "" : "s"}`);
    return true;
  }, [selectedIds]);
  const doPaste = useCallback(() => {
    if (!CLIPBOARD) return;
    CLIPBOARD.pastes++;
    const r = pasteClip(histRef.current.present, CLIPBOARD.clip, { offset: 32 * CLIPBOARD.pastes });
    if (!r.ids.length) { setAnnounce("Paste would exceed 500 components"); return; }
    apply(r.graph, undefined, r.ids);
    setAnnounce(`Pasted ${CLIPBOARD.clip.nodes.length} item${CLIPBOARD.clip.nodes.length === 1 ? "" : "s"}`);
  }, [apply]);
  const doDuplicate = useCallback(() => {
    const clip = copySelection(histRef.current.present, selectedIds());
    if (!clip) return;
    const r = pasteClip(histRef.current.present, clip, { offset: 32 });
    if (r.ids.length) { apply(r.graph, undefined, r.ids); setAnnounce(`Duplicated ${clip.nodes.length} item${clip.nodes.length === 1 ? "" : "s"}`); }
  }, [apply, selectedIds]);
  const selectAll = useCallback((on: boolean) => {
    const f = flowRef.current;
    setFlow({ nodes: f.nodes.map((n) => (!!n.selected === on ? n : { ...n, selected: on })), edges: f.edges.map((e) => (!!e.selected === on ? e : { ...e, selected: on })) });
  }, [setFlow]);

  const viewCentre = useCallback(() => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }, [rf]);
  const addKind = useCallback((kind: NodeKind, at?: { x: number; y: number }) => {
    const r = addNode(histRef.current.present, kind, at ?? viewCentre());
    apply(r.graph, undefined, [r.id]);
    setSheet(null);
    setAnnounce(`Added ${kind === "note" ? "a note" : CATALOG[kind].title}`);
  }, [apply, viewCentre]);

  // ---- keyboard (capture phase, so arrows nudge here instead of React Flow's built-in 5px move) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      const t = e.target as HTMLElement | null;
      if (!root || !t || !(t === document.body || root.contains(t))) return;
      if (typing(t) || document.querySelector("[role=dialog]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (!mod && !e.altKey && k === "f") { e.preventDefault(); setFocus(!focusRef.current); return; }
      if (modeRef.current === "run") {
        // Run mode is read-only: selection keys only, so arrows and Delete can't move or remove anything.
        if (k === "escape") selectAll(false);
        else if (mod && k === "a") { e.preventDefault(); selectAll(true); }
        else if (/^(arrow|delete|backspace)/.test(k) && !mod) { e.preventDefault(); e.stopPropagation(); }
        return;
      }
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
      if (mod && k === "y") { e.preventDefault(); doRedo(); return; }
      if (mod && k === "c") { if (window.getSelection()?.toString()) return; if (doCopy()) e.preventDefault(); return; }
      if (mod && k === "v") { if (CLIPBOARD) { e.preventDefault(); doPaste(); } return; }
      if (mod && k === "d") { e.preventDefault(); doDuplicate(); return; }
      if (mod && k === "a") { e.preventDefault(); selectAll(true); return; }
      if (mod || e.altKey) return;
      if (k === "delete" || k === "backspace") { if (selectedIds().length) { e.preventDefault(); doDelete(); } return; }
      if (k === "escape") { if (arrowFromRef.current) { setArrowFrom(null); setAnnounce("Arrow cancelled"); } else selectAll(false); return; }
      if (k === "v" || k === "h" || k === "a") { e.preventDefault(); setTool(k === "v" ? "select" : k === "h" ? "hand" : "arrow"); return; }
      const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
      if (dir) {
        const ids = flowRef.current.nodes.filter((n) => n.selected).map((n) => n.id);
        if (!ids.length) return;
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 10 : 1;
        apply(nudge(histRef.current.present, ids, dir[0] * step, dir[1] * step), `nudge:${ids.sort().join(",")}`);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [apply, doCopy, doDelete, doDuplicate, doPaste, doRedo, doUndo, selectAll, selectedIds, setFocus, setTool]);

  // ---- React Flow callbacks ----
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const safe = changes.filter((c) => c.type !== "remove"); // deletes go through doDelete (history)
    setFlow({ ...flowRef.current, nodes: applyNodeChanges(safe, flowRef.current.nodes) });
  }, [setFlow]);
  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    const safe = changes.filter((c) => c.type !== "remove");
    setFlow({ ...flowRef.current, edges: applyEdgeChanges(safe, flowRef.current.edges) });
  }, [setFlow]);
  const commitFromFlow = useCallback((moved: string[] = []) => {
    const f = flowRef.current;
    apply(reparent(fromFlow(f.nodes, f.edges), moved));
  }, [apply]);
  const onConnect = useCallback((c: Connection) => {
    if (modeRef.current === "run") return;
    const r = connect(histRef.current.present, c.source, c.target, "sync");
    if (r) { apply(r.graph, undefined, [r.id]); setAnnounce("Connected"); }
  }, [apply]);
  const onNodeClick = useCallback((_: unknown, node: FlowNode) => {
    if (tool !== "arrow" || modeRef.current === "run") return;
    if (!arrowFrom) { setArrowFrom(node.id); setAnnounce(`Arrow from ${nodeLabel(histRef.current.present, node.id)}. Click where it goes.`); return; }
    if (node.id === arrowFrom) { setArrowFrom(null); setAnnounce("Arrow cancelled"); return; }
    const r = connect(histRef.current.present, arrowFrom, node.id, "sync");
    setArrowFrom(null);
    if (r) { apply(r.graph, undefined, [r.id]); setAnnounce(`Arrow added: ${nodeLabel(histRef.current.present, arrowFrom)} to ${nodeLabel(histRef.current.present, node.id)}`); }
    else setAnnounce("Those two are already connected");
  }, [tool, arrowFrom, apply]);
  const nodeEvents = useMemo(() => ({ resized: () => setTimeout(() => commitFromFlow(), 0) }), [commitFromFlow]);

  // ---- export ----
  const doExport = useCallback(async (k: ExportKind) => {
    const g = histRef.current.present, name = slug(latest.current.title);
    try {
      if (k === "json") {
        downloadBlob(`${name}.json`, new Blob([exportJson({ title: latest.current.title, notes: latest.current.notes, graph: g, caseStudyId: design.caseStudyId })], { type: "application/json" }));
      } else {
        const theme = k.endsWith("blueprint") ? "blueprint" : "paper";
        const svg = toSvg(g, theme, { title: latest.current.title });
        if (k.startsWith("svg")) downloadBlob(`${name}-${theme}.svg`, new Blob([svg], { type: "image/svg+xml" }));
        else downloadBlob(`${name}-${theme}.png`, await svgToPng(svg, 2));
      }
      setAnnounce(`Exported ${k.replace("-", " ").toUpperCase()}`);
    } catch (e) {
      setAnnounce(`Export failed: ${(e as Error).message}`);
    }
  }, [design.caseStudyId]);

  const rename = (t: string) => { setTitleState(t); latest.current.title = t; scheduleSave(); };
  const changeNotes = (v: string) => { setNotesState(v); latest.current.notes = v; scheduleSave(); };
  const restore = (v: DesignVersion) => {
    const r = StudioGraph.safeParse(v.graph);
    if (!r.success) return;
    apply(r.data, undefined, []);
    setAnnounce("Version restored. Undo to go back.");
  };

  const graph = hist.present;
  const caseRun = design.caseStudyId && caseRuns[design.caseStudyId] ? { caseId: design.caseStudyId, ...caseRuns[design.caseStudyId] } : undefined;
  const caseProfile = caseRun?.trafficProfile;
  const baseProfile = useMemo(() => caseProfile ?? defaultProfile(graph), [caseProfile, graph]);
  const profile = savedRun ?? baseProfile;
  const running = mode === "run";
  const run = useRun(graph, profile, running);
  const runView = useMemo<RunView>(() => ({ on: running, state: run.state, faults: run.faults }), [running, run.state, run.faults]);
  const setProfile = (p: TrafficProfile) => { setSavedRun(p); latest.current.run = JSON.stringify(p); scheduleSave(); };
  const resetProfile = () => { setSavedRun(null); latest.current.run = undefined; scheduleSave(); setAnnounce("Traffic reset to the default"); };
  const enterRun = () => { setMode("run"); run.reset(); setSheet(null); setConnecting(false); setArrowFrom(null); setAnnounce("Run mode. Editing is paused. Press Play to send traffic."); };
  const exitRun = () => { setMode("edit"); run.stop(); setSheet(null); setAnnounce("Edit mode"); };
  const selection = useMemo(() => [...flow.nodes.filter((n) => n.selected).map((n) => n.id), ...flow.edges.filter((e) => e.selected).map((e) => e.id)], [flow]);
  const summary = summaryText(graph);
  const c = counts(graph);
  const saveText = save.state === "saving" ? "Saving…" : save.state === "error" ? `Not saved: ${save.error}` : save.at ? `Saved ${timeOf(save.at)}` : "Saved";

  const TABS = [["properties", "Properties"], ["notes", "Notes"], ["history", "History"]] as const;
  const drawer = "max-lg:fixed max-lg:inset-y-0 max-lg:z-40 max-lg:w-[min(340px,88vw)] max-lg:bg-paper max-lg:shadow-[var(--shadow-hard-lg)]";

  return (
    <div ref={rootRef} className={`flex flex-col ${focus ? "fixed inset-0 z-[45] bg-paper" : "h-full min-h-[560px]"}`} data-focus={focus || undefined}>
      {running ? (
        <SetHud live={`Studio · ${title} · Run · ${run.playing ? "running" : "paused"}`} right={`${run.speed}×`} items={[
          { k: "T", v: fmtClock(run.state?.t ?? 0) },
          { k: "Served", v: `${fmtQps(run.state?.totals.okQps ?? 0)}/s` },
          { k: "Errors", v: fmtPct(run.state?.totals.errorRatePct ?? 0, 1), tone: (run.state?.totals.errorRatePct ?? 0) >= 1 ? "over" : "ok" },
          ...(run.state?.requestTypes ?? []).map((r) => ({ k: `${r.name} p99`, v: r.reachable ? fmtMs(r.p99Ms) : "unreachable" })),
        ]} />
      ) : (
        <SetHud live={`Studio · ${title}`} items={[{ k: "Components", v: String(c.components) }, { k: "Links", v: String(c.connections) }]} right={saveText} />
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink px-3 py-2">
        <button type="button" className={`fm-btn fm-btn--tool lg:hidden ${running ? "hidden" : ""}`} aria-expanded={sheet === "palette"} onClick={() => setSheet(sheet === "palette" ? null : "palette")}>
          <PanelLeft size={14} aria-hidden /> Add
        </button>
        <Link href="/studio" className="fm-cap hidden hover:text-ink sm:inline">Studio /</Link>
        <TitleEditor title={title} onRename={rename} />
        <span className={`fm-cap ${save.state === "error" ? "!text-status-over" : ""}`} aria-live="polite" data-testid="save-status">{save.state === "error" ? "■ " : ""}{saveText}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="Mode" className="flex">
            <button type="button" aria-pressed={!running} className={`fm-btn fm-btn--tool !rounded-r-none ${!running ? "is-on" : ""}`} onClick={() => running && exitRun()}><Pencil size={14} aria-hidden /> Edit</button>
            <button type="button" aria-pressed={running} className={`fm-btn fm-btn--tool -ml-px !rounded-l-none ${running ? "is-on" : ""}`} onClick={() => !running && enterRun()}><Play size={14} aria-hidden /> Run</button>
          </div>
          {!running && (
            <div role="group" aria-label="Canvas tool" className="flex">
              {([["select", "Select", "V", MousePointer2], ["hand", "Hand", "H", Hand], ["arrow", "Arrow", "A", MoveUpRight]] as const).map(([id, name, key, Icon], i) => (
                <button key={id} type="button" aria-pressed={tool === id} title={`${name} (${key})`} aria-keyshortcuts={key}
                  className={`fm-btn fm-btn--tool !px-2 ${i > 0 ? "-ml-px !rounded-l-none" : ""} ${i < 2 ? "!rounded-r-none" : ""} ${tool === id ? "is-on" : ""}`} onClick={() => setTool(id)}>
                  <Icon size={14} aria-hidden /><span className="max-xl:sr-only">{name}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className="fm-btn fm-btn--tool !px-2" onClick={doUndo} disabled={running || !canUndo(hist)} aria-label="Undo" title="Undo (Ctrl/⌘+Z)"><Undo2 size={14} aria-hidden /></button>
          <button type="button" className="fm-btn fm-btn--tool !px-2" onClick={doRedo} disabled={running || !canRedo(hist)} aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)"><Redo2 size={14} aria-hidden /></button>
          <button type="button" className="fm-btn fm-btn--tool max-sm:hidden" onClick={() => { void flush(true); setAnnounce("Version saved"); }}>Save version</button>
          <button type="button" className="fm-btn fm-btn--tool" onClick={() => setExplain(true)}><Sparkles size={14} aria-hidden /> Explain</button>
          <ExportMenu onExport={(k) => void doExport(k)} />
          <button type="button" className="fm-btn fm-btn--tool lg:hidden" aria-expanded={sheet === "panel"} onClick={() => setSheet(sheet === "panel" ? null : "panel")}>
            <PanelRight size={14} aria-hidden /> Panel
          </button>
          <button type="button" className={`fm-btn fm-btn--tool max-lg:hidden ${running ? "hidden" : ""}`} aria-expanded={paletteOpen} aria-controls="sdl-palette" onClick={() => setPaletteOpen((o) => !o)}>
            <PanelLeft size={14} aria-hidden /> {paletteOpen ? "Hide palette" : "Show palette"}
          </button>
          <button type="button" className="fm-btn fm-btn--tool max-lg:hidden" aria-expanded={panelOpen} aria-controls="sdl-right" onClick={() => setPanelOpen((o) => !o)}>
            <PanelRight size={14} aria-hidden /> {panelOpen ? "Hide panel" : "Show panel"}
          </button>
          <button type="button" className={`fm-btn fm-btn--tool ${focus ? "is-on" : ""}`} aria-pressed={focus} title="Focus mode (F)" aria-keyshortcuts="F" onClick={() => setFocus(!focus)}>
            {focus ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}<span className="max-sm:sr-only">{focus ? "Exit focus" : "Focus"}</span>
          </button>
        </div>
      </div>
      {running && <RunStrip run={run} onInfo={() => setRunInfo(true)} />}
      <RunInfo open={runInfo} onOpenChange={setRunInfo} />
      <ExplainDesign open={explain} onOpenChange={setExplain} graph={graph} profile={profile} title={title} />

      <div className="relative flex min-h-0 flex-1">
        {sheet && <button type="button" aria-label="Close drawer" className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setSheet(null)} />}
        <aside id="sdl-palette" aria-label="Component palette" className={`flex w-[248px] shrink-0 flex-col border-r border-ink ${drawer} max-lg:left-0 ${paletteOpen ? "" : "lg:hidden"} ${sheet === "palette" ? "" : "max-lg:hidden"} ${running ? "!hidden" : ""}`}>
          <div className="flex justify-end p-1 lg:hidden"><button type="button" className="fm-btn fm-btn--tool !px-2" aria-label="Close palette" onClick={() => setSheet(null)}><X size={14} aria-hidden /></button></div>
          <Palette onAdd={(k) => addKind(k)} />
        </aside>

        <section
          ref={canvasRef}
          aria-label="Design canvas"
          aria-describedby="sdl-canvas-help"
          className="relative min-w-0 flex-1"
          onDragOver={(e) => { if (!running && e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
          onDrop={(e) => {
            const kind = e.dataTransfer.getData(DRAG_MIME) as NodeKind;
            if (!kind || running) return;
            e.preventDefault();
            addKind(kind, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
          }}
        >
          <p id="sdl-canvas-help" className="sr-only">
            Diagram canvas. Add components from the palette with Enter. Press V, H or A for the Select, Hand and Arrow tools, and F for focus mode. Tab moves between components; Enter selects one; arrow keys nudge the selection (Shift for 10 pixels); Delete removes it. Edit and connect the selection in the Properties panel.
          </p>
          <EdgeMarkers />
          <RunViewContext.Provider value={runView}>
          <NodeEvents.Provider value={nodeEvents}>
            <ReactFlow<FlowNode, FlowEdge>
              className={`sdl-flow is-tool-${running ? "select" : tool}${connecting || tool === "arrow" ? " is-connecting" : ""}${running ? ` is-run${run.playing ? "" : " is-paused"}` : ""}`}
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={() => setConnecting(true)}
              onConnectEnd={() => setConnecting(false)}
              onNodeDragStop={(_, __, dragged) => { if (!running) commitFromFlow(dragged.map((n) => n.id)); }}
              onNodeClick={onNodeClick}
              nodesDraggable={!running && tool === "select"}
              nodesConnectable={!running}
              connectionMode={ConnectionMode.Loose}
              snapToGrid
              snapGrid={[16, 16]}
              deleteKeyCode={null}
              selectionKeyCode="Shift"
              multiSelectionKeyCode={["Shift", "Meta", "Control"]}
              panActivationKeyCode="Space"
              selectionOnDrag={!coarse && (running || tool === "select")}
              panOnDrag={coarse || (!running && tool !== "select") ? true : [1, 2]}
              panOnScroll={!coarse}
              zoomOnDoubleClick={false}
              minZoom={0.15}
              maxZoom={2}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Lines} gap={32} color="var(--grid)" />
              <MiniMap pannable zoomable ariaLabel="Minimap of the design" nodeStrokeWidth={1} />
              <Controls showInteractive={false} aria-label="Zoom controls" />
            </ReactFlow>
          </NodeEvents.Provider>
          </RunViewContext.Provider>
          {graph.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
              <div className="grid gap-2">
                <p className="fm-h4">Empty canvas</p>
                <p className="fm-help">Add a component from the palette: drag it here, or select it and press Enter. Then press A and click two components to draw an arrow.</p>
              </div>
            </div>
          )}
          <p className="fm-cap pointer-events-none absolute left-3 top-2 bg-paper/80 px-1" data-testid="canvas-summary">{summary}</p>
          {!running && tool === "arrow" && (
            <p className="fm-cap pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-[3px] bg-ink px-2.5 py-1 !text-paper">
              {arrowFrom ? `From ${nodeLabel(hist.present, arrowFrom)}: click where the arrow goes · Esc cancels` : "Arrow: click the component it starts from"}
            </p>
          )}
          {arrowFrom && <style>{`.sdl-flow .react-flow__node[data-id="${arrowFrom.replace(/["\\]/g, "")}"] .sdl-node { border-color: var(--cobalt); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cobalt) 25%, transparent); }`}</style>}
          <p className="sr-only" role="status" aria-live="polite">{announce}</p>
          {running && <p className="sr-only" aria-live="polite" data-testid="run-summary">{runSummary(run.state, run.playing)}</p>}
        </section>

        <aside id="sdl-right" aria-label={running ? "Run panel" : "Properties, notes and history"} className={`flex shrink-0 flex-col border-l border-ink lg:w-[340px] ${panelOpen ? "" : "lg:hidden"} ${drawer} max-lg:right-0 ${sheet === "panel" ? "" : "max-lg:hidden"}`}>
          {running ? (
            <RunPanel graph={graph} run={run} profile={profile} onProfile={setProfile} onResetProfile={resetProfile} selection={selection} caseRun={caseRun} onClose={() => setSheet(null)}
              defaultFrom={caseRun ? `the case study “${caseRun.title}”` : "the Users on this design's clients"} select={(id) => apply(histRef.current.present, undefined, [id])} />
          ) : <>
          <div className="flex items-end gap-2 pl-3 pr-1 pt-2">
            <div role="tablist" aria-label="Panel" className="fm-tabs flex-1">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" id={`sdl-tab-${id}`} aria-controls={`sdl-panel-${id}`} aria-selected={tab === id} className="fm-tab !px-3" onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            <button type="button" className="fm-btn fm-btn--tool mb-1 !px-2 lg:hidden" aria-label="Close panel" onClick={() => setSheet(null)}><X size={14} aria-hidden /></button>
          </div>
          <div role="tabpanel" id={`sdl-panel-${tab}`} aria-labelledby={`sdl-tab-${tab}`} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {tab === "properties" && <PropertiesPanel graph={graph} selection={selection} apply={apply} lessons={lessons} onDelete={doDelete} />}
            {tab === "notes" && <NotesTab notes={notes} onChange={changeNotes} />}
            {tab === "history" && <HistoryTab versions={versions} onRestore={restore} onSaveVersion={() => { void flush(true); setAnnounce("Version saved"); }} />}
          </div>
          </>}
        </aside>
      </div>
    </div>
  );
}

/** One sentence for screen readers; it only changes when the picture does (status counts, errors present), not every tick. */
function runSummary(state: ReturnType<typeof useRun>["state"], playing: boolean): string {
  if (!state) return "";
  const counts = { ok: 0, hot: 0, overloaded: 0, down: 0 };
  for (const n of Object.values(state.nodes)) counts[n.status]++;
  const parts = (["down", "overloaded", "hot"] as const).filter((k) => counts[k]).map((k) => `${counts[k]} ${STATUS_TEXT[k].word.toLowerCase()}`);
  const err = state.totals.errorRatePct;
  return `Simulation ${playing ? "running" : "paused"}. ${parts.length ? parts.join(", ") : "All components OK"}. ${err >= 0.05 ? `Errors about ${err >= 10 ? Math.round(err / 5) * 5 : Math.ceil(err)}%.` : "No errors."}`;
}
