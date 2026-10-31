import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { NotesList } from "./NotesList";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <>
      <PageHeader code="M-00" spec="Dashboard" before="Where you" em="stand" after="." lede="Progress per phase, quiz history, notes and weak spots." />
      <div className="grid max-w-3xl gap-8 px-4 py-8 sm:px-8">
        <NotesList />
      </div>
    </>
  );
}
