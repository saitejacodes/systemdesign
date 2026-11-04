import type { Resource, SectionMeta } from "@/lib/content/schemas";

/** The slice of a section the library needs (a full Section from lib/content fits). */
export interface LibrarySection {
  meta: Pick<SectionMeta, "id" | "phase" | "order" | "title" | "slug" | "topics">;
  resources: Resource[];
}

export interface LibraryEntry {
  resource: Resource;
  /** Phases of the sections it appears in plus the phases of sections that teach its topics. Sorted. */
  phases: number[];
  /** Sections whose resources.json lists it, in curriculum order. */
  sectionIds: string[];
  /** Its topicIds resolved to titles (first section that defines each id wins). Unknown ids are dropped. */
  topics: { id: string; title: string }[];
}

/** A resource id whose copies disagree on url or title. */
export interface LibraryConflict { id: string; field: "url" | "title"; values: string[] }

/** Kind order for display: books and papers first, then free reading, docs, blogs, video and repos. */
export const KIND_ORDER: Resource["kind"][] = ["book", "free-book", "paper", "docs", "blog", "video", "repo"];

/**
 * Merge every section's resources (deduplicated by id, and by URL when two ids link the same page; topicIds unioned; the first copy in curriculum order
 * supplies title, url, why and the rest) with the top-level extras, and derive phases from where each
 * resource appears and which sections teach its topics. Sorted by title. Pure: no fs.
 */
export function buildLibrary(sections: LibrarySection[], extras: Resource[] = []): { entries: LibraryEntry[]; conflicts: LibraryConflict[] } {
  const ordered = [...sections].sort((a, b) => a.meta.phase - b.meta.phase || a.meta.order - b.meta.order);

  const topicPhases = new Map<string, Set<number>>();
  const topicTitle = new Map<string, string>();
  for (const s of ordered)
    for (const t of s.meta.topics) {
      if (!topicPhases.has(t.id)) topicPhases.set(t.id, new Set());
      topicPhases.get(t.id)!.add(s.meta.phase);
      if (!topicTitle.has(t.id)) topicTitle.set(t.id, t.title);
    }

  const byId = new Map<string, { resource: Resource; topicIds: Set<string>; sectionIds: string[]; phases: Set<number>; urls: Set<string>; titles: Set<string> }>();
  // Two ids with one URL are the same thing filed twice: fold the later id into the first.
  const idByUrl = new Map<string, string>();
  const add = (r: Resource, section?: LibrarySection["meta"]) => {
    const key = byId.has(r.id) ? r.id : (idByUrl.get(r.url) ?? r.id);
    if (!idByUrl.has(r.url)) idByUrl.set(r.url, key);
    let e = byId.get(key);
    if (!e) {
      e = { resource: r, topicIds: new Set(), sectionIds: [], phases: new Set(), urls: new Set(), titles: new Set() };
      byId.set(key, e);
    }
    r.topicIds.forEach((t) => e.topicIds.add(t));
    e.urls.add(r.url);
    e.titles.add(r.title);
    if (section) {
      if (!e.sectionIds.includes(section.id)) e.sectionIds.push(section.id);
      e.phases.add(section.phase);
    }
  };
  for (const s of ordered) for (const r of s.resources) add(r, s.meta);
  for (const r of extras) add(r);

  const conflicts: LibraryConflict[] = [];
  const entries: LibraryEntry[] = [];
  for (const [id, e] of byId) {
    if (e.urls.size > 1) conflicts.push({ id, field: "url", values: [...e.urls] });
    if (e.titles.size > 1) conflicts.push({ id, field: "title", values: [...e.titles] });
    const topicIds = [...e.topicIds];
    for (const t of topicIds) topicPhases.get(t)?.forEach((p) => e.phases.add(p));
    entries.push({
      resource: { ...e.resource, topicIds },
      phases: [...e.phases].sort((a, b) => a - b),
      sectionIds: e.sectionIds,
      topics: topicIds.filter((t) => topicTitle.has(t)).map((t) => ({ id: t, title: topicTitle.get(t)! })),
    });
  }
  entries.sort((a, b) => a.resource.title.localeCompare(b.resource.title, "en", { sensitivity: "base" }) || a.resource.id.localeCompare(b.resource.id));
  return { entries, conflicts };
}
