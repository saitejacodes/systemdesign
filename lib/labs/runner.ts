"use client";
import type { LabLang, TestResult } from "./schema";

/** Client-side lab runner: one Web Worker per language, created lazily on the first run. */
export const TIMEOUT_MS = 5000;
export const TIMEOUT_MESSAGE = "Stopped after 5 s: infinite loop or very slow code?";

export type RuntimeStatus = { state: "idle" } | { state: "loading"; detail: string } | { state: "ready" } | { state: "error"; detail: string };
export type RunKind = "run" | "test";
export type RunOutcome =
  | { kind: "test"; results: TestResult[]; ms: number }
  | { kind: "run"; stdout: string; error: string; ms: number }
  | { kind: "timeout"; message: string }
  | { kind: "error"; message: string };

/** The languages that run in the browser (see IN_BROWSER); Java and C++ run on the learner's machine. */
export type BrowserLang = Extract<LabLang, "python" | "javascript" | "typescript">;
const WORKER_URL: Record<BrowserLang, string> = { python: "/labs/py-worker.js", javascript: "/labs/js-worker.js", typescript: "/labs/js-worker.js?lang=ts" };

interface Reply { id: number; ok: boolean; results?: TestResult[]; program?: { stdout: string; error: string }; error?: string; ms: number }
interface Slot { worker: Worker; ready: Promise<void>; pending: Map<number, (r: Reply) => void> }

export class LabRunner {
  private slots: Partial<Record<BrowserLang, Slot>> = {};
  private seq = 0;

  constructor(private onStatus: (lang: BrowserLang, s: RuntimeStatus) => void = () => {}) {}

  private slot(lang: BrowserLang): Slot {
    const existing = this.slots[lang];
    if (existing) return existing;
    const worker = new Worker(WORKER_URL[lang]);
    const pending = new Map<number, (r: Reply) => void>();
    let resolveReady!: () => void, rejectReady!: (e: Error) => void;
    const ready = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej; });
    ready.catch(() => {}); // observed by run(); avoid an unhandled rejection when nobody is waiting
    const fail = (detail: string) => {
      this.onStatus(lang, { state: "error", detail });
      rejectReady(new Error(detail));
      for (const [id, cb] of pending) cb({ id, ok: false, error: detail, ms: 0 });
      pending.clear();
      if (this.slots[lang]?.worker === worker) this.drop(lang);
    };
    worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data as { status?: string; detail?: string } & Reply;
      if (d.status === "loading") this.onStatus(lang, { state: "loading", detail: d.detail ?? "Loading" });
      else if (d.status === "ready") { this.onStatus(lang, { state: "ready" }); resolveReady(); }
      else if (d.status === "error") fail(d.detail ?? "The runtime failed to start.");
      else { pending.get(d.id)?.(d); pending.delete(d.id); }
    };
    worker.onerror = (ev) => { ev.preventDefault(); fail(ev.message || "The runtime failed to start. Check your connection and try again."); };
    if (lang === "python") this.onStatus(lang, { state: "loading", detail: "Loading the Python runtime, about 10 MB, first time only…" });
    if (lang === "typescript") this.onStatus(lang, { state: "loading", detail: "Loading the TypeScript compiler, about 9 MB, first time only…" });
    const s: Slot = { worker, ready, pending };
    this.slots[lang] = s;
    return s;
  }

  private drop(lang: BrowserLang) {
    this.slots[lang]?.worker.terminate();
    delete this.slots[lang];
  }

  /** Runs the learner's code ("run") or the lab's tests against it ("test"). The 5 s limit starts once the runtime is ready. */
  async run(lang: BrowserLang, kind: RunKind, code: string, tests = ""): Promise<RunOutcome> {
    const s = this.slot(lang);
    try { await s.ready; } catch (e) { return { kind: "error", message: (e as Error).message }; }
    const id = ++this.seq;
    return new Promise<RunOutcome>((resolve) => {
      const timer = setTimeout(() => {
        s.pending.delete(id);
        this.drop(lang); // the worker is stuck; the next run gets a fresh one
        this.onStatus(lang, { state: "idle" });
        resolve({ kind: "timeout", message: TIMEOUT_MESSAGE });
      }, TIMEOUT_MS);
      s.pending.set(id, (r) => {
        clearTimeout(timer);
        if (!r.ok) resolve({ kind: "error", message: r.error ?? "Unknown error" });
        else if (kind === "test") resolve({ kind: "test", results: r.results ?? [], ms: r.ms });
        else resolve({ kind: "run", stdout: r.program?.stdout ?? "", error: r.program?.error ?? "", ms: r.ms });
      });
      s.worker.postMessage({ id, kind, code, tests });
    });
  }

  dispose() {
    for (const lang of Object.keys(this.slots) as BrowserLang[]) this.drop(lang);
  }
}
