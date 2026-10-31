import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <PageHeader code="M-00" spec="Dashboard" before="Where you" em="stand" after="." lede="Progress per phase, quiz history, notes and weak spots.">
    </PageHeader>
  );
}
