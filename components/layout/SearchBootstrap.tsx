"use client";
import { useEffect } from "react";
import { getAdapter } from "@/lib/db/adapter";
import { addSearchSource, search } from "@/lib/search-client";
import { registerSearch } from "./CommandPalette";

let notesRegistered = false;

export function SearchBootstrap() {
  useEffect(() => {
    if (!notesRegistered) {
      notesRegistered = true;
      // Notes live in IndexedDB, so they are searched at query time, not in the build index.
      addSearchSource(async (q) => {
        const needle = q.toLowerCase();
        return (await getAdapter().all("notes"))
          .filter((n) => n.markdown.toLowerCase().includes(needle))
          .slice(0, 10)
          .map((n) => ({ id: `n:${n.id}`, group: "Notes", title: n.markdown.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80) || "(untitled)", detail: n.pageId, href: n.pageId }));
      });
    }
    registerSearch((q) => search(q, 20));
  }, []);
  return null;
}
