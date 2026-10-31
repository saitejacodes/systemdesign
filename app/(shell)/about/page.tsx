import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "About" };

export default function Page() {
  return (
    <PageHeader code="A-01" spec="About" before="Why this" em="exists" after="." lede="SysDesign Lab is a single place to learn, practise and test system design, built to run entirely in your browser.">
    </PageHeader>
  );
}
