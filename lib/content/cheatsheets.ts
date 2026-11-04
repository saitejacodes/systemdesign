import matter from "gray-matter";
import { ContentError } from "./parse";
import { CheatSheetMeta } from "./schemas";

/** A reference cheat sheet: validated front matter plus the MDX body. */
export interface CheatSheet {
  slug: string;
  meta: CheatSheetMeta;
  body: string;
}

/** Spec-sheet code shown on the index and the sheet: order 1 → "R-01". */
export const sheetCode = (order: number) => `R-${String(order).padStart(2, "0")}`;

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Parse one sheet's file text; errors name the file and the front-matter field. */
export function parseCheatSheet(file: string, slug: string, text: string): CheatSheet {
  if (!SLUG.test(slug)) throw new ContentError(`${file}: file name "${slug}" must be lowercase-kebab`);
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(text);
  } catch (e) {
    throw new ContentError(`Invalid front matter in ${file}: ${(e as Error).message}`);
  }
  const r = CheatSheetMeta.safeParse(parsed.data);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.length ? i.path.join(".") : "(front matter)"}: ${i.message}`);
    throw new ContentError(`Front matter validation failed in ${file}:\n${lines.join("\n")}`);
  }
  if (!parsed.content.trim()) throw new ContentError(`${file}: sheet body is empty`);
  return { slug, meta: r.data, body: parsed.content };
}

/** Cross-sheet checks: unique slugs and orders, and every related section id exists. Returns the sheets in reading order. */
export function validateCheatSheets(sheets: CheatSheet[], sectionIds: ReadonlySet<string>): CheatSheet[] {
  const slugs = new Set<string>();
  const orders = new Map<number, string>();
  for (const s of sheets) {
    if (slugs.has(s.slug)) throw new ContentError(`Duplicate cheat sheet slug "${s.slug}"`);
    slugs.add(s.slug);
    const other = orders.get(s.meta.order);
    if (other) throw new ContentError(`Cheat sheets "${other}" and "${s.slug}" share order ${s.meta.order}`);
    orders.set(s.meta.order, s.slug);
    for (const id of s.meta.relatedSectionIds) if (!sectionIds.has(id)) throw new ContentError(`content/cheatsheets/${s.slug}.mdx: related section "${id}" does not exist`);
  }
  return [...sheets].sort((a, b) => a.meta.order - b.meta.order);
}
