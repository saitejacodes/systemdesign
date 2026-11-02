"use client";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ViewProps } from "@/lib/sim/definition";
import { EXERCISES, planNodes, probeWith, runSql, seed, selfCost, type Db, type Exercise, type QueryResult, type SqlConfig, type SqlState, type Verdict } from "./model";

type Status = { kind: "loading"; msg: string } | { kind: "ready" } | { kind: "error"; msg: string };
interface Schema { tables: string[]; columns: string[] }

// The editor follows the site theme (Paper or Blueprint) via the data-theme attribute.
const subscribeTheme = (cb: () => void) => {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
};
const useDark = () => useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === "blueprint", () => false);

/** PGlite is imported here, inside the simulator's own chunk, so it only loads on pages that show this simulator. */
async function openDb(onMsg: (m: string) => void): Promise<Db & { close(): Promise<void> }> {
  onMsg("Loading Postgres (PGlite, about 3 MB)…");
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.waitReady;
  onMsg("Generating 50,000 users, 200,000 posts, 300,000 follows and 100,000 orders…");
  await seed(db as unknown as Db);
  return db as unknown as Db & { close(): Promise<void> };
}

export function SqlView({ state, config, act }: ViewProps<SqlConfig, SqlState>) {
  const db = useRef<(Db & { close(): Promise<void> }) | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading", msg: "Starting…" });
  // State copy of the ref for render; the ref is what async callbacks read.
  const [liveDb, setLiveDb] = useState<Db | null>(null);
  const [sql, setSql] = useState("EXPLAIN ANALYZE SELECT * FROM posts WHERE user_id = 42;");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<{ sql: string; ms: number; ok: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [plain, setPlain] = useState(false);
  const [schema, setSchema] = useState<Schema>({ tables: [], columns: [] });
  const dark = useDark();

  const refreshSchema = useCallback(async () => {
    if (!db.current) return;
    const r = await probeWith(db.current)("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'");
    setSchema({ tables: [...new Set(r.rows.map((x) => String(x.table_name)))], columns: [...new Set(r.rows.map((x) => String(x.column_name)))] });
  }, []);

  const boot = useCallback(async () => {
    setStatus({ kind: "loading", msg: "Starting…" });
    const old = db.current;
    db.current = null;
    setLiveDb(null);
    await old?.close().catch(() => {});
    try {
      db.current = await openDb((msg) => setStatus({ kind: "loading", msg }));
      setLiveDb(db.current);
      setStatus({ kind: "ready" });
      setResult(null);
      setHistory([]);
      await refreshSchema();
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  }, [refreshSchema]);

  useEffect(() => {
    // Boot once per mount; the async work only sets state after awaits.
    void (async () => { await Promise.resolve(); await boot(); })();
    return () => { void db.current?.close().catch(() => {}); db.current = null; };
  }, [boot]);

  const run = useCallback(async (text: string) => {
    if (!db.current || !text.trim()) return;
    setBusy(true);
    const r = await runSql(db.current, text);
    setResult(r);
    setHistory((h) => [{ sql: text.trim().split("\n")[0].slice(0, 70), ms: r.ms, ok: r.ok }, ...h].slice(0, 6));
    setBusy(false);
    if (/\b(create|alter|drop)\b/i.test(text)) await refreshSchema();
  }, [refreshSchema]);

  // Monaco's command captures this ref, so it always runs the latest SQL and selection.
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; }, [run]);
  const schemaRef = useRef(schema);
  useEffect(() => { schemaRef.current = schema; }, [schema]);
  const disposer = useRef<{ dispose(): void } | null>(null);
  useEffect(() => () => disposer.current?.dispose(), []);

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const sel = editor.getSelection();
      const picked = sel && !sel.isEmpty() ? editor.getModel()?.getValueInRange(sel) : undefined;
      void runRef.current(picked || editor.getValue());
    });
    disposer.current?.dispose();
    type Pos = { lineNumber: number; column: number };
    const provider = {
      provideCompletionItems(model: { getWordUntilPosition(p: Pos): { startColumn: number; endColumn: number } }, pos: Pos) {
        const w = model.getWordUntilPosition(pos);
        const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
        const { tables, columns } = schemaRef.current;
        return {
          suggestions: [
            ...tables.map((t) => ({ label: t, kind: monaco.languages.CompletionItemKind.Class, insertText: t, detail: "table", range })),
            ...columns.map((c) => ({ label: c, kind: monaco.languages.CompletionItemKind.Field, insertText: c, detail: "column", range })),
          ],
        };
      },
    };
    disposer.current = monaco.languages.registerCompletionItemProvider("sql", provider);
  };

  if (status.kind !== "ready") {
    return (
      <div className="grid h-72 place-items-center text-center" role="status" aria-live="polite">
        {status.kind === "loading" ? <span className="fm-cap">{status.msg}</span> : (
          <span className="grid gap-2"><span className="fm-help is-error">Couldn&apos;t start the database: {status.msg}</span><button type="button" className="fm-btn fm-btn--tool" onClick={() => void boot()}>Try again</button></span>
        )}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      <Exercises track={config.track} passed={state.passed} last={result} db={liveDb} onPass={(id) => act("pass", id)} onLoad={setSql} />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="fm-btn fm-btn--tool is-on !h-8" disabled={busy} onClick={() => void run(sql)}>{busy ? "Running…" : "Run all"}</button>
          <span className="fm-cap">Ctrl / ⌘ + Enter runs the selection, or everything</span>
          <button type="button" role="switch" aria-checked={plain} className="fm-toggle ml-auto" onClick={() => setPlain(!plain)}><span className="track" /><span className="state">{plain ? "On" : "Off"}</span>Plain editor</button>
          <button type="button" className="fm-btn fm-btn--tool fm-btn--danger !h-8" onClick={() => void boot()}>Reset database</button>
        </div>
        {plain ? (
          <textarea aria-label="SQL" className="fm-input fm-input--mono min-h-40 !text-[13px]" value={sql} onChange={(e) => setSql(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); const t = e.currentTarget; void run(t.selectionStart !== t.selectionEnd ? t.value.slice(t.selectionStart, t.selectionEnd) : t.value); } }} />
        ) : (
          <div className="border border-ink" style={{ borderRadius: 2 }}>
            <Editor height="180px" language="sql" theme={dark ? "vs-dark" : "light"} value={sql} onChange={(v) => setSql(v ?? "")} onMount={onMount}
              loading={<span className="fm-cap">Loading editor…</span>}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, wordWrap: "on", lineNumbers: "on", automaticLayout: true, tabSize: 2 }} />
          </div>
        )}
      </div>
      <Results r={result} />
      {history.length > 0 && (
        <details className="fm-card"><summary className="fm-card__head cursor-pointer">Recent runs · timings</summary>
          <ol className="grid gap-1 p-3 font-mono text-[12px]">{history.map((h, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{h.ok ? "✓" : "✗"} {h.sql}</span><span className="tabular-nums">{h.ms.toFixed(1)} ms</span></li>)}</ol>
        </details>
      )}
    </div>
  );
}

