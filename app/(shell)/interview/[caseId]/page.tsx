import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SolutionRenderer } from "@/components/case-studies/SolutionRenderer";
import { InterviewApp } from "@/components/interview/InterviewApp";
import { PageHeader } from "@/components/layout/PageHeader";
import { caseRuns } from "@/components/studio/caseRuns";
import { studioLessons } from "@/components/studio/lessons";
import { getCaseStudy } from "@/lib/content";

export async function generateMetadata({ params }: PageProps<"/interview/[caseId]">): Promise<Metadata> {
  const c = getCaseStudy(decodeURIComponent((await params).caseId));
  return { title: c ? `Interview · ${c.meta.title}` : "Interview" };
}

export default async function Page({ params }: PageProps<"/interview/[caseId]">) {
  const id = decodeURIComponent((await params).caseId);
  const c = getCaseStudy(id);
  // A case is interviewable once its rubric exists; the reference design is optional during review.
  if (!c || !c.rubric) notFound();
  return (
    <>
      <PageHeader code="I-00" spec={`Interview · ${c.meta.title}`} before="Defend your" em="design" after="." lede={c.meta.summary} />
      <InterviewApp
        c={{ meta: c.meta, rubric: c.rubric, reference: c.design }}
        solution={<SolutionRenderer source={c.solution} idPrefix="ref-" />}
        lessons={studioLessons()}
        caseRuns={caseRuns()}
      />
    </>
  );
}
