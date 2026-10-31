import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Reference" };

export default function Page() {
  return (
    <PageHeader code="R-00" spec="Reference" before="The" em="cheat" after=" sheets." lede="One-page summaries to revise from.">
    </PageHeader>
  );
}
