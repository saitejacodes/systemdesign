import Dexie, { type Table } from "dexie";
import type { TableName, Tables } from "./types";

/** Every read/write of user data goes through this, so a remote backend can replace Dexie later. */
export interface StorageAdapter {
  get<T extends TableName>(table: T, key: string | string[]): Promise<Tables[T] | undefined>;
  all<T extends TableName>(table: T): Promise<Tables[T][]>;
  where<T extends TableName>(table: T, index: string, value: string): Promise<Tables[T][]>;
  put<T extends TableName>(table: T, row: Tables[T]): Promise<void>;
  bulkPut<T extends TableName>(table: T, rows: Tables[T][]): Promise<void>;
  delete<T extends TableName>(table: T, key: string | string[]): Promise<void>;
  clear(table: TableName): Promise<void>;
}

export const SCHEMA: Record<TableName, string> = {
  checkpoints: "checkpointId",
  completions: "sectionId",
  quizAttempts: "id, sectionId, finishedAt",
  cards: "cardId, due",
  cardReviews: "id, cardId, at",
  challengeResults: "[simulatorId+challengeId], simulatorId",
  notes: "id, pageId, updatedAt",
  designs: "id, updatedAt",
  interviewAttempts: "id, caseStudyId, createdAt",
  studySessions: "id, date",
  tutorConversations: "id, pageId",
  aiUsage: "month",
  labCode: "id, labId",
  designVersions: "id, designId, createdAt",
  settings: "key",
};

export class LabDb extends Dexie {
  constructor(name = "sysdesign-lab") {
    super(name);
    // Bump the version and add a new .stores() call for every schema change.
    const { labCode: _added, designVersions: _added3, ...v1 } = SCHEMA;
    const { designVersions: _added3b, ...v2 } = SCHEMA;
    void _added; void _added3; void _added3b;
    this.version(1).stores(v1);
    this.version(2).stores(v2); // + labCode (Prompt 16)
    this.version(3).stores(SCHEMA); // + designVersions (Prompt 17)
  }
}

export class DexieAdapter implements StorageAdapter {
  constructor(readonly db: LabDb) {}
  private t<T extends TableName>(name: T) { return this.db.table(name) as Table<Tables[T]>; }
  get<T extends TableName>(table: T, key: string | string[]) { return this.t(table).get(key as never); }
  all<T extends TableName>(table: T) { return this.t(table).toArray(); }
  where<T extends TableName>(table: T, index: string, value: string) { return this.t(table).where(index).equals(value).toArray(); }
  async put<T extends TableName>(table: T, row: Tables[T]) { await this.t(table).put(row); }
  async bulkPut<T extends TableName>(table: T, rows: Tables[T][]) { await this.t(table).bulkPut(rows); }
  async delete<T extends TableName>(table: T, key: string | string[]) { await this.t(table).delete(key as never); }
  async clear(table: TableName) { await this.t(table).clear(); }
}

let adapter: StorageAdapter | null = null;
export function getAdapter(): StorageAdapter {
  return (adapter ??= new DexieAdapter(new LabDb()));
}
/** Tests swap in a fresh database. */
export function setAdapter(a: StorageAdapter) { adapter = a; }
