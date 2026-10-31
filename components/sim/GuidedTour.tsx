"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { TourStep } from "@/lib/sim/definition";

/** Highlights one shell region per step with an accessible popover next to it. */
export function GuidedTour({ steps, root, onClose }: { steps: TourStep[]; root: RefObject<HTMLElement | null>; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const step = steps[i];

  useEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    el.classList.add("sim-tour-on");
    // Measured after scrolling settles in the next frame.
    const raf = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const w = Math.min(340, window.innerWidth - 32);
      const below = r.bottom + 12 + 200 < window.innerHeight;
      setPos({ top: below ? r.bottom + 12 : Math.max(16, r.top - 212), left: Math.min(Math.max(16, r.left), window.innerWidth - w - 16) });
    });
    return () => { cancelAnimationFrame(raf); el.classList.remove("sim-tour-on"); };
  }, [step, root]);

  useEffect(() => { box.current?.focus(); }, [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      className="fm-card fm-card--raised fixed z-40 grid w-[min(340px,calc(100vw-32px))] gap-3 p-4 outline-none"
      style={pos ?? { bottom: 16, right: 16 }}
    >
      <p className="fm-cap">Guided tour · {i + 1}/{steps.length}</p>
      <h2 id="tour-title" className="text-[18px] font-semibold">{step.title}</h2>
      <p className="text-[15px] leading-relaxed">{step.body}</p>
      <div className="flex gap-2">
        {i > 0 && <button type="button" className="fm-btn fm-btn--tool" onClick={() => setI(i - 1)}>Back</button>}
        {i < steps.length - 1
          ? <button type="button" className="fm-btn fm-btn--tool is-on" onClick={() => setI(i + 1)}>Next</button>
          : <button type="button" className="fm-btn fm-btn--tool is-on" onClick={onClose}>Done</button>}
        <button type="button" className="fm-btn fm-btn--tool ml-auto" onClick={onClose}>Skip</button>
      </div>
    </div>
  );
}
