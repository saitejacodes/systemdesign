"use client";
import Link from "next/link";
import { useNotes } from "@/lib/db/hooks";

export function NotesList() {
  const notes = useNotes()?.filter((n) => n.markdown.trim()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section aria-labelledby="notes-h" className="grid gap-3">
      <h2 id="notes-h" className="fm-cap border-b border-ink pb-1">Your notes · {notes?.length ?? 0}</h2>
      {notes?.length === 0 && <p className="text-ink-muted">No notes yet. Open the right panel (press ]) on any page and write.</p>}
      <ul className="grid gap-2">
        {notes?.map((n) => (
          <li key={n.id}>
            <Link href={n.pageId} className="fm-card block p-3 no-underline" style={{ color: "var(--ink)" }}>
              <span className="fm-cap">{n.pageId} · {new Date(n.updatedAt).toLocaleDateString()}</span>
              <span className="mt-1 block line-clamp-2 whitespace-pre-line text-[15px]">{n.markdown}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
