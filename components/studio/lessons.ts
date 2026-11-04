import "server-only";
import { getSectionById, sectionHref } from "@/lib/content";
import { CATALOG } from "@/lib/studio/catalog";
import type { Lessons } from "./PropertiesPanel";

/** sectionId → lesson link for every catalog component, resolved on the server (lessons that don't exist yet are left out). */
export function studioLessons(): Lessons {
  const out: Lessons = {};
  for (const spec of Object.values(CATALOG)) {
    const s = getSectionById(spec.sectionId);
    if (s) out[spec.sectionId] = { href: sectionHref(s.meta), title: s.meta.title };
  }
  return out;
}
