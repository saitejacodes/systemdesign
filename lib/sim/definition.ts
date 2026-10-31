import type { ComponentType } from "react";
import type { Challenge, MetricSnapshot, SimModel } from "./engine";

/** Auto-generated control for one config key. */
export type ControlDef<Config> =
  | { key: keyof Config & string; label: string; type: "number"; min: number; max: number; step: number; unit?: string; help?: string }
  | { key: keyof Config & string; label: string; type: "select"; options: { value: string; label: string }[]; help?: string }
  | { key: keyof Config & string; label: string; type: "toggle"; help?: string };

export interface MetricCard { key: string; label: string; unit?: string; digits?: number; tone?: (v: number) => "ok" | "hot" | "over" | undefined }
export interface ChartDef { title: string; keys: { key: string; label: string; color: string }[]; unit?: string }
export interface TourStep { target: "controls" | "canvas" | "metrics" | "log" | "transport" | "faults" | "challenges"; title: string; body: string }

export interface ViewProps<Config, State> { state: State; config: Config; t: number; reducedMotion: boolean; act(name: string, payload?: unknown): void }

/** Everything a simulator module exports; the shell renders the rest. */
export interface SimDefinition<Config = any, State = any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  model: SimModel<Config, State>;
  defaultConfig: Config;
  controls: ControlDef<Config>[];
  challenges: Challenge<Config, State>[];
  tour: TourStep[];
  View: ComponentType<ViewProps<Config, State>>;
  cards: MetricCard[];
  charts: ChartDef[];
  /** HUD items besides sim time, e.g. QPS and p99. */
  hud(m: MetricSnapshot): { k: string; v: string; tone?: "ok" | "hot" | "over" }[];
}
