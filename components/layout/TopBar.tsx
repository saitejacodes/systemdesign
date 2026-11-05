"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeft, PanelRight, Search } from "lucide-react";
import { SEGMENT_LABELS } from "@/lib/nav";
import { PHASES } from "@/lib/curriculum";
import { useUi } from "@/lib/ui-store";
import { InstallButton, OfflineBadge } from "./Pwa";
import { ThemeToggle } from "./ThemeToggle";

// Path prefixes that have no page of their own; their crumbs are plain text, not links.
const NO_PAGE = new Set(["/phase", "/interview"]);

function crumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((seg, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    let label = SEGMENT_LABELS[seg] ?? decodeURIComponent(seg).replace(/-/g, " ");
    if (parts[0] === "phase" && i === 1) label = `Phase ${seg} · ${PHASES[Number(seg) - 1]?.short ?? ""}`;
    return { href, label };
  });
}

export function TopBar() {
  const pathname = usePathname();
  const { set, sidebarCollapsed, rightOpen } = useUi();
  const list = crumbs(pathname);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-ink bg-paper px-3 sm:px-4">
      <button type="button" className="fm-btn fm-btn--tool lg:hidden" aria-label="Open menu" onClick={() => set({ drawerOpen: true })}>
        <Menu size={16} aria-hidden />
      </button>
      <button type="button" className="fm-btn fm-btn--tool hidden lg:inline-flex" aria-label="Toggle sidebar" aria-pressed={!sidebarCollapsed} onClick={() => set({ sidebarCollapsed: !sidebarCollapsed })}>
        <PanelLeft size={16} aria-hidden />
      </button>
      <nav aria-label="Breadcrumb" className="fm-mono min-w-0 flex-1 truncate">
        <ol className="flex items-center gap-2">
          <li><Link href="/" className="no-underline max-lg:inline-flex max-lg:min-h-11 max-lg:items-center" style={{ color: "var(--ink-muted)" }}>Lab</Link></li>
          {list.map((c, i) => (
            <li key={c.href} className={`flex items-center gap-2 truncate ${i < list.length - 1 ? "max-sm:hidden" : ""}`}>
              <span aria-hidden style={{ color: "var(--ink-muted)" }}>/</span>
              {i === list.length - 1 ? <span aria-current="page">{c.label}</span> : NO_PAGE.has(c.href) ? <span style={{ color: "var(--ink-muted)" }}>{c.label}</span> : <Link href={c.href} className="no-underline max-lg:inline-flex max-lg:min-h-11 max-lg:items-center" style={{ color: "var(--ink-muted)" }}>{c.label}</Link>}
            </li>
          ))}
        </ol>
      </nav>
      <OfflineBadge />
      <InstallButton />
      <button type="button" className="fm-btn fm-btn--tool" onClick={() => set({ paletteOpen: true })} aria-keyshortcuts="Control+K Meta+K">
        <Search size={14} aria-hidden /><span className="sr-only sm:not-sr-only">Search</span><kbd className="hidden md:inline opacity-70" aria-hidden>⌘K</kbd>
      </button>
      <div className="hidden md:block"><ThemeToggle /></div>
      <button type="button" className="fm-btn fm-btn--tool" aria-label="Toggle right panel" aria-pressed={rightOpen} onClick={() => set({ rightOpen: !rightOpen })}>
        <PanelRight size={16} aria-hidden />
      </button>
    </header>
  );
}