function Exercises({ track, passed, last, db, onPass, onLoad }: { track: SqlConfig["track"]; passed: SqlState["passed"]; last: QueryResult | null; db: Db | null; onPass(id: string): void; onLoad(sql: string): void }) {
  const list = EXERCISES.filter((e) => e.track === track);
  const [openId, setOpenId] = useState<string | null>(null);
  const ex: Exercise = list.find((e) => e.id === openId) ?? list.find((e) => !passed[e.id]) ?? list[0];
  const [hint, setHint] = useState(false);
  const [verdict, setVerdict] = useState<(Verdict & { id: string }) | null>(null);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    if (!db) return;
    setChecking(true);
    const v = await ex.check(last, probeWith(db));
    setChecking(false);
    setVerdict({ ...v, id: ex.id });
    if (v.pass) onPass(ex.id);
  };
  return (
    <section aria-label="Exercises" className="grid gap-3">
      <ol className="flex flex-wrap gap-1.5">
        {list.map((e, i) => (
          <li key={e.id}>
            <button type="button" aria-pressed={e.id === ex.id} className={`fm-btn fm-btn--tool !h-8 ${e.id === ex.id ? "is-on" : ""}`} onClick={() => { setOpenId(e.id); setHint(false); }}>
              {passed[e.id] ? "✓" : `${i + 1}.`} {e.title}
            </button>
          </li>
        ))}
      </ol>
      <div className="fm-card grid gap-2 p-3">
        <h3 className="font-semibold">{ex.title}{passed[ex.id] && <span className="fm-cap ml-2">· passed</span>}</h3>
        <p className="text-[15px]">{ex.goal}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fm-btn fm-btn--tool !h-8" onClick={() => onLoad(ex.starter)}>Load starter</button>
          <button type="button" className="fm-btn fm-btn--tool !h-8" aria-expanded={hint} onClick={() => setHint(!hint)}>Hint</button>
          <button type="button" className="fm-btn fm-btn--tool is-on !h-8" disabled={checking} onClick={() => void check()}>{checking ? "Checking…" : "Check"}</button>
        </div>
        {hint && <p className="fm-help">{ex.hint}</p>}
        {verdict?.id === ex.id && <p role="status" className="text-[14px]" style={{ color: verdict.pass ? "var(--status-ok)" : "var(--status-over)" }}>{verdict.pass ? "✓ " : "✗ "}{verdict.msg}</p>}
      </div>
    </section>
  );
}

