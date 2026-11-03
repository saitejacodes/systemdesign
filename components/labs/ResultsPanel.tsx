"use client";
import type { RunOutcome } from "@/lib/labs/runner";

const Status = ({ ok }: { ok: boolean }) => (
  <span className={`fm-status ${ok ? "fm-status--ok" : "fm-status--over"}`}><span aria-hidden="true">{ok ? "✓" : "✗"}</span>{ok ? "PASS" : "FAIL"}</span>
);

const Block = ({ k, v, err }: { k: string; v: string; err?: boolean }) => (
  <div className="grid gap-0.5">
    <dt className="fm-cap">{k}</dt>
    <dd className={`m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12.5px] ${err ? "text-status-over" : ""}`}>{v}</dd>
  </div>
);

export function summarize(o: RunOutcome | null): string {
  if (!o) return "";
  if (o.kind === "test") {
    const n = o.results.filter((r) => r.passed).length, m = o.results.length;
    return n === m && m > 0 ? `All ${m} tests passed.` : `${n} / ${m} passed.`;
  }
  if (o.kind === "run") return o.error ? "Your program raised an error." : "Program finished.";
  return o.message;
}

/** Test results or program output. The summary line is announced by screen readers. */
export function ResultsPanel({ outcome, busy, status }: { outcome: RunOutcome | null; busy: string | null; status: string | null }) {
  const live = busy ?? summarize(outcome);
  return (
    <section className="fm-card min-w-0" aria-labelledby="lab-results-h">
      <div className="fm-card__head">
        <h2 id="lab-results-h" className="m-0 text-[inherit] font-[inherit]">Results</h2>
        {outcome && "ms" in outcome && <span className="tabular-nums">{outcome.ms.toFixed(1)} ms</span>}
      </div>
      <div className="grid gap-3 p-4">
        {status && <p className="fm-cap" role="status">{status}</p>}
        <p aria-live="polite" className="font-semibold" data-testid="lab-summary">{live || "Run your code or the tests to see results here."}</p>
        {outcome?.kind === "error" && <pre className="m-0 whitespace-pre-wrap font-mono text-[12.5px] text-status-over">{outcome.message}</pre>}
        {outcome?.kind === "run" && (
          <dl className="grid gap-3">
            <Block k="stdout" v={outcome.stdout || "(no output)"} />
            {outcome.error && <Block k="error" v={outcome.error} err />}
          </dl>
        )}
        {outcome?.kind === "test" && (
          <ol className="grid gap-2">
            {outcome.results.map((r, i) => (
              <li key={i} className="border border-line p-3" style={{ borderRadius: 2, borderLeft: `3px solid var(${r.passed ? "--status-ok" : "--status-over"})` }}>
                <details open={!r.passed}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2"><Status ok={r.passed} /><span className="text-[15px]">{r.name}</span></summary>
                  <dl className="mt-2 grid gap-2">
                    {r.input && <Block k="input" v={r.input} />}
                    {r.expected && <Block k="expected" v={r.expected} />}
                    {r.actual && <Block k="actual" v={r.actual} />}
                    {r.stdout && <Block k="stdout" v={r.stdout} />}
                    {r.error && <Block k="error" v={r.error} err />}
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
