"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useUi } from "@/lib/ui-store";

export interface SearchHit { id: string; group: string; title: string; href: string; detail?: string }
export type SearchFn = (q: string) => Promise<SearchHit[]>;

let searchImpl: SearchFn = async () => [];
/** Prompt 02 registers the real index here. */
export function registerSearch(fn: SearchFn) { searchImpl = fn; }

export function CommandPalette() {
  const { paletteOpen, set } = useUi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    let live = true;
    (q.trim() ? searchImpl(q) : Promise.resolve([])).then((h) => { if (live) { setHits(h); setSel(0); } });
    return () => { live = false; };
  }, [q]);

  const groups = useMemo(() => Object.entries(Object.groupBy(hits, (h) => h.group)), [hits]);
  const go = (h?: SearchHit) => { if (!h) return; set({ paletteOpen: false }); setQ(""); router.push(h.href); };

  return (
    <Dialog open={paletteOpen} onOpenChange={(o) => set({ paletteOpen: o })}>
      <DialogContent className="top-[15%] translate-y-0 gap-0 p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search lessons, glossary terms, flashcards, case studies and resources.</DialogDescription>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") go(hits[sel]);
          }}
          placeholder="Search lessons, terms, cards…"
          aria-label="Search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="palette-results"
          className="h-12 w-full border-0 border-b border-ink bg-transparent px-4 text-[15px] outline-none"
        />
        <div id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {q.trim() && hits.length === 0 && <p className="fm-cap p-3">No results for “{q}”</p>}
          {!q.trim() && <p className="fm-cap p-3">Type to search · ↑↓ to move · Enter to open</p>}
          {groups.map(([group, items]) => (
            <div key={group} className="pb-2">
              <div className="fm-cap px-2 py-1">{group}</div>
              {items!.map((h) => {
                const i = hits.indexOf(h);
                return (
                  <button
                    key={h.id}
                    role="option"
                    aria-selected={i === sel}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(h)}
                    className={`block w-full rounded-[2px] px-2 py-1.5 text-left ${i === sel ? "bg-ink text-paper" : ""}`}
                  >
                    <span className="font-semibold">{h.title}</span>
                    {h.detail && <span className="block text-[13px] opacity-75">{h.detail}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
