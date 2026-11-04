"use client";
import { useState } from "react";
import type { CapstoneFile } from "@/lib/capstone/schema";
import { buildZip } from "@/lib/capstone/zip";

/** Builds the project zip in the browser: fetches the prerendered file list, then JSZip (loaded on click). */
export function ZipDownload({ fileName }: { fileName: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  const download = async () => {
    setState("busy");
    try {
      const [{ default: JSZip }, res] = await Promise.all([import("jszip"), fetch("/capstone-files.json")]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { files } = (await res.json()) as { files: CapstoneFile[] };
      const blob = await buildZip(JSZip, files, "blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="fm-btn fm-btn--primary" onClick={download} disabled={state === "busy"}>
        {state === "busy" ? "Building zip…" : "Download the project (.zip)"}
      </button>
      <span className="fm-mono text-ink-muted">{fileName}</span>
      {state === "error" && <span role="alert" className="fm-status">Download failed. Check your connection and try again.</span>}
    </div>
  );
}
