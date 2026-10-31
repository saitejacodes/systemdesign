import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Glossary" };

export default function Page() {
  return (
    <PageHeader code="G-00" spec="Glossary" before="Every term," em="defined" after="." lede="Each term links back to the lesson that introduces it.">
    </PageHeader>
  );
}
