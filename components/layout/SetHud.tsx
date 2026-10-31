"use client";
import { useEffect } from "react";
import { useHud, type HudState } from "@/lib/ui-store";

/** Puts page-specific values in the shell's HudBar while the page is mounted. */
export function SetHud(props: HudState) {
  const key = JSON.stringify(props);
  useEffect(() => {
    useHud.getState().setHud(JSON.parse(key));
    return () => useHud.getState().setHud(null);
  }, [key]);
  return null;
}
