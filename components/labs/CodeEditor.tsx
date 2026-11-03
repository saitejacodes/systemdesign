"use client";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LabLang } from "@/lib/labs/schema";

// Paper → light, Blueprint → dark. data-theme is already resolved for "System", but the OS can flip while on System.
const subscribeTheme = (cb: () => void) => {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => { o.disconnect(); mq.removeEventListener("change", cb); };
};
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "blueprint" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};
export const useDark = () => useSyncExternalStore(subscribeTheme, isDark, () => false);

const MONACO_TIMEOUT_MS = 8000;

/** Monaco (from its CDN) with a plain textarea fallback when it doesn't load in 8 s, e.g. offline. */
export function CodeEditor({ lang, value, onChange, onSubmit, readOnly = false, label, height = 420 }: {
  lang: LabLang; value: string; onChange?: (v: string) => void; onSubmit?: () => void; readOnly?: boolean; label: string; height?: number;
}) {
  const dark = useDark();
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [plain, setPlain] = useState(false);
  const submit = useRef(onSubmit);
  useEffect(() => { submit.current = onSubmit; }, [onSubmit]);

  useEffect(() => {
    if (mounted) return;
    const t = setTimeout(() => setFailed(true), MONACO_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [mounted]);

  const onMount: OnMount = (editor, monaco) => {
    setMounted(true);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => submit.current?.());
  };

  const usePlain = plain || (failed && !mounted);
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="fm-cap">{label}</span>
        {failed && !mounted ? <span className="fm-cap">Editor didn&apos;t load · plain text mode</span> : (
          <button type="button" role="switch" aria-checked={plain} className="fm-toggle" onClick={() => setPlain(!plain)}><span className="track" /><span className="state">{plain ? "On" : "Off"}</span>Plain editor</button>
        )}
      </div>
      {usePlain ? (
        <textarea
          aria-label={label}
          spellCheck={false}
          readOnly={readOnly}
          className="fm-input fm-input--mono !h-auto !py-2 !text-[13px] leading-relaxed"
          style={{ minHeight: height, tabSize: 4 }}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onSubmit?.(); return; }
          }}
        />
      ) : (
        <div className="overflow-hidden border border-ink" style={{ borderRadius: 2 }}>
          <Editor
            height={height}
            language={lang}
            theme={dark ? "vs-dark" : "light"}
            value={value}
            onChange={(v) => onChange?.(v ?? "")}
            onMount={onMount}
            loading={<span className="fm-cap">Loading editor…</span>}
            options={{ readOnly, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, lineNumbers: "on", automaticLayout: true, tabSize: lang === "python" ? 4 : 2, ariaLabel: label }}
          />
        </div>
      )}
    </div>
  );
}
