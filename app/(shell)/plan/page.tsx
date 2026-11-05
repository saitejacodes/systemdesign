import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlanTimeline } from "@/components/plan/PlanTimeline";
import { getPlanView } from "@/lib/content";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  const { weeks, sections } = getPlanView();
  return (
    <>
      <PageHeader title="Sixteen weeks, one system" lede="Seven phases in the order you should learn them, about eight hours a week. Open a week to see its lessons, simulators and deliverable." />
      <PlanTimeline weeks={weeks} sections={sections} />
    </>
  );
}
