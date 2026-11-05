import { isValidElement, type ReactElement, type ReactNode } from "react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { Callout, ScrollTable } from "@/components/learn/boxes";
import { CodeBlock } from "@/components/learn/CodeBlock";
import { slugify, Term } from "@/components/learn/LessonRenderer";

const text = (n: ReactNode): string => (typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(text).join("") : isValidElement(n) ? text((n.props as { children?: ReactNode }).children) : "");

/** H2s of a sheet, for the on-page index. */
export const sheetHeadings = (mdx: string) => [...mdx.matchAll(/^## (.+)$/gm)].map((m) => ({ title: m[1].trim(), id: slugify(m[1]) }));

/**
 * A reference cheat sheet's MDX: the lesson typography and tables in a denser "spec sheet" layout.
 * Sheets are our own trusted files; only the components a sheet needs are provided (no section-bound widgets).
 */
export async function SheetRenderer({ source }: { source: string }) {
  const { content } = await compileMDX({
    source,
    options: { blockJS: false, mdxOptions: { remarkPlugins: [remarkGfm] } },
    components: {
      h2: ({ children }) => <h2 id={slugify(text(children))}>{children}</h2>,
      h3: ({ children }) => <h3 id={slugify(text(children))}>{children}</h3>,
      pre: ({ children }) => {
        const el = children as ReactElement<{ className?: string; children?: string }>;
        const lang = el.props.className?.replace("language-", "") ?? "text";
        return <CodeBlock code={String(el.props.children ?? "").replace(/\n$/, "")} lang={lang} />;
      },
      table: ({ children }) => <ScrollTable className="sheet-table my-4">{children}</ScrollTable>,
      // GFM task boxes are something to tick on paper, not form controls.
      input: (p) => (p.type === "checkbox" ? <span className="sheet-check" aria-hidden /> : <input {...p} />),
      Callout,
      Term,
    },
  });
  return <div className="lesson sheet">{content}</div>;
}
