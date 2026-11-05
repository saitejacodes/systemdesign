import { describe, expect, it, vi } from "vitest";
import { slugify as rendererSlugify } from "@/components/learn/LessonRenderer";
import { checkLink, componentAttr, extractLinks, headingIds, mdxRefIssues, orphanTerms, sectionStandardIssues, slugify, type RouteIndex } from "./qa";

vi.mock("server-only", () => ({}));

const idx: RouteIndex = {
  staticRoutes: new Set(["/", "/glossary", "/studio", "/simulators/code-labs"]),
  lessons: new Map([["3/cache-failures", new Set(["cache-avalanche"])]]),
  phases: new Set([1, 2, 3]),
  simulators: new Set(["cache"]),
  labs: new Set(["lru-cache"]),
  cases: new Map([["url-shortener", true], ["draft-case", false]]),
  sheets: new Set(["estimation"]),
  capstoneStages: new Set([0, 1]),
  glossary: new Set(["qps"]),
};

describe("content QA checks", () => {
  it("uses the same heading slugs as the lesson renderer", () => {
    for (const h of ["Why prefill is compute-bound, and decode is bandwidth-bound", "`SET` with *NX*", "Cache avalanche"]) expect(slugify(h)).toBe(rendererSlugify(h));
  });

  it("extracts markdown and href links, ignoring code and external links", () => {
    const text = 'See [a](/phase/3/cache-failures#cache-avalanche) and <a href="/studio">x</a>, [ext](https://x.dev) and [proto](//cdn.x).';
    expect(extractLinks(text)).toEqual(["/phase/3/cache-failures#cache-avalanche", "/studio"]);
    expect(extractLinks('"why": "Try [it](/simulators/cache)"')).toEqual(["/simulators/cache"]);
    expect(componentAttr('<Term slug="qps">x</Term>\n```tsx\n<Term slug="in-code" />\n```\n`<Term slug="inline" />`', "Term", "slug")).toEqual(["qps"]);
  });

  it("resolves routes and reports why one does not", () => {
    const ok = ["/", "/studio", "/studio/new?template=x", "/phase/2", "/phase/3/cache-failures#cache-avalanche", "/simulators/cache", "/simulators/code-labs/lru-cache", "/case-studies/url-shortener", "/interview/url-shortener", "/reference/estimation", "/capstone/1", "/glossary#qps"];
    for (const l of ok) expect(checkLink(l, idx), l).toBeNull();
    expect(checkLink("/phase/9", idx)).toMatch(/no sections/);
    expect(checkLink("/phase/3/nope", idx)).toMatch(/no section/);
    expect(checkLink("/phase/3/cache-failures#nope", idx)).toMatch(/no heading/);
    expect(checkLink("/simulators/nope", idx)).toMatch(/registry/);
    expect(checkLink("/simulators/code-labs/nope", idx)).toMatch(/code lab/);
    expect(checkLink("/interview/draft-case", idx)).toMatch(/no rubric/);
    expect(checkLink("/case-studies/nope", idx)).toMatch(/does not exist/);
    expect(checkLink("/capstone/7", idx)).toMatch(/stage/);
    expect(checkLink("/glossary#nope", idx)).toMatch(/glossary term/);
    expect(checkLink("/nowhere", idx)).toBe("no such route");
  });

  it("flags unknown <Term> and <Simulator> references, and orphan terms", () => {
    const issues = mdxRefIssues("x.mdx", '<Term slug="qps">QPS</Term> <Term slug="nope" /> <Simulator id="cache" /> <Simulator id="ghost" />', idx.glossary, idx.simulators);
    expect(issues.map((i) => i.kind)).toEqual(["unknown-term", "unknown-simulator"]);
    expect(orphanTerms(["qps", "rps"], new Set(["qps"]))).toEqual(["rps"]);
  });

  it("checks a section against the §7 standard", () => {
    const n = (k: number, f: (i: number) => object) => Array.from({ length: k }, (_, i) => f(i));
    const full = [
      "## Why it matters", "hook", "## Topic", '<DepthStamp depth="deep" />', '<Figure caption="F">x</Figure>', "### Worked example", "words ".repeat(1600),
      "<TradeoffBox />", "<NotWhenBox />", "## Common misconceptions", "<Misconception />", "<Misconception />", "## Interview angle", "<InterviewAngle />",
      "## Try it", '<Simulator id="cache" />', "[Practice](/studio)", "<CheckpointList />", "<QuizPlayer />", "<FlashcardDeck />", "<ResourceList />",
    ].join("\n\n");
    const base = {
      id: "p3-x", where: "x", lesson: full, simulatorIds: ["cache"], topicIds: ["t"],
      quiz: n(8, (i) => ({ id: `q${i}`, type: i < 3 ? "scenario" : "single", topicId: "t" })) as { id: string; type: string; topicId: string }[],
      flashcards: n(10, (i) => ({ id: `f${i}`, topicId: "t" })) as { id: string; topicId: string }[],
      checkpoints: n(3, (i) => ({ id: `c${i}`, topicId: "t" })) as { id: string; topicId: string }[],
      resources: n(2, (i) => ({ id: `r${i}` })) as { id: string }[],
    };
    expect(sectionStandardIssues(base)).toEqual([]);
    const broken = sectionStandardIssues({ ...base, lesson: full.replace("<NotWhenBox />", "").replace('<Simulator id="cache" />', ""), flashcards: [...base.flashcards, { id: "f0", topicId: "zz" }] });
    expect(broken.filter((i) => i.severity === "error").map((i) => i.message)).toEqual([
      "lesson has no <NotWhenBox>",
      "meta.json lists simulators (cache) but the lesson embeds none",
      'flashcards.json: duplicate id "f0"',
      'flashcards.json: f0 has topicId "zz", not a topic in meta.json',
    ]);
    expect(headingIds(full).has("worked-example")).toBe(true);
  });
});
