"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PhaseSquare } from "@/components/brand";
import type { Resource } from "@/lib/content/schemas";
import { PHASES } from "@/lib/curriculum";
import { KIND_ORDER } from "@/lib/resources/library";

export interface LibraryItem {
  id: string; title: string; author?: string; kind: Resource["kind"]; url: string; why: string; free: boolean;
  phases: number[]; topicIds: string[]; sections: { href: string; label: string }[];
}
export interface TopicGroup { phase: number; topics: { id: string; title: string }[] }

const KIND: Record<Resource["kind"], string> = { book: "Book", "free-book": "Free book", docs: "Docs", blog: "Blog", paper: "Paper", video: "Video", repo: "Repo" };
const COSTS = { free: "Free", paid: "Paid" } as const;
type Cost = keyof typeof COSTS;

interface Filters { q: string; phase: number | null; kind: Resource["kind"] | ""; cost: Cost | ""; topic: string }

function read(p: URLSearchParams): Filters {
  const phase = Number(p.get("phase"));
  const kind = p.get("kind") ?? "";
  const cost = p.get("cost") ?? "";
  return {
    q: p.get("q") ?? "",
    phase: phase >= 1 && phase <= 7 ? phase : null,
    kind: (KIND_ORDER as string[]).includes(kind) ? (kind as Resource["kind"]) : "",
    cost: cost in COSTS ? (cost as Cost) : "",
    topic: p.get("topic") ?? "",
  };
}

function toQuery(f: Filters) {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.phase) p.set("phase", String(f.phase));
  if (f.kind) p.set("kind", f.kind);
  if (f.cost) p.set("cost", f.cost);
  if (f.topic) p.set("topic", f.topic);
  return p.toString();
}

const EMPTY: Filters = { q: "", phase: null, kind: "", cost: "", topic: "" };

function matches(i: LibraryItem, f: Filters) {
  if (f.phase && !i.phases.includes(f.phase)) return false;
  if (f.kind && i.kind !== f.kind) return false;
  if (f.cost && i.free !== (f.cost === "free")) return false;
  if (f.topic && !i.topicIds.includes(f.topic)) return false;
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${i.title} ${i.author ?? ""} ${i.why}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function ResourceLibrary({ items, classics, topics }: { items: LibraryItem[]; classics: LibraryItem[]; topics: TopicGroup[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState<Filters>(() => read(params));
  const set = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch }));

  const query = toQuery(f);
  useEffect(() => {
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [query, pathname, router]);

  const shown = useMemo(() => items.filter((i) => matches(i, f)), [items, f]);
  const active = query !== "";
  const topicGroups = f.phase ? topics.filter((g) => g.phase === f.phase) : topics;

  return (
    <div className="grid gap-8 px-4 py-8 sm:px-8">
      {classics.length > 0 && (
        <section aria-labelledby="classics-h" className="fm-card">
          <div className="fm-card__head"><h2 id="classics-h" className="m-0 text-inherit [font:inherit]">Start here: the classics</h2><span>{classics.length}</span></div>
          <ul className="fm-card__body m-0 grid list-none items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classics.map((c) => (
              <li key={c.id} className="grid min-w-0 gap-1">
                <span className="fm-cap">{KIND[c.kind]} · {c.free ? "Free" : "Paid"}</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="font-semibold [overflow-wrap:anywhere]">{c.title}</a>
                {c.author && <span className="text-[14px] text-ink-muted">{c.author}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="filters-h" className="grid gap-4">
        <h2 id="filters-h" className="sr-only">Filters</h2>
        <div className="fm-field !min-w-0">
          <label htmlFor="rq">Search title, author or why</label>
          <input id="rq" type="search" className="fm-input" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="e.g. Kleppmann, consensus, rate limit" />
        </div>
        <div role="group" aria-labelledby="phase-l" className="grid gap-2">
          <span id="phase-l" className="fm-label">Phase</span>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={`fm-btn fm-btn--tool ${f.phase === null ? "is-on" : ""}`} aria-pressed={f.phase === null} onClick={() => set({ phase: null })}>All</button>
            {PHASES.map((p) => (
              <button key={p.n} type="button" title={p.name} className={`fm-btn fm-btn--tool ${f.phase === p.n ? "is-on" : ""}`} aria-pressed={f.phase === p.n}
                onClick={() => set({ phase: f.phase === p.n ? null : p.n, topic: "" })}>
                <span className="sr-only">Phase </span>{p.n} <span className="max-sm:hidden">{p.short}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="fm-field !min-w-0">
            <label htmlFor="rkind">Kind</label>
            <select id="rkind" className="fm-input" value={f.kind} onChange={(e) => set({ kind: e.target.value as Filters["kind"] })}>
              <option value="">All kinds</option>
              {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
            </select>
          </div>
          <div className="fm-field !min-w-0">
            <label htmlFor="rcost">Cost</label>
            <select id="rcost" className="fm-input" value={f.cost} onChange={(e) => set({ cost: e.target.value as Filters["cost"] })}>
              <option value="">Free and paid</option>
              <option value="free">Free only</option>
              <option value="paid">Paid only</option>
            </select>
          </div>
          <div className="fm-field !min-w-0">
            <label htmlFor="rtopic">Topic</label>
            <select id="rtopic" className="fm-input" value={f.topic} onChange={(e) => set({ topic: e.target.value })}>
              <option value="">All topics</option>
              {f.topic && !topicGroups.some((g) => g.topics.some((t) => t.id === f.topic)) && (
                <option value={f.topic}>{topics.flatMap((g) => g.topics).find((t) => t.id === f.topic)?.title ?? f.topic}</option>
              )}
              {topicGroups.filter((g) => g.topics.length).map((g) => (
                <optgroup key={g.phase} label={`Phase ${g.phase}: ${PHASES[g.phase - 1].name}`}>
                  {g.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink pb-2">
          <p className="fm-cap m-0" role="status" aria-live="polite">{shown.length} of {items.length} resources</p>
          <button type="button" className="fm-btn fm-btn--tool" disabled={!active} onClick={() => setF(EMPTY)}>Clear filters</button>
        </div>
      </section>

      <ol className="m-0 -mt-6 grid list-none p-0" aria-label="Resources">
        {shown.map((r) => (
          <li key={r.id} className="grid min-w-0 gap-1 border-b border-line py-4" data-kind={r.kind}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="fm-cap" data-testid="kind">{KIND[r.kind]}</span>
              <span className="fm-cap">{r.free ? "Free" : "Paid"}</span>
              <span className="flex gap-1">{r.phases.map((p) => <PhaseSquare key={p} n={p} />)}</span>
            </div>
            <h3 className="m-0 text-[18px] font-bold leading-snug [overflow-wrap:anywhere]">
              <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
            </h3>
            {r.author && <p className="m-0 text-[14px] text-ink-muted">{r.author}</p>}
            <p className="m-0 max-w-[75ch] leading-relaxed">{r.why}</p>
            {r.sections.length > 0 && (
              <p className="fm-cap m-0 mt-1 !normal-case !tracking-normal">
                In: {r.sections.map((s, n) => (
                  <span key={s.href}>{n > 0 && " · "}<Link href={s.href}>{s.label}</Link></span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>
      {shown.length === 0 && (
        <p className="-mt-4 text-ink-muted">No resources match these filters. <button type="button" className="underline" onClick={() => setF(EMPTY)}>Clear filters</button></p>
      )}
    </div>
  );
}
