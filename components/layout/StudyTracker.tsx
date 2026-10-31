"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getAdapter } from "@/lib/db/adapter";
import { DEFAULT_SETTINGS } from "@/lib/db/types";
import { dayKey } from "@/lib/learning/plan";

// Pages where time counts as study time.
const LEARNING = /^\/(phase|simulators|flashcards|case-studies|interview|studio|reference|capstone)(\/|$)/;
const IDLE_MS = 60_000;

/** Counts active minutes (tab visible + interaction in the last 60s) into today's StudySession. */
export function StudyTracker() {
  const pathname = usePathname();

  // The plan starts on the first visit unless the learner picks a date in Settings.
  useEffect(() => {
    const db = getAdapter();
    db.get("settings", "settings").then((s) => {
      if (!s?.planStart) db.put("settings", { ...DEFAULT_SETTINGS, ...s, key: "settings", planStart: dayKey() });
    });
  }, []);

  useEffect(() => {
    if (!LEARNING.test(pathname)) return;
    let last = Date.now();
    const poke = () => { last = Date.now(); };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, poke, { passive: true, capture: true }));
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible" || Date.now() - last > IDLE_MS) return;
      const db = getAdapter();
      const date = dayKey();
      const cur = await db.get("studySessions", date);
      const pageIds = cur?.pageIds.includes(pathname) ? cur.pageIds : [...(cur?.pageIds ?? []), pathname];
      await db.put("studySessions", { id: date, date, minutes: (cur?.minutes ?? 0) + 1, pageIds });
    }, 60_000);
    return () => { clearInterval(timer); events.forEach((e) => window.removeEventListener(e, poke, { capture: true })); };
  }, [pathname]);

  return null;
}
