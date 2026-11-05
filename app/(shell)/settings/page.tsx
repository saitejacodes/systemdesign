import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <PageHeader title="Make it yours" lede="Study plan, review limits, and your data: export, import, reset." />
      <SettingsForm />
    </>
  );
}
