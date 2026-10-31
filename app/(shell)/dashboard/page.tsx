import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { getPlanView } from "@/lib/content";
import { DashboardView } from "./DashboardView";
import { NotesList } from "./NotesList";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  const { weeks, sections } = getPlanView();
  return (
    <>
      <PageHeader code="M-00" spec="Dashboard" before="Where you" em="stand" after="." lede="Progress per phase, quiz history, study time, notes and weak spots." />
      <DashboardView weeks={weeks} sections={sections} />
      <div className="grid max-w-3xl gap-8 px-4 pb-10 sm:px-8">
        <NotesList />
      </div>
    </>
  );
}
