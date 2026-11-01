import type { EventQueue } from "./queue";
import type { LogLevel, MetricHistory, MetricSnapshot, MetricsRegistry } from "./metrics";
import type { Rng } from "./rng";

export interface TickContext<Config> {
  /** Sim time at the end of this tick, in ms. */
  t: number;
  dt: number;
  rng: Rng;
  config: Config;
  metrics: MetricsRegistry;
  log(level: LogLevel, message: string): void;
}

/** A "Break it" menu entry. apply/revert run once when the fault is toggled. */
export interface FaultDef<State> {
  id: string;
  label: string;
  description: string;
  apply(state: State): State;
  revert(state: State): State;
}

/**
 * The pure part of a simulator: no React, no DOM, no globals, deterministic for a given seed.
 * shortcut: tick may mutate and return the same state object (60fps without copying); switch to
 * immutable updates if a model ever needs undo/time travel.
 */
export interface SimModel<Config, State> {
  init(config: Config, rng: Rng): State;
  tick(state: State, ctx: TickContext<Config>): State;
  actions: Record<string, (state: State, payload?: unknown) => State>;
  faults: FaultDef<State>[];
  /** Gauges for the metrics panel and HUD. Rates and percentiles come from ctx.metrics. */
  metrics(state: State, registry: MetricsRegistry, t: number): MetricSnapshot;
}

export interface ChallengeOutcome { passed: boolean; value: number; detail: string }

export interface Challenge<Config, State> {
  id: string;
  title: string;
  description: string;
  setup?: Partial<Config>;
  durationMs: number;
  /** Which way a better value points; used to keep the best result. Default "lower". */
  better?: "lower" | "higher";
  winCondition(history: MetricHistory, state: State): ChallengeOutcome;
  /** Ends the run before durationMs once true (interactive challenges like drills or a quiz answer). */
  done?(state: State): boolean;
  hint: string;
}

export type { EventQueue };
