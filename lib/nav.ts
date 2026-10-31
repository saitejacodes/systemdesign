import { BookOpen, CalendarDays, Cpu, FileText, Flag, GalleryVerticalEnd, Layers, LayoutDashboard, Library, PenTool, Settings, Sun, Wrench, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon }

// Sidebar groups (Prompt 01 §5). "Learn" is the curriculum tree, rendered separately.
export const NAV_TOP: NavItem[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/plan", label: "Plan", icon: CalendarDays },
];
export const NAV_BOTTOM: NavItem[] = [
  { href: "/simulators", label: "Simulators", icon: Cpu },
  { href: "/studio", label: "Design Studio", icon: PenTool },
  { href: "/case-studies", label: "Case Studies", icon: FileText },
  { href: "/flashcards", label: "Flashcards", icon: GalleryVerticalEnd },
  { href: "/reference", label: "Reference", icon: BookOpen },
  { href: "/resources", label: "Resources", icon: Library },
  { href: "/capstone", label: "Capstone", icon: Flag },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
];
export const LEARN_ICON = Layers;
export const TOOL_ICON = Wrench;

// Breadcrumb labels for URL segments.
export const SEGMENT_LABELS: Record<string, string> = {
  today: "Today", plan: "Plan", phase: "Learn", simulators: "Simulators", "code-labs": "Code labs",
  studio: "Design Studio", interview: "Interview", "case-studies": "Case Studies", flashcards: "Flashcards",
  dashboard: "Dashboard", search: "Search", glossary: "Glossary", reference: "Reference", resources: "Resources",
  capstone: "Capstone", settings: "Settings", about: "About",
};
