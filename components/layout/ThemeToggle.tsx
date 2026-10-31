"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { applyTheme, readTheme, type ThemeChoice } from "@/lib/ui-store";

const subscribe = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

const OPTIONS: { v: ThemeChoice; label: string }[] = [
  { v: "paper", label: "Paper" },
  { v: "blueprint", label: "Blueprint" },
  { v: "system", label: "System" },
];

export function ThemeToggle() {
  // Server renders "system"; the stored choice is read on the client without a hydration mismatch.
  const stored = useSyncExternalStore(subscribe, readTheme, () => "system" as ThemeChoice);
  const [picked, setChoice] = useState<ThemeChoice | null>(null);
  const choice = picked ?? stored;

  // Follow the OS while on "System".
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  return (
    <div role="radiogroup" aria-label="Theme" className="flex">
      {OPTIONS.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={choice === o.v}
          onClick={() => { setChoice(o.v); applyTheme(o.v); }}
          className={`fm-btn fm-btn--tool -ml-px first:ml-0 ${choice === o.v ? "is-on" : ""}`}
          style={{ borderRadius: 0 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
