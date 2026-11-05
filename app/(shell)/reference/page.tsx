import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCheatSheets } from "@/lib/content";
import { CHEATSHEET_GROUPS } from "@/lib/content/schemas";

export const metadata: Metadata = { title: "Reference" };

export default function Page() {
  const sheets = getCheatSheets();
  return (
    <>
      <PageHeader title="The cheat sheets" lede="One- or two-page spec sheets to revise from and print: the numbers, the building blocks, the distributed-systems rules and the interview routine, each agreeing with the lessons it summarises." />
      <div className="grid gap-10 px-4 py-6 sm:px-8">
        {CHEATSHEET_GROUPS.map((group) => {
          const list = sheets.filter((s) => s.meta.group === group);
          if (list.length === 0) return null;
          const hid = `grp-${group.toLowerCase().replace(/\s+/g, "-")}`;
          return (
            <section key={group} aria-labelledby={hid}>
              <h2 id={hid} className="fm-cap border-b-2 border-ink pb-2 !text-ink">{group} · {list.length}</h2>
              <ol className="grid gap-0">
                {list.map((s) => (
                  <li key={s.slug} className="grid gap-1 border-b border-line py-4 ">
                    <div className="grid gap-1">
                      <Link href={`/reference/${s.slug}`} className="fm-h4">{s.meta.title}</Link>
                      <p className="text-ink-muted">{s.meta.summary}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}
