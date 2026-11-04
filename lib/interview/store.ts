import { getAdapter, type StorageAdapter } from "@/lib/db/adapter";
import type { Design, InterviewAttempt } from "@/lib/db/types";
import { notesTemplate } from "@/lib/studio/notes";
import { randomId } from "@/lib/studio/serialize";
import { templateById } from "@/lib/studio/templates";
import { EMPTY_GRAPH, StudioGraph } from "@/lib/studio/types";
import { newSession, parseSession, toAttempt } from "./session";
import type { DurationMin, InterviewSession, Mode } from "./types";

// Interview Mode persistence, all through the StorageAdapter. The draft (one per case) holds the session while it runs;
// the attempt's canvas is an ordinary Design marked with panels.interviewCaseId.

export async function loadDraft(caseStudyId: string, db: StorageAdapter = getAdapter()): Promise<InterviewSession | null> {
  const d = await db.get("interviewDrafts", caseStudyId);
  return d ? parseSession(d.session) : null;
}

export async function saveDraft(s: InterviewSession, db: StorageAdapter = getAdapter(), now = new Date()) {
  await db.put("interviewDrafts", { id: s.caseStudyId, caseStudyId: s.caseStudyId, session: s, updatedAt: now.toISOString() });
}

export const discardDraft = (caseStudyId: string, db: StorageAdapter = getAdapter()) => db.delete("interviewDrafts", caseStudyId);

/** Creates the attempt's design (from the case's Studio template if there is one, else blank) and the session. */
export async function startAttempt(
  o: { caseStudyId: string; caseTitle: string; interviewerPrompt: string; mode: Mode; durationMin: DurationMin; hintsOn: boolean; aiOn?: boolean },
  db: StorageAdapter = getAdapter(),
  now = new Date(),
): Promise<InterviewSession> {
  const t = templateById(o.caseStudyId);
  const at = now.toISOString();
  const panels: Record<string, string> = { notes: notesTemplate(o.interviewerPrompt), interviewCaseId: o.caseStudyId };
  if (t) panels.templateId = t.id;
  const design: Design = {
    id: randomId("d"),
    title: `Interview · ${o.caseTitle} · ${now.toLocaleDateString("en-CA")}`.slice(0, 200),
    caseStudyId: o.caseStudyId,
    graph: t?.graph ?? EMPTY_GRAPH,
    panels,
    createdAt: at,
    updatedAt: at,
  };
  await db.put("designs", design);
  const s = newSession({ caseStudyId: o.caseStudyId, designId: design.id, mode: o.mode, durationMin: o.durationMin, hintsOn: o.hintsOn, aiOn: o.aiOn }, now.getTime());
  await saveDraft(s, db, now);
  return s;
}

/** The attempt design's current graph and notes (the editor autosaves them). */
export async function readDesign(designId: string, db: StorageAdapter = getAdapter()): Promise<{ graph: StudioGraph; notes: string; title: string } | null> {
  const d = await db.get("designs", designId);
  if (!d) return null;
  const g = StudioGraph.safeParse(d.graph);
  return { graph: g.success ? g.data : EMPTY_GRAPH, notes: d.panels?.notes ?? "", title: d.title };
}

/** Saves the InterviewAttempt and removes the draft. */
export async function saveAttempt(s: InterviewSession, db: StorageAdapter = getAdapter(), now = new Date()): Promise<InterviewAttempt> {
  const d = await readDesign(s.designId, db);
  const a = toAttempt(s, { graph: d?.graph ?? EMPTY_GRAPH, notes: d?.notes ?? "" }, randomId("ia"), now);
  await db.put("interviewAttempts", a);
  await discardDraft(s.caseStudyId, db);
  return a;
}
