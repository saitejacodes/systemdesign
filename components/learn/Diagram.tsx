"use client";
import { useEffect, useId, useRef, useState } from "react";

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Mermaid, lazy-loaded on the client and re-rendered when the theme changes. */
export function Diagram({ chart, label }: { chart: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [error, setError] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let alive = true;
    const render = async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: {
          fontFamily: cssVar("--font-mono"),
          fontSize: "13px",
          primaryColor: cssVar("--surface"),
          primaryBorderColor: cssVar("--ink"),
          primaryTextColor: cssVar("--ink"),
          lineColor: cssVar("--ink"),
          secondaryColor: cssVar("--surface-sunk"),
          tertiaryColor: cssVar("--paper"),
          noteBkgColor: cssVar("--surface-sunk"),
          noteTextColor: cssVar("--ink"),
          actorBkg: cssVar("--surface"),
          actorBorder: cssVar("--ink"),
          signalColor: cssVar("--ink"),
          signalTextColor: cssVar("--ink"),
        },
      });
      try {
        const { svg } = await mermaid.render(id + Date.now(), chart);
        if (alive && ref.current) { ref.current.innerHTML = svg; setDrawn(true); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    render();
    const obs = new MutationObserver(render);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { alive = false; obs.disconnect(); };
  }, [chart, id]);

  if (error) return <p className="fm-help is-error">■ Diagram failed to render: {error}</p>;
  return (
    <div className="relative">
      {!drawn && <span className="fm-cap absolute inset-0 grid place-items-center" aria-hidden>Drawing diagram…</span>}
      <div ref={ref} role="img" aria-label={label} className="flex min-h-24 justify-center [&_svg]:max-w-full" />
    </div>
  );
}
