import { describe, expect, it, vi } from "vitest";
import type { Resource } from "@/lib/content/schemas";
import { buildLibrary, type LibrarySection } from "./library";

vi.mock("server-only", () => ({}));

const res = (id: string, over: Partial<Resource> = {}): Resource => ({ id, title: id.toUpperCase(), kind: "blog", url: `https://example.com/${id}`, why: "w", topicIds: [], free: true, ...over });
const sec = (id: string, phase: 1 | 2 | 3 | 4 | 5 | 6 | 7, order: number, topics: string[], resources: Resource[]): LibrarySection => ({
  meta: { id, phase, order, title: id, slug: id, topics: topics.map((t) => ({ id: t, title: `T ${t}`, depth: "deep" as const })) },
  resources,
});

describe("buildLibrary", () => {
  const sections = [
    sec("p4-b", 4, 1, ["quorum"], [res("ddia", { topicIds: ["quorum"], title: "Designing Data-Intensive Applications" })]),
    sec("p2-a", 2, 1, ["shard", "index"], [res("ddia", { topicIds: ["shard"], title: "Designing Data-Intensive Applications" }), res("btree", { topicIds: ["index"] })]),
  ];

  it("deduplicates by id, merges topicIds and lists sections in curriculum order", () => {
    const { entries, conflicts } = buildLibrary(sections);
    const ddia = entries.filter((e) => e.resource.id === "ddia");
    expect(ddia).toHaveLength(1);
    expect(ddia[0].resource.topicIds.sort()).toEqual(["quorum", "shard"]);
    expect(ddia[0].sectionIds).toEqual(["p2-a", "p4-b"]);
    expect(ddia[0].topics.map((t) => t.title).sort()).toEqual(["T quorum", "T shard"]);
    expect(conflicts).toEqual([]);
  });

  it("derives phases from appearances and from the sections that teach its topics", () => {
    const { entries } = buildLibrary(sections, [res("extra", { topicIds: ["quorum", "nope"] })]);
    expect(entries.find((e) => e.resource.id === "ddia")!.phases).toEqual([2, 4]);
    const extra = entries.find((e) => e.resource.id === "extra")!;
    expect(extra.phases).toEqual([4]);
    expect(extra.sectionIds).toEqual([]);
    expect(extra.topics).toEqual([{ id: "quorum", title: "T quorum" }]);
  });

  it("includes extras, merges an extra that repeats a section id, and sorts by title", () => {
    const { entries } = buildLibrary(sections, [res("aaa", { title: "a first" }), res("btree", { topicIds: ["quorum"] })]);
    expect(entries.map((e) => e.resource.id)).toEqual(["aaa", "btree", "ddia"]);
    expect(entries.find((e) => e.resource.id === "btree")!.phases).toEqual([2, 4]);
  });

  it("folds a second id with the same URL into the first", () => {
    const { entries } = buildLibrary([sec("p1-x", 1, 1, ["t", "u"], [res("one", { url: "https://same.example/", topicIds: ["t"] })]), sec("p2-y", 2, 1, ["v"], [res("two", { url: "https://same.example/", topicIds: ["v"] })])]);
    expect(entries).toHaveLength(1);
    expect(entries[0].resource.id).toBe("one");
    expect(entries[0].sectionIds).toEqual(["p1-x", "p2-y"]);
    expect(entries[0].phases).toEqual([1, 2]);
  });

  it("reports copies of one id that disagree on url or title", () => {
    const { conflicts } = buildLibrary([sec("p1-x", 1, 1, ["t"], [res("r", { url: "https://a.example/" }), res("r", { url: "https://b.example/", title: "Other" })])]);
    expect(conflicts.map((c) => c.field).sort()).toEqual(["title", "url"]);
  });
});

describe("real resource content", () => {
  it("has https URLs, one URL per id, and extras whose topicIds exist", async () => {
    const { getAllSections, getResources } = await import("@/lib/content");
    const sections = getAllSections();
    const extras = getResources();
    expect(extras.length).toBeGreaterThan(0);
    const topics = new Set(sections.flatMap((s) => s.meta.topics.map((t) => t.id)));
    for (const r of extras) for (const t of r.topicIds) expect(topics.has(t), `content/resources.json: ${r.id} topic "${t}"`).toBe(true);

    const all = [...sections.flatMap((s) => s.resources.map((r) => ({ r, where: s.meta.id }))), ...extras.map((r) => ({ r, where: "content/resources.json" }))];
    const insecure = all.filter(({ r }) => !r.url.startsWith("https://")).map(({ r, where }) => `${where}: ${r.id} ${r.url}`);
    expect(insecure).toEqual([]);

    const { conflicts, entries } = buildLibrary(sections, extras);
    expect(conflicts.filter((c) => c.field === "url")).toEqual([]);
    // Extras are only for classics no section already links.
    const sectionUrls = new Set(sections.flatMap((s) => s.resources.map((r) => r.url)));
    const sectionIds = new Set(sections.flatMap((s) => s.resources.map((r) => r.id)));
    for (const r of extras) {
      expect(sectionIds.has(r.id), r.id).toBe(false);
      expect(sectionUrls.has(r.url), r.url).toBe(false);
    }
    for (const e of entries) expect(e.phases.length, `${e.resource.id} has no phase`).toBeGreaterThan(0);
  });
});
