import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "About" };

export default function Page() {
  return (
    <PageHeader title="Why this exists" lede="SysDesign Lab is a single place to learn, practise and test system design, built to run entirely in your browser.">
    </PageHeader>
  );
}
