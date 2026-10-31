import Link from "next/link";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { DepthStamp } from "@/components/brand";
import type { Section } from "@/lib/content";
import { getGlossary } from "@/lib/content";
import { Callout, Figure, InterviewAngle, Misconception, NotWhenBox, TradeoffBox } from "./boxes";
import { CodeBlock } from "./CodeBlock";
import { Diagram } from "./Diagram";
import { ResourceList, SimulatorCard } from "./static";
import { SimulatorEmbed } from "./SimulatorEmbed";
import { LearnWidgets } from "./widgets";

export const slugify = (s: string) => s.toLowerCase().replace(/[`*_]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const text = (n: ReactNode): string => (typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(text).join("") : isValidElement(n) ? text((n.props as { children?: ReactNode }).children) : "");

/** H2s of a lesson, for the table of contents. */
export const lessonHeadings = (mdx: string) => [...mdx.matchAll(/^## (.+)$/gm)].map((m) => ({ title: m[1].trim(), id: slugify(m[1]) }));

function Term({ slug, children }: { slug: string; children?: ReactNode }) {
  const t = getGlossary().find((g) => g.slug === slug);
  if (!t) throw new Error(`<Term slug="${slug}"> not found in content/glossary.json`);
  return (
    <span className="term">
      <Link href={`/glossary#${slug}`} aria-describedby={`term-${slug}`}>{children ?? t.term}</Link>
      <span role="tooltip" id={`term-${slug}`} className="term-tip">{t.definition}</span>
    </span>
  );
}

export async function LessonRenderer({ section }: { section: Section }) {
  const { content } = await compileMDX({
    source: section.lesson,
    // Lessons are our own trusted files, so JS expressions in props (arrays, template strings) are allowed.
    options: { blockJS: false, mdxOptions: { remarkPlugins: [remarkGfm] } },
    components: {
      h2: ({ children }) => <h2 id={slugify(text(children))}>{children}</h2>,
      h3: ({ children }) => <h3 id={slugify(text(children))}>{children}</h3>,
      pre: ({ children }) => {
        const el = children as ReactElement<{ className?: string; children?: string }>;
        const lang = el.props.className?.replace("language-", "") ?? "text";
        return <CodeBlock code={String(el.props.children ?? "").replace(/\n$/, "")} lang={lang} />;
      },
      table: ({ children }) => <div className="my-6 overflow-x-auto"><table className="fm-parts">{children}</table></div>,
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
      CheckpointList: () => <LearnWidgets kind="checkpoints" section={section} />,
      QuizPlayer: () => <LearnWidgets kind="quiz" section={section} />,
      FlashcardDeck: () => <LearnWidgets kind="flashcards" section={section} />,
      ResourceList: () => <ResourceList items={section.resources} />,
    },
  });
  return <div className="lesson">{content}</div>;
}
