import { AppShell } from "@/components/layout/AppShell";
import { getAllSections } from "@/lib/content";

export default function ShellLayout({ children }: LayoutProps<"/">) {
  const sections = getAllSections().map(({ meta, checkpoints }) => ({ id: meta.id, phase: meta.phase, slug: meta.slug, title: meta.title, order: meta.order, checkpointIds: checkpoints.map((c) => c.id), simulatorIds: meta.simulatorIds }));
  return <AppShell sections={sections}>{children}</AppShell>;
}
