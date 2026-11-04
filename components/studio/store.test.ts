import { beforeEach, describe, expect, it } from "vitest";
import { DexieAdapter, LabDb } from "@/lib/db/adapter";
import { exportData, importData, parseBackup } from "@/lib/db/backup";
import { TEMPLATES } from "@/lib/studio/templates";
import { createDesign, deleteDesign, duplicateDesign, listVersions, saveDesign, SNAPSHOT_EVERY_MS, VERSION_LIMIT } from "./store";

let db: DexieAdapter;
beforeEach(() => { db = new DexieAdapter(new LabDb(`studio-${Math.random()}`)); });

describe("design store", () => {
  it("creates from a template with the framework notes", async () => {
    const t = TEMPLATES[0];
    const d = await createDesign({ template: t }, db);
    expect(d.title).toBe(t.title);
    expect(d.panels.templateId).toBe(t.id);
    expect(d.panels.notes).toContain("## Requirements");
    expect(d.panels.notes).toContain("## Wrap-up");
    expect(await db.get("designs", d.id)).toBeTruthy();
  });

  it("snapshots on save at most once a minute, or when forced, keeping the last 20", async () => {
    const d = await createDesign({}, db);
    const t0 = new Date("2026-01-01T00:00:00Z").getTime();
    let last: number | undefined;
    const at = (ms: number) => new Date(t0 + ms);
    last = (await saveDesign(d, { lastSnapshotAt: last }, db, at(0))).snapshotAt ?? last;
    last = (await saveDesign(d, { lastSnapshotAt: last }, db, at(10_000))).snapshotAt ?? last;
    expect(await listVersions(d.id, db)).toHaveLength(1);
    last = (await saveDesign(d, { lastSnapshotAt: last }, db, at(SNAPSHOT_EVERY_MS))).snapshotAt ?? last;
    await saveDesign(d, { force: true, lastSnapshotAt: last }, db, at(SNAPSHOT_EVERY_MS + 1));
    expect(await listVersions(d.id, db)).toHaveLength(3);
    for (let i = 0; i < 30; i++) await saveDesign(d, { force: true }, db, at(200_000 + i * 1000));
    const vs = await listVersions(d.id, db);
    expect(vs).toHaveLength(VERSION_LIMIT);
    expect(vs[0].createdAt > vs[19].createdAt).toBe(true);
  });

  it("duplicates and deletes (with versions)", async () => {
    const d = await createDesign({ title: "Mine" }, db);
    await saveDesign(d, { force: true }, db);
    const c = await duplicateDesign(d, db);
    expect(c.title).toBe("Mine (copy)");
    await deleteDesign(d.id, db);
    expect(await db.get("designs", d.id)).toBeUndefined();
    expect(await listVersions(d.id, db)).toHaveLength(0);
    expect(await db.get("designs", c.id)).toBeTruthy();
  });

  it("backup export includes design versions, and older exports without the table still import", async () => {
    const d = await createDesign({}, db);
    await saveDesign(d, { force: true }, db);
    const backup = await exportData(db);
    expect(backup.tables.designVersions).toHaveLength(1);
    const other = new DexieAdapter(new LabDb(`studio-b-${Math.random()}`));
    await importData(other, parseBackup(JSON.stringify(backup)), "replace");
    expect(await other.all("designVersions")).toHaveLength(1);
    const old = { app: "sysdesign-lab", version: 1, exportedAt: "2026-01-01", tables: { designs: [d] } };
    const third = new DexieAdapter(new LabDb(`studio-c-${Math.random()}`));
    await importData(third, parseBackup(JSON.stringify(old)), "merge");
    expect(await third.get("designs", d.id)).toBeTruthy();
  });
});
