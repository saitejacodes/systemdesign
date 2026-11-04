import { getAdapter, type StorageAdapter } from "@/lib/db/adapter";
import type { Design, DesignVersion } from "@/lib/db/types";
import { notesTemplate } from "@/lib/studio/notes";
import { randomId, type PortableDesign } from "@/lib/studio/serialize";
import type { StudioTemplate } from "@/lib/studio/templates";
import { EMPTY_GRAPH, StudioGraph } from "@/lib/studio/types";

// Design Studio persistence, all through the StorageAdapter. Design.graph is a StudioGraph; Design.panels holds
// { notes: markdown, templateId?: the template it started from }.

export const VERSION_LIMIT = 20;
/** Autosaves snapshot a version at most this often; "Save version" always does. */
export const SNAPSHOT_EVERY_MS = 60_000;

export const designNotes = (d: Pick<Design, "panels">) => d.panels?.notes ?? "";

/** The design's graph if it is valid, else null (the editor shows the problem instead of overwriting it). */
export function designGraph(d: Pick<Design, "graph">): StudioGraph | null {
  const r = StudioGraph.safeParse(d.graph ?? EMPTY_GRAPH);
  return r.success ? r.data : null;
}

export async function createDesign(opts: { template?: StudioTemplate; imported?: PortableDesign; title?: string } = {}, db: StorageAdapter = getAdapter(), now = new Date()): Promise<Design> {
  const t = opts.template, imp = opts.imported;
  const at = now.toISOString();
  const panels: Record<string, string> = { notes: imp ? imp.notes : notesTemplate(t?.notesIntro) };
  if (t) panels.templateId = t.id;
  const design: Design = {
    id: randomId("d"),
    title: imp?.title ?? opts.title ?? t?.title ?? "Untitled design",
    graph: imp?.graph ?? t?.graph ?? EMPTY_GRAPH,
    panels,
    createdAt: at,
    updatedAt: at,
  };
  const cs = imp?.caseStudyId ?? t?.caseStudyId;
  if (cs) design.caseStudyId = cs;
  await db.put("designs", design);
  return design;
}

export async function duplicateDesign(d: Design, db: StorageAdapter = getAdapter(), now = new Date()): Promise<Design> {
  const at = now.toISOString();
  const copy: Design = { ...d, id: randomId("d"), title: `${d.title} (copy)`.slice(0, 200), panels: { ...d.panels }, createdAt: at, updatedAt: at };
  await db.put("designs", copy);
  return copy;
}

export async function deleteDesign(id: string, db: StorageAdapter = getAdapter()) {
  for (const v of await db.where("designVersions", "designId", id)) await db.delete("designVersions", v.id);
  await db.delete("designs", id);
}

export async function listVersions(designId: string, db: StorageAdapter = getAdapter()): Promise<DesignVersion[]> {
  return (await db.where("designVersions", "designId", designId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Adds a snapshot and drops the oldest beyond VERSION_LIMIT. */
export async function snapshotVersion(d: Pick<Design, "id" | "title" | "graph">, db: StorageAdapter = getAdapter(), now = new Date()): Promise<DesignVersion> {
  const v: DesignVersion = { id: randomId("v"), designId: d.id, createdAt: now.toISOString(), title: d.title, graph: d.graph };
  await db.put("designVersions", v);
  const all = await listVersions(d.id, db);
  for (const old of all.slice(VERSION_LIMIT)) await db.delete("designVersions", old.id);
  return v;
}

/** Saves the design; snapshots a version when `force` or when the last one is at least SNAPSHOT_EVERY_MS old. */
export async function saveDesign(d: Design, opts: { force?: boolean; lastSnapshotAt?: number } = {}, db: StorageAdapter = getAdapter(), now = new Date()): Promise<{ snapshotAt?: number }> {
  await db.put("designs", { ...d, updatedAt: now.toISOString() });
  const due = opts.force || opts.lastSnapshotAt === undefined || now.getTime() - opts.lastSnapshotAt >= SNAPSHOT_EVERY_MS;
  if (!due) return {};
  await snapshotVersion(d, db, now);
  return { snapshotAt: now.getTime() };
}
