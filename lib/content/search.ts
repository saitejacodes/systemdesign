import "server-only";
import MiniSearch from "minisearch";
import { getAllSections, getCaseStudies, getCheatSheets, getGlossary, getResources, sectionHref } from ".";
import { SEARCH_OPTIONS, type SearchDoc } from "./search-options";

const slug = (s: string) => s.toLowerCase().replace(/[`*_]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Strip MDX/JSX/markdown to searchable text.
const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|{}[\]()]/g, " ").replace(/\s+/g, " ").trim();

export function searchDocs(): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const s of getAllSections()) {
    const href = sectionHref(s.meta);
    const num = `${s.meta.phase}.${s.meta.order}`;
    // One document per H2 so results land on the right heading.
    for (const chunk of s.lesson.split(/^## /m).slice(1)) {
      const [title, ...rest] = chunk.split("\n");
      docs.push({ id: `l:${s.meta.id}:${slug(title)}`, group: "Lessons", title: title.trim(), detail: `${num} ${s.meta.title}`, href: `${href}#${slug(title)}`, text: plain(rest.join("\n")).slice(0, 4000) });
    }
    docs.push({ id: `s:${s.meta.id}`, group: "Lessons", title: s.meta.title, detail: `${num} · week ${s.meta.week}`, href, text: s.meta.topics.map((t) => t.title).join(" ") });
    for (const f of s.flashcards) docs.push({ id: `f:${s.meta.id}:${f.id}`, group: "Flashcards", title: f.front, detail: `${num} ${s.meta.title}`, href: `${href}#flashcards-h`, text: f.back });
  }
  for (const g of getGlossary()) docs.push({ id: `g:${g.slug}`, group: "Glossary", title: g.term, detail: g.definition.slice(0, 120), href: `/glossary#${g.slug}`, text: g.definition });
  for (const c of getCaseStudies()) docs.push({ id: `c:${c.meta.id}`, group: "Case studies", title: c.meta.title, detail: c.meta.summary, href: `/case-studies/${c.meta.id}`, text: `${c.meta.interviewerPrompt} ${c.meta.deepDiveQuestions.join(" ")}` });
  for (const sh of getCheatSheets()) docs.push({ id: `cs:${sh.slug}`, group: "Reference", title: sh.meta.title, detail: sh.meta.summary, href: `/reference/${sh.slug}`, text: plain(sh.body).slice(0, 4000) });
  const res = [...getResources(), ...getAllSections().flatMap((s) => s.resources)];
  for (const r of new Map(res.map((r) => [r.id, r])).values()) docs.push({ id: `r:${r.id}`, group: "Resources", title: r.title, detail: r.author, href: r.url, text: r.why });
  return docs;
}

export function buildSearchIndex() {
  const ms = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
  ms.addAll(searchDocs());
  return JSON.stringify(ms);
}