function Results({ r }: { r: QueryResult | null }) {
  if (!r) return <p className="fm-help">Results appear here. Try the starter, then press Check.</p>;
  if (!r.ok) return <p role="alert" className="fm-help is-error font-mono">ERROR{r.code ? ` ${r.code}` : ""}: {r.error}</p>;
  if (r.plan) return <PlanTree r={r} />;
  const shown = r.rows.slice(0, 100);
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap">{r.fields.length ? `${r.rows.length.toLocaleString()} row${r.rows.length === 1 ? "" : "s"}` : `${r.affected ?? 0} row${r.affected === 1 ? "" : "s"} affected`} · {r.ms.toFixed(1)} ms{r.rows.length > 100 ? " · first 100 shown" : ""}</figcaption>
      {r.fields.length > 0 && (
        <div className="max-h-72 overflow-auto border border-ink" style={{ borderRadius: 2 }}>
          <table className="w-full font-mono text-[12px]">
            <thead className="sticky top-0 bg-surface"><tr>{r.fields.map((f) => <th key={f} className="border-b border-ink px-2 py-1 text-left">{f}</th>)}</tr></thead>
            <tbody>{shown.map((row, i) => <tr key={i}>{r.fields.map((f) => <td key={f} className="whitespace-nowrap border-b border-line px-2 py-0.5">{cell(row[f])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

const cell = (v: unknown) => (v === null || v === undefined ? "NULL" : v instanceof Date ? v.toISOString().replace("T", " ").slice(0, 19) : typeof v === "object" ? JSON.stringify(v) : String(v));

function PlanTree({ r }: { r: QueryResult }) {
  const flat = planNodes(r.plan!);
  const hottest = flat.reduce((a, b) => (selfCost(b.node) > selfCost(a.node) ? b : a)).node;
  return (
    <figure className="grid gap-1">
      <figcaption className="fm-cap">Query plan · {flat.length} node{flat.length === 1 ? "" : "s"} · {r.ms.toFixed(1)} ms · highlighted node adds the most cost</figcaption>
      <ol className="grid gap-1 font-mono text-[12px]" aria-label="Query plan tree">
        {flat.map(({ node, depth }, i) => {
          const hot = node === hottest && flat.length > 1;
          return (
            <li key={i} style={{ marginLeft: depth * 18, background: hot ? "var(--status-hot-fill)" : undefined, color: hot ? "#121212" : undefined, borderRadius: 2 }} className="border border-ink px-2 py-1">
              <span className="font-semibold">{depth > 0 && "↳ "}{node.type}</span>
              {node.relation && <> on <b>{node.relation}</b></>}{node.index && <> using <b>{node.index}</b></>}
              <span className="block opacity-80">cost {node.startup.toFixed(1)}..{node.total.toFixed(1)} · est {node.rows.toLocaleString()} rows{node.actualRows !== undefined && ` · actual ${node.actualRows.toLocaleString()} rows in ${node.actualMs?.toFixed(2)} ms`}{hot && " · HOT"}</span>
              {node.detail && <span className="block opacity-80">{node.detail}</span>}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
