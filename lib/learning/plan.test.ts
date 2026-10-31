import { beforeEach, describe, expect, it } from "vitest";
import { DexieAdapter, LabDb, setAdapter } from "@/lib/db/adapter";
import { exportData, importData, parseBackup, resetProgress } from "@/lib/db/backup";
import { currentWeek, dayKey, lastDays } from "./plan";
import { streak } from "./streaks";

describe("currentWeek", () => {
  const start = new Date(2026, 0, 5, 9); // Monday, 9am
  it("is week 1 on the start day and the 6 days after", () => {
    expect(currentWeek(start, new Date(2026, 0, 5, 1))).toBe(1);
    expect(currentWeek(start, new Date(2026, 0, 11, 23))).toBe(1);
  });
  it("flips at local midnight on day 8", () => expect(currentWeek(start, new Date(2026, 0, 12, 0, 1))).toBe(2));
  it("clamps to 1..16", () => {
    expect(currentWeek(start, new Date(2025, 11, 1))).toBe(1);
    expect(currentWeek(start, new Date(2027, 0, 1))).toBe(16);
  });
  it("crosses a DST change without drifting", () => expect(currentWeek(new Date(2026, 2, 1), new Date(2026, 2, 8))).toBe(2));
  it("lastDays ends today", () => {
    const d = lastDays(3, new Date(2026, 0, 1));
    expect(d).toEqual(["2025-12-30", "2025-12-31", "2026-01-01"]);
  });
});

describe("streak", () => {
  const now = new Date(2026, 4, 10, 15);
  const day = (offset: number, minutes: number) => ({ date: dayKey(new Date(2026, 4, 10 - offset)), minutes });
  it("counts consecutive days with ≥ 10 minutes including today", () => expect(streak([day(0, 12), day(1, 10), day(2, 30), day(4, 50)], now)).toBe(3));
  it("an unfinished today does not break yesterday's streak", () => expect(streak([day(0, 4), day(1, 10), day(2, 11)], now)).toBe(2));
  it("a short day breaks it", () => expect(streak([day(1, 10), day(2, 9), day(3, 30)], now)).toBe(1));
  it("sums multiple sessions on one day", () => expect(streak([day(0, 5), day(0, 5)], now)).toBe(1));
  it("is 0 with no study", () => expect(streak([], now)).toBe(0));
});

describe("backup", () => {
  let db: DexieAdapter;
  beforeEach(() => { db = new DexieAdapter(new LabDb(`b-${Math.random()}`)); setAdapter(db); });

  it("round-trips every table without the API key", async () => {
    await db.put("settings", { key: "settings", theme: "paper", reducedMotion: false, newCardsPerDay: 20, apiKey: "sk-secret" });
    await db.put("notes", { id: "/x", pageId: "/x", markdown: "hi", updatedAt: "2026-01-01" });
    await db.put("checkpoints", { checkpointId: "s:a", done: true, updatedAt: "2026-01-01" });
    const text = JSON.stringify(await exportData(db));
    expect(text).not.toContain("sk-secret");

    const other = new DexieAdapter(new LabDb(`b2-${Math.random()}`));
    await other.put("settings", { key: "settings", theme: "system", reducedMotion: false, newCardsPerDay: 20, apiKey: "sk-local" });
    await other.put("notes", { id: "/y", pageId: "/y", markdown: "keep?", updatedAt: "2026-01-01" });
    await importData(other, parseBackup(text), "replace");
    expect(await other.all("notes")).toHaveLength(1);
    expect((await other.get("checkpoints", "s:a"))?.done).toBe(true);
    const s = await other.get("settings", "settings");
    expect(s?.theme).toBe("paper");
    expect(s?.apiKey).toBe("sk-local");
  });

  it("merge keeps rows that are not in the file", async () => {
    await db.put("notes", { id: "/x", pageId: "/x", markdown: "a", updatedAt: "1" });
    const text = JSON.stringify(await exportData(db));
    const other = new DexieAdapter(new LabDb(`b3-${Math.random()}`));
    await other.put("notes", { id: "/y", pageId: "/y", markdown: "b", updatedAt: "1" });
    await importData(other, parseBackup(text), "merge");
    expect(await other.all("notes")).toHaveLength(2);
  });

  it("rejects files that are not exports", () => {
    expect(() => parseBackup("nope")).toThrow(/not valid JSON/);
    expect(() => parseBackup(JSON.stringify({ app: "other" }))).toThrow(/not a SysDesign Lab export/);
    expect(() => parseBackup(JSON.stringify({ app: "sysdesign-lab", version: 1, exportedAt: "x", tables: { bogus: [] } }))).toThrow();
  });

  it("reset keeps settings", async () => {
    await db.put("settings", { key: "settings", theme: "paper", reducedMotion: false, newCardsPerDay: 20 });
    await db.put("notes", { id: "/x", pageId: "/x", markdown: "a", updatedAt: "1" });
    await resetProgress(db);
    expect(await db.all("notes")).toHaveLength(0);
    expect(await db.get("settings", "settings")).toBeTruthy();
  });
});
