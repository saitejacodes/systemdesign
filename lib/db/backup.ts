import { z } from "@/lib/zod";
import type { StorageAdapter } from "./adapter";
import { SCHEMA } from "./adapter";
import type { Settings, TableName, Tables } from "./types";

export const BACKUP_VERSION = 1;
const TABLES = Object.keys(SCHEMA) as TableName[];

export interface Backup { app: "sysdesign-lab"; version: number; exportedAt: string; tables: Partial<{ [T in TableName]: Tables[T][] }> }

/** Every table as one JSON object. The API key never leaves the browser. */
export async function exportData(db: StorageAdapter): Promise<Backup> {
  const tables: Backup["tables"] = {};
  for (const t of TABLES) (tables as Record<string, unknown[]>)[t] = await db.all(t);
  tables.settings = (tables.settings ?? []).map((s) => { const copy: Settings = { ...s }; delete copy.apiKey; return copy; });
  return { app: "sysdesign-lab", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

// Rows are checked for shape at the table level only; each row must be an object.
const BackupSchema = z.object({
  app: z.literal("sysdesign-lab"),
  version: z.number().int().max(BACKUP_VERSION),
  exportedAt: z.string(),
  // partialRecord: exports made before a table existed (e.g. labCode, added in v2 of the schema) still import.
  tables: z.partialRecord(z.enum(TABLES as [TableName, ...TableName[]]), z.array(z.record(z.string(), z.unknown()))),
});

/** Throws a readable error for anything that isn't a SysDesign Lab export. */
export function parseBackup(text: string): Backup {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
  const r = BackupSchema.safeParse(json);
  if (!r.success) throw new Error(`This is not a SysDesign Lab export: ${r.error.issues[0]?.path.join(".") || "root"} ${r.error.issues[0]?.message}`);
  return r.data as unknown as Backup;
}

export const backupCounts = (b: Backup) => TABLES.map((t) => [t, b.tables[t]?.length ?? 0] as const).filter(([, n]) => n > 0);

/** merge: upsert rows by key. replace: clear each table first. The local API key is kept either way. */
export async function importData(db: StorageAdapter, b: Backup, mode: "merge" | "replace") {
  const apiKey = (await db.get("settings", "settings"))?.apiKey;
  for (const t of TABLES) {
    const rows = b.tables[t];
    if (mode === "replace") await db.clear(t);
    if (rows?.length) await db.bulkPut(t, rows as never);
  }
  if (apiKey) {
    const s = await db.get("settings", "settings");
    if (s) await db.put("settings", { ...s, apiKey });
  }
}

/** Clears all progress and user content; keeps settings (theme, plan start, API key). */
export async function resetProgress(db: StorageAdapter) {
  for (const t of TABLES) if (t !== "settings") await db.clear(t);
}
