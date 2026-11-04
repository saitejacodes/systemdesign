import type { Metadata } from "next";
import { caseRuns } from "@/components/studio/caseRuns";
import { DesignEditor, NewDesign } from "@/components/studio/Editor";
import { studioLessons } from "@/components/studio/lessons";

export const metadata: Metadata = { title: "Design" };

// Designs live in this browser's IndexedDB, so any id renders here and the client loads it (or shows "Design not found").
// "/studio/new" (optionally ?template=<id>) creates a design and replaces the URL with its id.
export default async function Page({ params, searchParams }: PageProps<"/studio/[designId]">) {
  const { designId } = await params;
  const sp = await searchParams;
  if (designId === "new") return <NewDesign templateId={typeof sp.template === "string" ? sp.template : undefined} />;
  return <DesignEditor designId={decodeURIComponent(designId)} lessons={studioLessons()} caseRuns={caseRuns()} />;
}
