import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <PageHeader code="X-00" spec="Settings" before="Make it" em="yours" after="." lede="Study plan, review limits, and your data: export, import, reset." />
      <SettingsForm />
    </>
  );
}
