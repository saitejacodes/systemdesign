import type { ReactElement } from "react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/learn/CodeBlock";
import { ScrollTable } from "@/components/learn/boxes";

/** A lab's explanation.md, compiled as plain Markdown (format "md", so `<` and `{` are just text). */
export async function LabExplanation({ source }: { source: string }) {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { format: "md", remarkPlugins: [remarkGfm] } },
    components: {
      pre: ({ children }) => {
        const el = children as ReactElement<{ className?: string; children?: string }>;
        const lang = el.props.className?.replace("language-", "") ?? "text";
        return <CodeBlock code={String(el.props.children ?? "").replace(/\n$/, "")} lang={lang} />;
      },
      table: ({ children }) => <ScrollTable>{children}</ScrollTable>,
    },
  });
  return <div className="lesson">{content}</div>;
}
