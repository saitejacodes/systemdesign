import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrintButton } from "@/components/reference/PrintButton";
import { SheetRenderer, sheetHeadings } from "@/components/reference/SheetRenderer";
import { getCheatSheet, getCheatSheets, getSectionById, sectionHref } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return getCheatSheets().map((s) => ({ sheet: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/reference/[sheet]">): Promise<Metadata> {
  const s = getCheatSheet(decodeURIComponent((await params).sheet));
  return s ? { title: s.meta.title, description: s.meta.summary } : { title: "Reference sheet" };
}

export default async function Page({ params }: PageProps<"/reference/[sheet]">) {
  const s = getCheatSheet(decodeURIComponent((await params).sheet));
  if (!s) notFound();
  const { meta } = s;
  const related = meta.relatedSectionIds.map(getSectionById).filter((x) => x !== undefined);
  const toc = sheetHeadings(s.body);
  return (
    <div data-print-sheet>
      <PageHeader title={meta.title} lede={meta.summary}>
        <div className="sheet-actions flex flex-wrap items-center gap-2">
          <PrintButton />
          <Link href="/reference" className="fm-btn">All sheets</Link>
        </div>
      </PageHeader>
      <div className="grid gap-8 px-4 py-6 sm:px-8 xl:grid-cols-[minmax(0,88ch)_1fr]">
        <article className="min-w-0" aria-label={meta.title}>
          <SheetRenderer source={s.body} />
          <p className="sheet-foot fm-cap mt-8 border-t border-ink pt-2">{meta.title} · SysDesign Lab</p>
        </article>
        <aside className="sheet-aside grid content-start gap-6 xl:sticky xl:top-4">
          <nav aria-labelledby="toc-h" className="sheet-toc grid gap-1">
            <h2 id="toc-h" className="fm-cap border-b border-ink pb-1">On this sheet</h2>
            <ol className="grid gap-1 text-[15px]">{toc.map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.title}</a></li>)}</ol>
          </nav>
          <section aria-labelledby="rel-h" className="sheet-related grid gap-1">
            <h2 id="rel-h" className="fm-cap border-b border-ink pb-1">Lessons behind this sheet</h2>
            <ul className="grid gap-1 text-[15px]">{related.map((x) => <li key={x.meta.id}><span className="fm-cap mr-2">{x.meta.phase}.{x.meta.order}</span><Link href={sectionHref(x.meta)}>{x.meta.title}</Link></li>)}</ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
