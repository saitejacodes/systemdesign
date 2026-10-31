"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HudBar } from "@/components/brand";
import { useUi } from "@/lib/ui-store";
import { CommandPalette } from "./CommandPalette";
import { RightPanel } from "./RightPanel";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { Sidebar, type TreeSection } from "./Sidebar";
import { TopBar } from "./TopBar";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function AppShell({ children, sections, notes, hud }: { children: ReactNode; sections?: TreeSection[]; notes?: ReactNode; hud?: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ui.set({ paletteOpen: !ui.paletteOpen }); return; }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") {
        if (window.innerWidth < 1024) ui.set({ drawerOpen: !ui.drawerOpen });
        else ui.set({ sidebarCollapsed: !ui.sidebarCollapsed });
      } else if (e.key === "]") ui.set({ rightOpen: !ui.rightOpen });
      else if (e.key === "?") ui.set({ shortcutsOpen: true });
      else if (e.key === "Escape") ui.set({ drawerOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-paper focus:p-2">Skip to content</a>
      <div className="flex min-h-0 flex-1">
        <Sidebar sections={sections} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="flex min-h-0 flex-1">
            <main id="main" className="min-w-0 flex-1 overflow-y-auto">{children}</main>
            <RightPanel notes={notes} />
          </div>
        </div>
      </div>
      {hud ?? <HudBar live={`Lab · ${pathname === "/" ? "home" : pathname.split("/")[1]}`} items={[{ k: "QPS", v: "0" }, { k: "P99", v: "—" }]} right="Field Manual · Rev. A" />}
      <CommandPalette />
      <ShortcutsDialog />
    </div>
  );
}
