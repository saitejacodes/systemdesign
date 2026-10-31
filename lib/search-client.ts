"use client";
import MiniSearch from "minisearch";
import { GROUP_ORDER, SEARCH_OPTIONS, type SearchDoc } from "@/lib/content/search-options";
import type { SearchHit } from "@/components/layout/CommandPalette";

let index: Promise<MiniSearch<SearchDoc>> | null = null;
const load = () =>
  (index ??= fetch("/search-index.json").then((r) => r.text()).then((json) => MiniSearch.loadJSON<SearchDoc>(json, SEARCH_OPTIONS)));

/** Extra sources (e.g. notes from IndexedDB, Prompt 03) can add hits here. */
const extra: ((q: string) => Promise<SearchHit[]>)[] = [];
export const addSearchSource = (fn: (q: string) => Promise<SearchHit[]>) => extra.push(fn);

export async function search(q: string, limit = 40): Promise<SearchHit[]> {
  const ms = await load();
  const hits: SearchHit[] = ms.search(q).slice(0, limit).map((r) => ({ id: r.id, group: r.group, title: r.title, detail: r.detail, href: r.href }));
  for (const fn of extra) hits.push(...(await fn(q)));
  return hits.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}
