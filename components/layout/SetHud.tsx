"use client";
import { useEffect } from "react";
import { useHud, useTutorTopics, type HudState } from "@/lib/ui-store";

/** Puts page-specific values in the shell's HudBar while the page is mounted. */
export function SetHud(props: HudState) {
  const key = JSON.stringify(props);
  useEffect(() => {
    useHud.getState().setHud(JSON.parse(key));
    return () => useHud.getState().setHud(null);
  }, [key]);
  return null;
}

/** Gives the AI Tutor the lesson's topic titles while the page is mounted. */
export function SetTutorTopics({ topics }: { topics: string[] }) {
  const key = JSON.stringify(topics);
  useEffect(() => {
    useTutorTopics.getState().setTopics(JSON.parse(key));
    return () => useTutorTopics.getState().setTopics([]);
  }, [key]);
  return null;
}
