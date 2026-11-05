import type { Metadata } from "next";
import Link from "next/link";
import { ArchitectureFigure } from "@/components/capstone/ArchitectureFigure";
import { CapstoneChecklist } from "@/components/capstone/CapstoneChecklist";
import { CapstoneProgress, StageBadge } from "@/components/capstone/CapstoneProgress";
import { ZipDownload } from "@/components/capstone/ZipDownload";
import { PageHeader } from "@/components/layout/PageHeader";
import { coverageMatrix, getBreakIt, getCapstoneGuides, ZIP_ROOT } from "@/lib/capstone";
import { getSectionById, sectionHref } from "@/lib/content";
import { PHASES } from "@/lib/curriculum";

export const metadata: Metadata = { title: "Capstone" };

const pad = (n: number) => String(n).padStart(2, "0");

export default function Page() {
  const guides = getCapstoneGuides();
  const breakIt = getBreakIt();
  const matrix = coverageMatrix();
  const progress = guides.map((g) => ({ stage: g.meta.stage, ids: g.meta.checkpoints.map((c) => c.id) }));

  return (
    <>
      <PageHeader
        title="Serve an open-weights LLM like a frontier lab"
        lede="A mini inference platform on your own laptop: real model servers, a streaming gateway, tenants and token quotas, routing, caching, a batch queue, dashboards, failure drills and a load test. Eleven stages that use every phase of the course."
      >
        <CapstoneProgress stages={progress} />
      </PageHeader>

      <div className="grid max-w-5xl gap-12 px-4 pb-16 pt-8 sm:px-8">
        <section aria-labelledby="intro-h" className="grid max-w-[68ch] gap-4">
          <h2 id="intro-h" className="fm-h2 max-sm:text-[30px]">This runs on your machine, not in the browser</h2>
          <p>
            Every other lab on this site runs in your browser. This one cannot: it starts real containers. You download the project, run each stage with
            Docker Compose, and use this page as the guide and checklist. Your ticks are saved in this browser.
          </p>
          <ul className="grid list-disc gap-1 pl-6">
            <li>Docker Desktop (or Docker Engine) with Compose v2, and Node.js 22 to run the scripts.</li>
            <li>k6 for stage 10, or its container (the compose file has a loadtest profile).</li>
            <li>About 2 GB of disk for the model files, downloaded and checked against pinned SHA-256 hashes by a script in each stage.</li>
            <li>
              RAM: about 1 GB free for stage 1, and 4 to 6 GB free for the full stack in stages 8 to 10 (three model replicas, a fallback, an embedding
              server, Postgres, Redis, NATS, Prometheus, Grafana and Jaeger). Lower the replica count if your machine has less.
            </li>
            <li>No GPU needed. The models are small (Qwen2.5 0.5B, SmolLM2 135M) and run on CPU with llama.cpp; stage 10 includes an optional NVIDIA GPU override.</li>
          </ul>
          <ZipDownload fileName={`${ZIP_ROOT}.zip`} />
        </section>

        <section aria-labelledby="arch-h" className="grid gap-4">
          <h2 id="arch-h" className="fm-h2 max-sm:text-[30px]">What you will build</h2>
          <ArchitectureFigure />
        </section>

        <section aria-labelledby="stages-h" className="grid gap-4">
          <h2 id="stages-h" className="fm-h2 max-sm:text-[30px]">Stages</h2>
          <p className="max-w-[68ch]">Start with the written design review, then build. Each stage folder is complete on its own, so you can start at any stage.</p>
          <ol className="grid gap-3">
            {guides.map((g) => (
              <li key={g.meta.stage}>
                <Link href={`/capstone/${g.meta.stage}`} className="fm-card flex items-start gap-4 p-4 no-underline" style={{ color: "var(--ink)" }}>
                  <span className="fm-num fm-num--sm shrink-0">{pad(g.meta.stage)}</span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="font-semibold">{g.meta.title}</span>
                    <span className="fm-cap">{g.meta.folder ?? "Written design review"} · about {g.meta.minutes} min</span>
                  </span>
                  <StageBadge ids={g.meta.checkpoints.map((c) => c.id)} />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="coverage-h" className="grid gap-4">
          <h2 id="coverage-h" className="fm-h2 max-sm:text-[30px]">Which phases each stage uses</h2>
          <p className="max-w-[68ch]">Numbers are how many lessons from that phase a stage puts to work. Every phase is used by at least two stages; open a stage to see each link and what it applies.</p>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Coverage matrix, scrolls sideways">
            <table className="fm-parts" aria-label="Coverage matrix: stages by phases">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  {PHASES.map((p) => (
                    <th key={p.n} scope="col" title={p.name}>
                      <span className={`fm-sq fm-sq--${p.n}`}>{p.n}</span>
                      <span className="sr-only">{p.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.stage}>
                    <th scope="row" className="text-left">
                      <Link href={`/capstone/${row.stage}`}>{pad(row.stage)}</Link> <span className="text-ink-muted">{row.title}</span>
                    </th>
                    {row.phases.map((n, i) => (
                      <td key={i} className="text-center fm-mono">{n > 0 ? n : <span className="text-ink-muted" aria-label="none">·</span>}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="text-left">Stages using it</th>
                  {PHASES.map((p) => (
                    <td key={p.n} className="text-center fm-mono">{matrix.filter((r) => r.phases[p.n - 1] > 0).length}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="break-h" className="grid gap-4">
          <h2 id="break-h" className="fm-h2 max-sm:text-[30px]">Break-it checklist</h2>
          <p className="max-w-[68ch]">Eight failure drills to run against the finished stage 10 stack. Each one says what to do, what you should see, and how to fix or contain it.</p>
          <ol className="grid gap-4">
            {breakIt.map((b) => (
              <li key={b.id} className="fm-card grid gap-3 p-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="fm-num fm-num--sm">{pad(b.n)}</span>
                  <h3 className="fm-h4">{b.title}</h3>
                </div>
                <details>
                  <summary className="cursor-pointer fm-cap py-3.5">Steps, what to observe, how to fix</summary>
                  <div className="mt-3 grid max-w-[68ch] gap-3">
                    <ol className="grid list-decimal gap-2 pl-6">
                      {b.steps.map((s, i) => (
                        <li key={i}><code className="break-words">{s}</code></li>
                      ))}
                    </ol>
                    <p><b>Observe.</b> {b.observe}</p>
                    <p><b>Fix.</b> {b.fix}</p>
                    <p className="fm-cap">
                      Concepts:{" "}
                      {b.concepts.map((id, i) => {
                        const s = getSectionById(id);
                        return s ? <span key={id}>{i > 0 && " · "}<Link href={sectionHref(s.meta)}>{s.meta.title}</Link></span> : null;
                      })}
                    </p>
                  </div>
                </details>
                <CapstoneChecklist label={`Break-it ${b.n}`} items={[{ id: b.id, text: `I ran "${b.title}" and saw the expected behaviour.` }]} />
              </li>
            ))}
          </ol>
        </section>

        <p className="fm-cap">{guides.length} stages · {breakIt.length} drills</p>
      </div>
    </>
  );
}
