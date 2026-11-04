import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FRAMEWORK_HEADINGS } from "@/lib/studio/notes";
import { parseCheatSheet, validateCheatSheets, type CheatSheet } from "./cheatsheets";
import { ContentError } from "./parse";

vi.mock("server-only", () => ({}));

const fm = (lines: string[], body = "## Body\n\nText.") => `---\n${lines.join("\n")}\n---\n\n${body}\n`;
const GOOD = ["title: Latency numbers", "summary: One line.", "group: Numbers", "order: 1", "relatedSectionIds: [p1-estimation]"];
const sheet = (slug: string, order: number, related = ["p1-estimation"]): CheatSheet => ({
  slug, body: "x", meta: { title: slug, summary: "s", group: "Numbers", order, relatedSectionIds: related },
});

describe("cheat sheet parsing", () => {
  it("parses valid front matter and keeps the body", () => {
    const s = parseCheatSheet("content/cheatsheets/latency-numbers.mdx", "latency-numbers", fm(GOOD));
    expect(s.slug).toBe("latency-numbers");
    expect(s.meta.group).toBe("Numbers");
    expect(s.meta.relatedSectionIds).toEqual(["p1-estimation"]);
    expect(s.body).toContain("## Body");
  });

  it("names the file and field when front matter is invalid", () => {
    const bad = fm(GOOD.map((l) => (l.startsWith("group") ? "group: Misc" : l)).filter((l) => !l.startsWith("title")));
    expect(() => parseCheatSheet("content/cheatsheets/x.mdx", "x", bad)).toThrow(ContentError);
    try {
      parseCheatSheet("content/cheatsheets/x.mdx", "x", bad);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("content/cheatsheets/x.mdx");
      expect(msg).toContain("title");
      expect(msg).toContain("group");
    }
  });

  it("rejects unknown keys, a non-kebab file name, an empty body and an empty related list", () => {
    expect(() => parseCheatSheet("a.mdx", "a", fm([...GOOD, "extra: 1"]))).toThrow(/extra/);
    expect(() => parseCheatSheet("A_B.mdx", "A_B", fm(GOOD))).toThrow(/lowercase-kebab/);
    expect(() => parseCheatSheet("a.mdx", "a", fm(GOOD, ""))).toThrow(/empty/);
    expect(() => parseCheatSheet("a.mdx", "a", fm(GOOD.map((l) => (l.startsWith("related") ? "relatedSectionIds: []" : l))))).toThrow(/relatedSectionIds/);
  });
});

describe("cheat sheet cross-checks", () => {
  const ids = new Set(["p1-estimation", "p4-high-availability"]);

  it("sorts by order", () => {
    expect(validateCheatSheets([sheet("b", 2), sheet("a", 1)], ids).map((s) => s.slug)).toEqual(["a", "b"]);
  });

  it("rejects duplicate slugs, duplicate orders and unknown section ids", () => {
    expect(() => validateCheatSheets([sheet("a", 1), sheet("a", 2)], ids)).toThrow(/Duplicate cheat sheet slug "a"/);
    expect(() => validateCheatSheets([sheet("a", 1), sheet("b", 1)], ids)).toThrow(/share order 1/);
    expect(() => validateCheatSheets([sheet("a", 1, ["p9-nope"])], ids)).toThrow(/related section "p9-nope" does not exist/);
  });
});

describe("real cheat sheets", async () => {
  const { getCheatSheets, getGlossary, validateAll } = await import("./index");
  const sheets = getCheatSheets();
  const bySlug = (slug: string) => sheets.find((s) => s.slug === slug)!;

  it("load, validate and include the 11 required sheets", () => {
    validateAll();
    expect(sheets.map((s) => s.slug).sort()).toEqual([
      "availability-nines", "caching-strategies", "consistency-models", "database-selection", "estimation", "interview-day-checklist",
      "interview-framework", "latency-numbers", "messaging-semantics", "reliability-patterns", "tradeoffs-glossary",
    ]);
  });

  it("include the interview-day checklist that the final-review lesson links to", () => {
    const lesson = fs.readFileSync(path.join(process.cwd(), "content/phases/phase-7/final-review/lesson.mdx"), "utf8");
    for (const m of lesson.matchAll(/\]\(\/reference\/([a-z0-9-]+)\)/g)) expect(sheets.some((s) => s.slug === m[1]), m[1]).toBe(true);
  });

  it("interview framework sheet uses the seven Studio headings in order and the 45-minute split", () => {
    const body = bySlug("interview-framework").body;
    const at = FRAMEWORK_HEADINGS.map((h) => body.indexOf(`| ${h} |`));
    for (const [i, h] of FRAMEWORK_HEADINGS.entries()) expect(at[i], h).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(body).toContain("5 / 5 / 5 / 5 / 10 / 10 / 5");
  });

  it("tradeoffs glossary has exactly 50 numbered tradeoffs", () => {
    const nums = [...bySlug("tradeoffs-glossary").body.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1]));
    expect(nums).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("use only glossary terms and Callout types that exist", () => {
    const slugs = new Set(getGlossary().map((g) => g.slug));
    for (const s of sheets) {
      for (const m of s.body.matchAll(/<Term slug="([^"]+)"/g)) expect(slugs.has(m[1]), `${s.slug}: ${m[1]}`).toBe(true);
      for (const m of s.body.matchAll(/<Callout[^>]*\btype="([^"]+)"/g)) expect(["info", "warning", "tip", "example", "analogy"], `${s.slug}: ${m[0]}`).toContain(m[1]);
    }
  });
});
