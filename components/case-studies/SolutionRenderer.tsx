import Link from "next/link";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { DepthStamp } from "@/components/brand";
import { Callout, Figure, InterviewAngle, Misconception, NotWhenBox, ScrollTable, TradeoffBox } from "@/components/learn/boxes";
import { CodeBlock } from "@/components/learn/CodeBlock";
import { Diagram } from "@/components/learn/Diagram";
import { slugify } from "@/components/learn/LessonRenderer";
import { SimulatorEmbed } from "@/components/learn/SimulatorEmbed";
import { SimulatorCard } from "@/components/learn/static";
import { getGlossary } from "@/lib/content";

const text = (n: ReactNode): string => (typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(text).join("") : isValidElement(n) ? text((n.props as { children?: ReactNode }).children) : "");

function Term({ slug, children }: { slug: string; children?: ReactNode }) {
  const t = getGlossary().find((g) => g.slug === slug);
  if (!t) throw new Error(`<Term slug="${slug}"> not found in content/glossary.json`);
  return (
    <span className="term">
      <Link href={`/glossary#${slug}`} aria-describedby={`term-${slug}-s`}>{children ?? t.term}</Link>
      <span role="tooltip" id={`term-${slug}-s`} className="term-tip">{t.definition}</span>
    </span>
  );
}

/**
 * A case study's solution.mdx, with the lesson components (the same set LessonRenderer gives lessons, minus the
 * section-bound widgets: checkpoints, quiz, flashcards and resources belong to sections, not cases).
 * A ```mermaid fence renders as a Diagram. `idPrefix` keeps heading ids unique when rendered beside other content.
 */
export async function SolutionRenderer({ source, idPrefix = "" }: { source: string; idPrefix?: string }) {
  const { content } = await compileMDX({
    source,
    // Case studies are our own trusted files, like lessons.
    options: { blockJS: false, mdxOptions: { remarkPlugins: [remarkGfm] } },
    components: {
      h2: ({ children }) => <h2 id={`${idPrefix}${slugify(text(children))}`}>{children}</h2>,
      h3: ({ children }) => <h3 id={`${idPrefix}${slugify(text(children))}`}>{children}</h3>,
      pre: ({ children }) => {
        const el = children as ReactElement<{ className?: string; children?: string }>;
        const lang = el.props.className?.replace("language-", "") ?? "text";
        const code = String(el.props.children ?? "").replace(/\n$/, "");
        if (lang === "mermaid") return <Diagram chart={code} label="Reference design diagram" />;
        return <CodeBlock code={code} lang={lang} />;
      },
      table: ({ children }) => <ScrollTable>{children}</ScrollTable>,
      DepthStamp,
      Figure,
      Callout,
      TradeoffBox,
      NotWhenBox,
      Misconception,
      InterviewAngle,
      Diagram,
      Term,
      Simulator: ({ id }: { id: string }) => <SimulatorEmbed id={id} fallback={<SimulatorCard id={id} />} />,
    },
  });
  return <div className="lesson">{content}</div>;
}
