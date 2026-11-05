"use client";
import { useMemo, useState } from "react";
import { ComponentIcon } from "@/components/studio/ComponentIcon";
import { CATALOG } from "@/lib/studio/catalog";
import type { ComponentKind, NodeKind } from "@/lib/studio/types";

export const DRAG_MIME = "application/x-sdl-studio-kind";

const GROUPS: { title: string; kinds: NodeKind[] }[] = [
  { title: "Clients and edge", kinds: ["client", "dns", "cdn", "load-balancer", "api-gateway"] },
  { title: "Compute", kinds: ["service", "worker", "llm-api", "external-api"] },
  { title: "Data", kinds: ["cache", "sql-db", "nosql-db", "shard-group", "object-storage", "search-index", "vector-db"] },
  { title: "Messaging", kinds: ["queue"] },
  { title: "Operations", kinds: ["monitoring"] },
  { title: "Layout", kinds: ["frame", "note"] },
];

const NOTE = { title: "Text note", blurb: "A resizable note on the canvas, written in Markdown.", keywords: ["text", "comment", "annotation", "markdown"] };
const info = (k: NodeKind) => (k === "note" ? NOTE : CATALOG[k as ComponentKind]);

/** Searchable component list. Drag an item onto the canvas, or click / press Enter to add it at the centre of the view. */
export function Palette({ onAdd }: { onAdd: (kind: NodeKind) => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (k: NodeKind) => {
      const i = info(k);
      const hay = [i.title, i.blurb, k, ...i.keywords].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    return GROUPS.map((g) => ({ ...g, kinds: g.kinds.filter(hit) })).filter((g) => g.kinds.length);
  }, [q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-ink p-3">
        <label htmlFor="sdl-pal-q" className="fm-label">Components</label>
        <input id="sdl-pal-q" type="search" className="fm-input mt-1.5 !h-9" placeholder="Search: cache, kafka, s3…" value={q} onChange={(e) => setQ(e.target.value)} aria-describedby="sdl-pal-help" />
        <p id="sdl-pal-help" className="fm-help mt-1.5 !text-[12px]">Drag onto the canvas, or press Enter to add at the centre.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="mb-3">
            <h3 className="fm-cap px-2 pb-1">{g.title}</h3>
            <ul className="grid gap-0.5">
              {g.kinds.map((k) => {
                const i = info(k);
                return (
                  <li key={k}>
                    <button
                      type="button"
                      className="sdl-pal-item"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, k); e.dataTransfer.effectAllowed = "copy"; }}
                      onClick={() => onAdd(k)}
                      title={i.blurb}
                    >
                      <ComponentIcon kind={k} size={32} />
                      <span className="min-w-0">
                        <span className="t"><span className="sr-only">Add </span>{i.title}</span>
                        <span className="b" aria-hidden>{i.blurb}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="fm-cap p-2" role="status">No component matches “{q}”</p>}
      </div>
    </div>
  );
}
