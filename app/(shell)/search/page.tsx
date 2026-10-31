import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SearchPage } from "./SearchPage";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <>
      <PageHeader code="Q-00" spec="Search" before="Find it" em="fast" after="." lede="Search lessons, glossary terms, flashcards, case studies and resources. ↑↓ to move, Enter to open." />
      <Suspense><SearchPage /></Suspense>
    </>
  );
}
