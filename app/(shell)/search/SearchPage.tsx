"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { SearchHit } from "@/components/layout/CommandPalette";
import { search } from "@/lib/search-client";

export function SearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    let live = true;
    (q.trim() ? search(q) : Promise.resolve([])).then((h) => { if (live) { setHits(h); setSel(0); } });
    router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search", { scroll: false });
    return () => { live = false; };
  }, [q, router]);

  const groups = Object.entries(Object.groupBy(hits, (h) => h.group));
  const open = (h?: SearchHit) => h && (h.href.startsWith("http") ? window.open(h.href, "_blank") : router.push(h.href));

  return (
    <div className="grid max-w-3xl gap-6 px-4 py-8 sm:px-8">
      <div className="fm-field">
        <label htmlFor="q">Search everything</label>
        <input
          id="q"
          className="fm-input"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") open(hits[sel]);
          }}
          placeholder="e.g. stateless, p99, TTL"
        />
        <p className="fm-help" aria-live="polite">{q.trim() ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : "Lessons, glossary, flashcards, case studies and resources."}</p>
      </div>
      {groups.map(([group, items]) => (
        <section key={group} aria-label={group}>
          <h2 className="fm-cap mb-2 border-b border-ink pb-1">{group} · {items!.length}</h2>
          <ul className="grid gap-1">
            {items!.map((h) => {
              const i = hits.indexOf(h);
              return (
                <li key={h.id}>
                  <Link href={h.href} className={`block rounded-[2px] px-2 py-2 no-underline ${i === sel ? "bg-ink text-paper" : "text-ink hover:bg-surface"}`} onMouseEnter={() => setSel(i)}>
                    <span className="font-semibold">{h.title}</span>
                    {h.detail && <span className="block text-[14px] opacity-75">{h.detail}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
