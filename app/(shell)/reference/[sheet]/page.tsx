import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Reference sheet" };

export default async function Page({ params }: PageProps<"/reference/[sheet]">) {
  const p = await params;
  const ref = p.sheet;
  return (
    <PageHeader code="R-00" spec="Reference sheet" before="The" em="cheat" after=" sheet." lede="A one-page summary.">
      <p className="fm-cap">Ref · {decodeURIComponent(ref)}</p>
    </PageHeader>
  );
}
