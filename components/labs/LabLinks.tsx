import Link from "next/link";
import { labsForSection } from "@/lib/labs";

/** "Code labs" cards for a lesson section; renders nothing when the section has none. */
export function LabLinks({ sectionId }: { sectionId: string }) {
  const labs = labsForSection(sectionId);
  if (!labs.length) return null;
  return (
    <section aria-labelledby="code-labs-h" className="mt-12 grid max-w-[68ch] gap-4">
      <h2 id="code-labs-h" className="fm-h4">Code labs</h2>
      <ul className="grid gap-3">
        {labs.map((l) => (
          <li key={l.meta.id}>
            <Link href={`/simulators/code-labs/${l.meta.id}`} className="fm-card block p-4 no-underline" style={{ color: "var(--ink)" }}>
              <span className="fm-cap">Code lab →</span>
              <span className="mt-1 block font-semibold">{l.meta.title}</span>
              <span className="mt-1 block text-[15px] text-ink-muted">{l.meta.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
