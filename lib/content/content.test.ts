import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ContentError, parseContent } from "./parse";
import * as S from "./schemas";

vi.mock("server-only", () => ({}));

const good = {
  id: "q1", type: "single", prompt: "Pick one", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
  correct: ["a"], explanation: "A is right because it is; B is wrong because it is not.", topicId: "t", difficulty: 1,
};

describe("content validation", () => {
  it("accepts a valid quiz", () => {
    expect(parseContent("quiz.json", JSON.stringify([good]), S.Quiz)).toHaveLength(1);
  });

  it("fails a malformed quiz.json with the file and field named", () => {
    const bad = [{ ...good, correct: ["z"], difficulty: 7 }];
    expect(() => parseContent("content/phases/phase-1/x/quiz.json", JSON.stringify(bad), S.Quiz)).toThrow(ContentError);
    try {
      parseContent("content/phases/phase-1/x/quiz.json", JSON.stringify(bad), S.Quiz);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("content/phases/phase-1/x/quiz.json");
      expect(msg).toContain("0.difficulty");
    }
    expect(() => parseContent("quiz.json", JSON.stringify([{ ...good, correct: ["z"] }]), S.Quiz)).toThrow('0.correct: "z" is not an option id');
  });

  it("rejects scenario questions without a scenario and invalid JSON", () => {
    expect(() => parseContent("q.json", JSON.stringify([{ ...good, type: "scenario" }]), S.Quiz)).toThrow(/scenario/);
    expect(() => parseContent("q.json", "{oops", S.Quiz)).toThrow(/Invalid JSON in q.json/);
  });

  it("all real content loads and meets the §7 volume targets", async () => {
    const { getAllSections, validateAll } = await import("./index");
    validateAll();
    const sections = getAllSections();
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      const where = s.meta.id;
      const words = s.lesson.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
      expect(words, `${where} lesson words`).toBeGreaterThanOrEqual(1500);
      expect(s.quiz.length, `${where} quiz`).toBeGreaterThanOrEqual(8);
      expect(s.quiz.filter((q) => q.type === "scenario").length, `${where} scenarios`).toBeGreaterThanOrEqual(3);
      expect(s.flashcards.length, `${where} flashcards`).toBeGreaterThanOrEqual(10);
      expect(s.checkpoints.length, `${where} checkpoints`).toBeGreaterThanOrEqual(3);
      expect(s.resources.length, `${where} resources`).toBeGreaterThanOrEqual(2);
      const topicIds = new Set(s.meta.topics.map((t) => t.id));
      for (const q of [...s.quiz, ...s.flashcards, ...s.checkpoints]) expect(topicIds.has(q.topicId), `${where} ${q.id} topic ${q.topicId}`).toBe(true);
      for (const m of s.lesson.matchAll(/<Term slug="([^"]+)"/g)) {
        const glossary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content/glossary.json"), "utf8")) as { slug: string }[];
        expect(glossary.some((g) => g.slug === m[1]), `${where} term ${m[1]}`).toBe(true);
      }
    }
  });
});
