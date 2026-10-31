import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <PageHeader code="X-00" spec="Settings" before="Make it" em="yours" after="." lede="Theme, review limits, data export and AI keys.">
    </PageHeader>
  );
}
