import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CapstoneChecklist } from "@/components/capstone/CapstoneChecklist";
import { CapstoneMdx } from "@/components/capstone/CapstoneMdx";
import { CodeBlock } from "@/components/learn/CodeBlock";
import { getCapstoneGuide, getCapstoneGuides, readStageFile } from "@/lib/capstone";
import { getSectionById, sectionHref } from "@/lib/content";

// One page per stage (0-10), prerendered. The overview at /capstone lists them with progress.
export const dynamicParams = false;

export function generateStaticParams() {
  return getCapstoneGuides().map((g) => ({ stage: String(g.meta.stage) }));
}

export async function generateMetadata({ params }: PageProps<"/capstone/[stage]">): Promise<Metadata> {
  const g = getCapstoneGuide(Number((await params).stage));
  return { title: g ? `Capstone ${g.meta.stage}: ${g.meta.title}` : "Capstone" };
}


const LANG: Record<string, string> = { ts: "ts", js: "js", mjs: "js", json: "json", jsonl: "json", yml: "yaml", yaml: "yaml", sql: "sql", sh: "bash", conf: "nginx", md: "markdown" };
function langOf(file: string): string {
  const base = file.split("/").pop()!;
  if (base === "Dockerfile") return "docker";
  if (base.startsWith(".env")) return "ini";
  return LANG[base.split(".").pop() ?? ""] ?? "text";
}

export default async function Page({ params }: PageProps<"/capstone/[stage]">) {
  const g = getCapstoneGuide(Number((await params).stage));
  if (!g) notFound();
  const { meta } = g;
  const all = getCapstoneGuides();
  const prev = all.find((x) => x.meta.stage === meta.stage - 1);
  const next = all.find((x) => x.meta.stage === meta.stage + 1);
  const changed = new Set(meta.changes.map((c) => c.path));
  const files = meta.folder ? g.files.map((f) => ({ path: f, code: readStageFile(meta.folder!, f), changed: changed.has(f) })) : [];

  return (
    <article className="px-4 pb-16 pt-8 sm:px-8">
      <header className="grid max-w-[68ch] gap-5 pb-8">
        <span className="fm-cap">Capstone stage {meta.stage} of 10 · about {meta.minutes} min</span>
        <h1 className="fm-h1 max-sm:text-[40px]">{meta.title}</h1>
        {meta.folder ? <p className="fm-mono m-0">cd {meta.folder}</p> : <p className="fm-cap m-0">Written design review, no code</p>}
        <p className="text-[18px] leading-relaxed">{meta.goal}</p>
        <p><Link href="/capstone">← All stages</Link></p>
      </header>

      <div className="grid max-w-[80ch] gap-10">
        {meta.changes.length > 0 && (
          <section aria-labelledby="changes-h" className="grid gap-3">
            <h2 id="changes-h" className="fm-h2 max-sm:text-[30px]">Changes</h2>
            <ul className="grid gap-2 fm-mono text-[14px]">
              {meta.changes.map((c) => (
                <li key={c.path} className="grid gap-0.5">
                  <span><b style={{ color: c.change === "added" ? "var(--status-ok)" : c.change === "removed" ? "var(--status-over)" : "var(--cobalt)" }}>{c.change === "added" ? "+" : c.change === "removed" ? "−" : "~"} {c.path}</b> <span className="text-ink-muted">({c.change})</span></span>
                  <span className="font-sans text-[15px] text-ink-muted">{c.note}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {meta.run.length > 0 && (
          <section aria-labelledby="run-h" className="grid gap-3">
            <h2 id="run-h" className="fm-h2 max-sm:text-[30px]">Run</h2>
            {meta.run.map((r) => <CodeBlock key={r.label} code={r.cmd} lang="bash" title={r.label} />)}
          </section>
        )}

        {meta.verify.length > 0 && (
          <section aria-labelledby="verify-h" className="grid gap-3">
            <h2 id="verify-h" className="fm-h2 max-sm:text-[30px]">Verify</h2>
            {meta.verify.map((v) => (
              <div key={v.label}>
                <CodeBlock code={v.cmd} lang="bash" title={v.label} />
                <p className="-mt-3 border-l-2 border-ink pl-3 text-[15px]"><span className="fm-cap">Expect</span> {v.expect}</p>
              </div>
            ))}
          </section>
        )}

        <CapstoneMdx source={g.mdx} />

        <section aria-labelledby="concepts-h" className="grid gap-3">
          <h2 id="concepts-h" className="fm-h2 max-sm:text-[30px]">Concepts used</h2>
          <ul className="grid gap-3">
            {meta.concepts.map((c) => {
              const s = getSectionById(c.sectionId)!;
              return (
                <li key={c.sectionId} className="flex items-start gap-3">
                  <span className={`fm-sq fm-sq--${s.meta.phase} shrink-0`} aria-label={`Phase ${s.meta.phase}`}>{s.meta.phase}</span>
                  <span><Link href={sectionHref(s.meta)} className="font-semibold">{s.meta.title}</Link>: {c.how}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {files.length > 0 && (
          <section aria-labelledby="files-h" className="grid gap-3">
            <h2 id="files-h" className="fm-h2 max-sm:text-[30px]">Files</h2>
            <p className="text-ink-muted">Everything in <code>{meta.folder}/</code>. Files changed in this stage are marked and highlighted. The download on the overview page has every stage.</p>
            <div className="grid gap-2">
              {files.map((f) => (
                <details key={f.path} className="border border-ink px-3 py-2">
                  <summary className="cursor-pointer fm-mono text-[14px]">
                    {f.path} {f.changed && <span className="fm-cap" style={{ color: "var(--cobalt)" }}>· changed in this stage</span>}
                  </summary>
                  {/* Only this stage's changed files are syntax-highlighted; the rest stay plain to keep later stages' pages light. */}
                  <CodeBlock code={f.code} lang={f.changed ? langOf(f.path) : "text"} title={f.path} />
                </details>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="checkpoints-h" className="grid gap-3">
          <h2 id="checkpoints-h" className="fm-h2 max-sm:text-[30px]">Checkpoints</h2>
          <CapstoneChecklist label={`Stage ${meta.stage} checkpoints`} items={meta.checkpoints} />
        </section>
      </div>

      <nav aria-label="Stage navigation" className="mt-12 grid max-w-[80ch] gap-4 border-t border-ink pt-6 sm:grid-cols-2">
        {prev ? <Link className="fm-card p-4 no-underline" style={{ color: "var(--ink)" }} href={`/capstone/${prev.meta.stage}`}><span className="fm-cap">← Stage {prev.meta.stage}</span><span className="mt-1 block font-semibold">{prev.meta.title}</span></Link> : <span />}
        {next && <Link className="fm-card p-4 text-right no-underline" style={{ color: "var(--ink)" }} href={`/capstone/${next.meta.stage}`}><span className="fm-cap">Stage {next.meta.stage} →</span><span className="mt-1 block font-semibold">{next.meta.title}</span></Link>}
      </nav>
    </article>
  );
}
