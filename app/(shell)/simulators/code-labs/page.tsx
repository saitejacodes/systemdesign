import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Code labs" };

export default function Page() {
  return (
    <PageHeader code="L-00" spec="Code labs" before="Write it in" em="Python" after="." lede="Small coding labs that run in your browser.">
    </PageHeader>
  );
}
