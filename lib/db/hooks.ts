"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { getAdapter } from "./adapter";
import { DEFAULT_SETTINGS, type Settings, type TableName, type Tables } from "./types";

// Reactive reads: useLiveQuery re-runs when the underlying Dexie tables change.
export function useTable<T extends TableName>(table: T): Tables[T][] | undefined {
  return useLiveQuery(() => getAdapter().all(table), [table]);
}

export const useCheckpoints = () => useTable("checkpoints");
export const useQuizAttempts = () => useTable("quizAttempts");
export const useCards = () => useTable("cards");
export const useCardReviews = () => useTable("cardReviews");
export const useNotes = () => useTable("notes");
export const useCompletions = () => useTable("completions");
export const useChallengeResults = () => useTable("challengeResults");

/** undefined while loading, null when the page has no note yet. */
export function useNote(pageId: string) {
  return useLiveQuery(() => getAdapter().get("notes", pageId).then((n) => n ?? null), [pageId]);
}

export function useSettings(): Settings {
  const s = useLiveQuery(() => getAdapter().get("settings", "settings"), []);
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch: Partial<Omit<Settings, "key">>) {
  const db = getAdapter();
  const cur = (await db.get("settings", "settings")) ?? DEFAULT_SETTINGS;
  await db.put("settings", { ...DEFAULT_SETTINGS, ...cur, ...patch, key: "settings" });
}
