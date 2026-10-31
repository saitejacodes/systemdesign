"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeChoice = "paper" | "blueprint" | "system";

interface UiState {
  sidebarCollapsed: boolean;
  drawerOpen: boolean;
  rightOpen: boolean;
  rightWidth: number;
  rightTab: "notes" | "tutor";
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  set: (patch: Partial<Omit<UiState, "set">>) => void;
}

// UI layout state; drawer/palette/shortcuts are per-visit and not persisted.
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      drawerOpen: false,
      rightOpen: false,
      rightWidth: 340,
      rightTab: "notes",
      paletteOpen: false,
      shortcutsOpen: false,
      set: (patch) => set(patch),
    }),
    {
      name: "sdl-ui",
      partialize: ({ sidebarCollapsed, rightOpen, rightWidth, rightTab }) => ({ sidebarCollapsed, rightOpen, rightWidth, rightTab }),
    },
  ),
);

export function resolveTheme(choice: ThemeChoice): "paper" | "blueprint" {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "blueprint" : "paper";
}

export function applyTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem("sdl-theme", choice);
  } catch {}
  document.documentElement.dataset.theme = resolveTheme(choice);
}

export function readTheme(): ThemeChoice {
  try {
    return (localStorage.getItem("sdl-theme") as ThemeChoice) || "system";
  } catch {
    return "system";
  }
}

export interface HudState { live: string; items?: { k?: string; v: string; tone?: "ok" | "hot" | "over" }[]; right?: string }
/** Per-page HudBar content; pages set it with <SetHud />. */
export const useHud = create<{ hud: HudState | null; setHud: (h: HudState | null) => void }>()((set) => ({ hud: null, setHud: (hud) => set({ hud }) }));
