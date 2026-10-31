"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAdapter } from "@/lib/db/adapter";
import { useNote } from "@/lib/db/hooks";

/** Markdown notes for the current page, autosaved 500ms after typing stops. */
export function NotesPanel() {
  const pageId = usePathname();
  const note = useNote(pageId);
  if (note === undefined) return <p className="fm-cap">Loading notes…</p>;
  return <Editor key={pageId} pageId={pageId} initial={note?.markdown ?? ""} />;
}

function Editor({ pageId, initial }: { pageId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [status, setStatus] = useState("Saved");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (v: string) => {
    setText(v);
    setStatus("Saving…");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await getAdapter().put("notes", { id: pageId, pageId, markdown: v, updatedAt: new Date().toISOString() });
      setStatus("Saved");
    }, 500);
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <span className="fm-cap flex-1 truncate">Notes · {pageId}</span>
        <button type="button" className={`fm-btn fm-btn--tool ${mode === "write" ? "is-on" : ""}`} aria-pressed={mode === "write"} onClick={() => setMode("write")}>Write</button>
        <button type="button" className={`fm-btn fm-btn--tool ${mode === "preview" ? "is-on" : ""}`} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>Preview</button>
      </div>
      {mode === "write" ? (
        <textarea
          aria-label="Notes for this page (Markdown)"
          className="fm-input fm-input--mono !h-[50vh] resize-y p-3 leading-relaxed"
          value={text}
          onChange={(e) => change(e.target.value)}
          placeholder="Write in Markdown. Saved on this device."
        />
      ) : (
        <div className="lesson min-h-24 !text-[15px]">{text.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : <p className="fm-cap">Nothing written yet</p>}</div>
      )}
      <span className="fm-cap" aria-live="polite">{status}</span>
    </div>
  );
}
