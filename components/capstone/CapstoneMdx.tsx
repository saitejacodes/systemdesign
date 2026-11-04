import type { ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/learn/CodeBlock";
import { slugify } from "@/components/learn/LessonRenderer";

const text = (n: ReactNode): string => (typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(text).join("") : isValidElement(n) ? text((n.props as { children?: ReactNode }).children) : "");

/** Renders a capstone guide's prose with the lesson styles (headings with ids, shiki code, Field Manual tables). */
export async function CapstoneMdx({ source }: { source: string }) {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
    components: {
      h2: ({ children }) => <h2 id={slugify(text(children))}>{children}</h2>,
      h3: ({ children }) => <h3 id={slugify(text(children))}>{children}</h3>,
      pre: ({ children }) => {
        const el = children as ReactElement<{ className?: string; children?: string }>;
        const lang = el.props.className?.replace("language-", "") ?? "text";
        return <CodeBlock code={String(el.props.children ?? "").replace(/\n$/, "")} lang={lang} />;
      },
      table: ({ children }) => <div className="my-6 overflow-x-auto"><table className="fm-parts">{children}</table></div>,
    },
  });
  return <div className="lesson">{content}</div>;
}
