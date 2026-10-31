Read CLAUDE.md, especially §5 and §6. Task: build the shared simulator engine and shell
that all 29 simulators will use. Build one tiny demo simulator to prove it. Do not build
real simulators yet. Match the /design simulator screen.

1. /lib/sim/engine:
   - Seeded RNG (mulberry32) with helpers: uniform, normal, exponential, poisson, pick.
   - SimClock: simulated time in ms, tick-based (default tick = 10ms sim time),
     speed multiplier 0.25×–4×, pause, step (advance one tick), reset.
   - EventQueue: priority queue of scheduled events (discrete-event style) so models can
     schedule "request arrives at t", "server finishes at t".
   - Metrics registry: counters, gauges, histograms (p50/p95/p99 via a fixed-size
     reservoir), time-series ring buffers sampled every 250ms sim time.
   - Event log: ring buffer of {t, level: info|warn|error, message}.
   - Model interface:
       interface SimModel<Config, State> {
         init(config: Config, rng: Rng): State;
         tick(state: State, ctx: TickContext): State;   // pure
         actions: Record<string, (state: State, payload?: any) => State>; // e.g. killServer
         faults: FaultDef<State>[];                    // "Break it" menu entries
         metrics(state: State): MetricSnapshot;
       }
   - Run the loop with requestAnimationFrame; decouple sim ticks from render frames.
     Optionally run heavy models in a Web Worker (provide the hook, use it if a model
     opts in with `worker: true`).
2. /components/sim/SimulatorShell.tsx with regions:
   - Header: SpecLabel title (e.g. "S-03 · LOAD BALANCER · NTS"), depth stamp,
     "What this models / simplifies" drawer button, "Guided tour" button, link to the
     related lesson.
   - Controls panel: auto-generated from a config schema (number slider with min/max/step,
     select, toggle) plus custom controls slot.
   - Canvas slot (view.tsx renders here) on a faint drafting grid with crosshair marks;
     shared helpers for isometric blocks, leader-line labels and travelling request dots.
   - Live Metrics panel: mono metric cards + Recharts line charts from time-series.
   - Event Log panel: filterable by level, auto-scroll toggle.
   - Transport bar: Play/Pause, Step, Reset, speed selector, seed input, reduced-animation toggle.
   - "Break it" dropdown listing model.faults; active faults shown as removable chips.
   - Challenges panel (see 3).
   - HudBar with live QPS, p99 and sim time.
   Layout: desktop = controls left, canvas center, metrics right, log bottom;
   mobile = stacked.
3. Challenge system:
   interface Challenge { id; title; description; setup?: Partial<Config>;
     durationMs; winCondition: (history: MetricHistory, state) => {passed:boolean; value:number; detail:string};
     hint: string }
   Starting a challenge resets the sim with its setup, runs for durationMs sim time,
   evaluates, shows pass/fail with detail, saves ChallengeResult (Prompt 03 DB).
4. Guided tour component: steps that highlight a region with a tooltip (accessible).
5. Simulator registry /lib/simulators/registry.ts:
   { id, title, phase, sectionIds, summary, models: string[], simplifies: string[],
     load: () => import(...) }  (dynamic import so each simulator is code-split)
6. /simulators page: grid of all registered simulators, filter by phase, shows
   challenges completed. /simulators/[id] renders the shell full-width.
   The <Simulator id> MDX component now embeds the real simulator inline (compact mode,
   with an "Open full screen" button).
7. Demo simulator "single-server-queue": one server, Poisson arrivals at rate λ,
   exponential service at rate μ; shows queue length, utilization, latency percentiles;
   fault "slow server (μ/3)"; challenge "keep p99 < 200ms at λ = 80/s by choosing μ".
   Unit test: at λ=50, μ=100, measured mean latency is within 15% of the M/M/1 formula
   1/(μ−λ) over a long run.

Definition of Done: CLAUDE.md §8. Engine unit tests for RNG determinism, clock, event queue, percentiles.
