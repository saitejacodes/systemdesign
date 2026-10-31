"use client";
import { useRef } from "react";
import { X } from "lucide-react";
import { useUi } from "@/lib/ui-store";

const TABS = [
  { id: "notes", label: "Notes" },
  { id: "tutor", label: "AI Tutor" },
] as const;

/** Notes / AI Tutor panel. Desktop: resizable column. Mobile: bottom sheet. */
export function RightPanel({ notes, tutor }: { notes?: React.ReactNode; tutor?: React.ReactNode }) {
  const { rightOpen, rightWidth, rightTab, set } = useUi();
  const drag = useRef<number | null>(null);
  if (!rightOpen) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = e.clientX;
    const start = rightWidth;
    const move = (ev: PointerEvent) => set({ rightWidth: Math.min(560, Math.max(280, start + (drag.current! - ev.clientX))) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <aside
      aria-label="Notes and tutor"
      className="fixed inset-x-0 bottom-8 z-30 flex max-h-[60vh] flex-col border-t border-ink bg-paper lg:static lg:max-h-none lg:w-[var(--rp-w)] lg:border-l lg:border-t-0"
      style={{ ["--rp-w" as string]: `${rightWidth}px` }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuenow={rightWidth}
        aria-valuemin={280}
        aria-valuemax={560}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") set({ rightWidth: Math.min(560, rightWidth + 20) });
          if (e.key === "ArrowRight") set({ rightWidth: Math.max(280, rightWidth - 20) });
        }}
        className="absolute -ml-1 hidden h-full w-2 cursor-col-resize lg:block"
      />
      <div className="flex items-end justify-between pl-3 pr-2 pt-2">
        <div role="tablist" className="fm-tabs flex-1" aria-label="Right panel">
          {TABS.map((t) => (
            <button key={t.id} role="tab" id={`rp-tab-${t.id}`} aria-controls={`rp-panel-${t.id}`} aria-selected={rightTab === t.id} className="fm-tab" onClick={() => set({ rightTab: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="fm-btn fm-btn--tool mb-1 ml-2" aria-label="Close panel" onClick={() => set({ rightOpen: false })}><X size={14} aria-hidden /></button>
      </div>
      <div role="tabpanel" id={`rp-panel-${rightTab}`} aria-labelledby={`rp-tab-${rightTab}`} className="flex-1 overflow-y-auto p-4">
        {rightTab === "notes" ? notes ?? <p className="fm-cap">Coming in a later step</p> : tutor ?? <p className="fm-cap">Coming in a later step</p>}
      </div>
    </aside>
  );
}
