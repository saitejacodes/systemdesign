import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudioHome } from "@/components/studio/StudioHome";
import { getCaseStudies } from "@/lib/content";

export const metadata: Metadata = { title: "Design Studio" };

export default function Page() {
  const caseStudies = Object.fromEntries(getCaseStudies().map((c) => [c.meta.id, c.meta.title]));
  return (
    <>
      <PageHeader code="D-00" spec="Design Studio" before="Draw it, then" em="run" after=" it." lede="Place components, wire them up and write down why. Designs are saved in this browser, with version history." />
      <StudioHome caseStudies={caseStudies} />
    </>
  );
}
