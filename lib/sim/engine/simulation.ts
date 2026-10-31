import { SimClock } from "./clock";
import { EventLog, MetricsRegistry, SAMPLE_MS, type LogLevel, type MetricSnapshot } from "./metrics";
import { createRng, type Rng } from "./rng";
import type { SimModel, TickContext } from "./types";

/** Runs a model: owns the clock, RNG, metrics, log and active faults. Framework-free. */
export class Simulation<Config, State> {
  clock: SimClock;
  rng!: Rng;
  metrics!: MetricsRegistry;
  log!: EventLog;
  state!: State;
  latest: MetricSnapshot = {};
  faults = new Set<string>();
  samples = 0;

  constructor(readonly model: SimModel<Config, State>, public config: Config, public seed = 1, tickMs?: number) {
    this.clock = new SimClock(tickMs);
    this.reset();
  }

  reset(config: Config = this.config, seed = this.seed) {
    this.config = config;
    this.seed = seed;
    this.clock.reset();
    this.rng = createRng(seed);
    this.metrics = new MetricsRegistry();
    this.log = new EventLog();
    this.faults.clear();
    this.samples = 0;
    this.state = this.model.init(config, this.rng);
    this.latest = this.model.metrics(this.state, this.metrics, 0);
  }

  /** Runs one tick of sim time. */
  step() {
    const t = this.clock.tick();
    const ctx: TickContext<Config> = {
      t, dt: this.clock.tickMs, rng: this.rng, config: this.config, metrics: this.metrics,
      log: (level: LogLevel, message: string) => this.log.add(t, level, message),
    };
    this.state = this.model.tick(this.state, ctx);
    if (Math.floor(t / SAMPLE_MS) > Math.floor((t - this.clock.tickMs) / SAMPLE_MS)) {
      this.latest = this.model.metrics(this.state, this.metrics, t);
      this.metrics.sample(t, this.latest);
      this.samples++;
    }
  }

  /** Runs ticks for `ms` of sim time (headless: tests and instant challenge checks). */
  runFor(ms: number) {
    const end = this.clock.t + ms;
    while (this.clock.t < end) this.step();
  }

  play() { this.clock.paused = false; }
  pause() { this.clock.paused = true; }

  setConfig(patch: Partial<Config>) { this.config = { ...this.config, ...patch }; }

  act(name: string, payload?: unknown) {
    const fn = this.model.actions[name];
    if (!fn) throw new Error(`Unknown action "${name}"`);
    this.state = fn(this.state, payload);
  }

  toggleFault(id: string) {
    const f = this.model.faults.find((x) => x.id === id);
    if (!f) return;
    const on = !this.faults.has(id);
    this.state = on ? f.apply(this.state) : f.revert(this.state);
    if (on) this.faults.add(id); else this.faults.delete(id);
    this.log.add(this.clock.t, on ? "warn" : "info", `${on ? "Fault injected" : "Fault cleared"}: ${f.label}`);
  }
}
