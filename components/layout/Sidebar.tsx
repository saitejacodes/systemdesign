"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { LEARN_ICON, NAV_BOTTOM, NAV_TOP, type NavItem } from "@/lib/nav";
import { PHASES, weekLabel } from "@/lib/curriculum";
import { useUi } from "@/lib/ui-store";

export interface TreeSection { phase: number; slug: string; title: string; order: number }

function NavLink({ item, collapsed, current }: { item: NavItem; collapsed: boolean; current: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-[2px] border px-2.5 no-underline py-1.5 text-[14px] font-semibold no-underline ${current ? "border-ink bg-surface" : "border-transparent hover:border-line hover:bg-surface"}`}
      style={{ color: "var(--ink)" }}
    >
      <Icon size={16} strokeWidth={1.5} aria-hidden />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

function Group({ label, collapsed, children }: { label: string; collapsed: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      {!collapsed && <div className="fm-cap px-2.5 pb-1 pt-3">{label}</div>}
      {children}
    </div>
  );
}

/** Curriculum tree + nav. `sections` comes from content (empty phases say "Coming soon"). */
export function Sidebar({ sections = [] }: { sections?: TreeSection[] }) {
  const pathname = usePathname();
  const { sidebarCollapsed, drawerOpen, set } = useUi();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const currentPhase = Number(pathname.match(/^\/phase\/(\d)/)?.[1] ?? 0);
  // The drawer always shows the full sidebar.
  const collapsed = sidebarCollapsed && !drawerOpen;

  return (
    <>
      {drawerOpen && <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => set({ drawerOpen: false })} aria-hidden />}
      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink bg-paper transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${drawerOpen ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "w-16" : "w-[280px]"}`}
      >
        <div className="flex h-14 items-center border-b border-ink px-4">
          <Link href="/" className="no-underline" style={{ color: "var(--ink)" }} aria-label="SysDesign Lab home">
            {collapsed ? <span className="fm-mono font-bold">SDL</span> : <Wordmark />}
          </Link>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-6" onClick={(e) => (e.target as HTMLElement).closest("a") && set({ drawerOpen: false })}>
          <Group label="Study" collapsed={collapsed}>
            {NAV_TOP.map((it) => <NavLink key={it.href} item={it} collapsed={collapsed} current={pathname === it.href} />)}
          </Group>
          <Group label="Learn" collapsed={collapsed}>
            {collapsed ? (
              <NavLink item={{ href: "/phase/1", label: "Learn", icon: LEARN_ICON }} collapsed current={currentPhase > 0} />
            ) : (
              PHASES.map((p) => {
                const list = sections.filter((s) => s.phase === p.n).sort((a, b) => a.order - b.order);
                const isOpen = open[p.n] ?? currentPhase === p.n;
                return (
                  <div key={p.n}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen((o) => ({ ...o, [p.n]: !isOpen }))}
                      className={`fm-layer w-full text-left ${currentPhase === p.n ? "is-current" : ""}`}
                      style={{ background: currentPhase === p.n ? undefined : "transparent", font: "inherit" }}
                    >
                      <span className={`fm-sq fm-sq--${p.n}`}>{p.n}</span>
                      <span><span className="name">{p.name}</span><span className="wk">{weekLabel(p.weeks)}</span></span>
                      <ChevronRight size={14} aria-hidden className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="fm-sub">
                        {list.length === 0 ? (
                          <span className="fm-cap px-1.5 py-1">Coming soon</span>
                        ) : (
                          list.map((s) => {
                            const href = `/phase/${s.phase}/${s.slug}`;
                            return (
                              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
                                <span className="s">§{s.phase}.{s.order}</span>{s.title}
                              </Link>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </Group>
          <Group label="Practice" collapsed={collapsed}>
            {NAV_BOTTOM.map((it) => <NavLink key={it.href} item={it} collapsed={collapsed} current={pathname.startsWith(it.href)} />)}
          </Group>
        </nav>
      </aside>
    </>
  );
}
