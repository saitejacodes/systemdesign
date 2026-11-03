"use client";
import { useState } from "react";
import { bundle, LOCAL_FILE, LOCAL_RUN, type LocalLang } from "@/lib/labs/bundle";

const NEEDS: Record<LocalLang, string> = { java: "JDK 17 or newer", cpp: "any C++17 compiler (g++, clang++ or MSVC)" };

/** Java and C++ can't compile in the browser, so the learner downloads one file with their code, the harness and the tests. */
export function LocalRunPanel({ lang, code, tests, harness }: { lang: LocalLang; code: string; tests: string; harness: string }) {
  const [copied, setCopied] = useState<"file" | "cmd" | null>(null);
  const file = LOCAL_FILE[lang];
  const build = () => bundle(lang, code, tests, harness);

  const download = () => {
    const url = URL.createObjectURL(new Blob([build()], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async (what: "file" | "cmd") => {
    try { await navigator.clipboard.writeText(what === "file" ? build() : LOCAL_RUN[lang]); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <section className="fm-card min-w-0 self-start" aria-labelledby="lab-local-h">
      <div className="fm-card__head"><h2 id="lab-local-h" className="m-0 text-[inherit] font-[inherit]">Run on your machine</h2><span>{file}</span></div>
      <div className="grid gap-3 p-4 text-[15px]">
        <p className="font-semibold">Java and C++ run on your machine.</p>
        <p className="text-ink-muted">A compiler for these is too big to load in a browser tab. Download one file with your code, the test harness and the lab&apos;s tests, then run it. You need {NEEDS[lang]}.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="fm-btn fm-btn--primary !h-10" onClick={download}>Download runnable file</button>
          <button type="button" className="fm-btn fm-btn--tool !h-10" onClick={() => void copy("file")}><span aria-live="polite">{copied === "file" ? "Copied ✓" : "Copy file"}</span></button>
        </div>
        <div className="grid gap-1">
          <span className="fm-cap">Then run</span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre border border-line bg-[var(--surface-sunk)] px-2 py-1.5 font-mono text-[13px]" style={{ borderRadius: 2 }}>{LOCAL_RUN[lang]}</code>
            <button type="button" className="fm-btn fm-btn--tool" onClick={() => void copy("cmd")}><span aria-live="polite">{copied === "cmd" ? "Copied ✓" : "Copy command"}</span></button>
          </div>
        </div>
        <p className="fm-cap">Each test prints PASS or FAIL. Labs marked passed on this site come from the in-browser languages.</p>
      </div>
    </section>
  );
}
