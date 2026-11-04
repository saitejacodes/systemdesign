import type { Options } from "minisearch";

export interface SearchDoc { id: string; group: string; title: string; detail?: string; href: string; text: string }

// Shared by the build-time index and the browser loader (they must match).
export const SEARCH_OPTIONS: Options<SearchDoc> = {
  fields: ["title", "text", "detail"],
  storeFields: ["group", "title", "detail", "href"],
  searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2 },
};

export const GROUP_ORDER = ["Lessons", "Glossary", "Flashcards", "Case studies", "Reference", "Resources", "Notes"];
