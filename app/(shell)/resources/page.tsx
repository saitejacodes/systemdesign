import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getAllSections, getResources, sectionHref } from "@/lib/content";
import { buildLibrary } from "@/lib/resources/library";
import { ResourceLibrary, type LibraryItem, type TopicGroup } from "./ResourceLibrary";

export const metadata: Metadata = { title: "Resources" };

/** Pinned at the top: the books and papers most of the curriculum leans on. */
const CLASSICS = ["ddia", "sre-book", "system-design-primer", "dynamo-paper", "bigtable-paper", "spanner-osdi12", "raft-site"];

export default function Page() {
  const sections = getAllSections();
  const { entries } = buildLibrary(sections, getResources());
  const meta = new Map(sections.map((s) => [s.meta.id, s.meta]));

  const items: LibraryItem[] = entries.map(({ resource: r, phases, sectionIds }) => ({
    id: r.id, title: r.title, author: r.author, kind: r.kind, url: r.url, why: r.why, free: r.free, phases, topicIds: r.topicIds,
    sections: sectionIds.map((id) => { const m = meta.get(id)!; return { href: sectionHref(m), label: `§${m.phase}.${m.order} ${m.title}` }; }),
  }));

  // Topic filter: every topic some resource covers, listed once under the first phase that teaches it.
  const used = new Set(items.flatMap((i) => i.topicIds));
  const seen = new Set<string>();
  const topics: TopicGroup[] = [1, 2, 3, 4, 5, 6, 7].map((phase) => ({
    phase,
    topics: sections.filter((s) => s.meta.phase === phase).flatMap((s) => s.meta.topics).filter((t) => used.has(t.id) && !seen.has(t.id) && seen.add(t.id)).map((t) => ({ id: t.id, title: t.title })),
  }));

  const byId = new Map(items.map((i) => [i.id, i]));
  const classics = CLASSICS.map((id) => byId.get(id)).filter((i): i is LibraryItem => !!i);

  return (
    <>
      <PageHeader code="R-01" spec="Resources" before="Read the" em="sources" after="." lede={`${items.length} books, papers, docs, talks and engineering blogs: every resource linked from a lesson, plus the classics. Filter by phase, topic, kind or cost.`} />
      <Suspense>
        <ResourceLibrary items={items} classics={classics} topics={topics} />
      </Suspense>
    </>
  );
}
