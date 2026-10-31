import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Capstone" };

export default function Page() {
  return (
    <PageHeader code="K-00" spec="Capstone" before="Build the" em="real" after=" thing." lede="Run real Postgres, Redis and Kafka on your own machine.">
    </PageHeader>
  );
}
