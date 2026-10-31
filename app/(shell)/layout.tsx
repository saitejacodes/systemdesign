import { AppShell } from "@/components/layout/AppShell";
import { getAllSections } from "@/lib/content";

export default function ShellLayout({ children }: LayoutProps<"/">) {
  const sections = getAllSections().map(({ meta }) => ({ phase: meta.phase, slug: meta.slug, title: meta.title, order: meta.order }));
  return <AppShell sections={sections}>{children}</AppShell>;
}
