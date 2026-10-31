/** Fixed-capacity ring buffer; oldest entries are overwritten. */
export class RingBuffer<T> {
  private buf: T[] = [];
  private start = 0;
  constructor(readonly capacity: number) {}
  get length() { return this.buf.length; }
  push(v: T) {
    if (this.buf.length < this.capacity) this.buf.push(v);
    else { this.buf[this.start] = v; this.start = (this.start + 1) % this.capacity; }
  }
  toArray(): T[] { return [...this.buf.slice(this.start), ...this.buf.slice(0, this.start)]; }
  last(): T | undefined { return this.buf.length ? this.buf[(this.start + this.buf.length - 1) % this.buf.length] : undefined; }
  clear() { this.buf = []; this.start = 0; }
}

/** Nearest-rank percentile of an unsorted sample (p in 0–100). */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

/**
 * Latency-style histogram over the most recent `size` observations (a sliding reservoir),
 * so percentiles react when a fault starts. Count/sum/mean cover the whole run.
 */
export class Histogram {
  private recent: RingBuffer<number>;
  count = 0;
  sum = 0;
  constructor(size = 1024) { this.recent = new RingBuffer(size); }
  observe(v: number) { this.recent.push(v); this.count++; this.sum += v; }
  get mean() { return this.count ? this.sum / this.count : 0; }
  percentiles() {
    const v = this.recent.toArray();
    return { p50: percentile(v, 50), p95: percentile(v, 95), p99: percentile(v, 99) };
  }
}

export type MetricSnapshot = Record<string, number>;
export interface Sample { t: number; v: number }
/** Per-metric time series, sampled every SAMPLE_MS of sim time. */
export type MetricHistory = Record<string, Sample[]>;

export const SAMPLE_MS = 250;
const HISTORY_SAMPLES = 240; // 60 s of sim time
const RATE_WINDOW_MS = 1000;

/** Counters, gauges and histograms a model writes to through its TickContext. */
export class MetricsRegistry {
  counters = new Map<string, number>();
  gauges = new Map<string, number>();
  histograms = new Map<string, Histogram>();
  private series = new Map<string, RingBuffer<Sample>>();
  private counterSeries = new Map<string, RingBuffer<Sample>>();

  inc(name: string, by = 1) { this.counters.set(name, (this.counters.get(name) ?? 0) + by); }
  set(name: string, v: number) { this.gauges.set(name, v); }
  observe(name: string, v: number) {
    let h = this.histograms.get(name);
    if (!h) this.histograms.set(name, (h = new Histogram()));
    h.observe(v);
  }
  histogram(name: string) { return this.histograms.get(name); }

  /** Per-second rate of a counter over the last second of sim time. */
  rate(name: string, now: number): number {
    const s = this.counterSeries.get(name)?.toArray() ?? [];
    const cur = this.counters.get(name) ?? 0;
    const past = [...s].reverse().find((x) => now - x.t >= RATE_WINDOW_MS) ?? s[0];
    if (!past || now === past.t) return 0;
    return ((cur - past.v) * 1000) / (now - past.t);
  }

  /** Records counters and the given snapshot into the time series. */
  sample(t: number, snap: MetricSnapshot) {
    for (const [k, v] of this.counters) this.push(this.counterSeries, k, t, v);
    for (const [k, v] of Object.entries(snap)) this.push(this.series, k, t, v);
  }

  history(): MetricHistory {
    return Object.fromEntries([...this.series].map(([k, b]) => [k, b.toArray()]));
  }

  private push(m: Map<string, RingBuffer<Sample>>, k: string, t: number, v: number) {
    let b = m.get(k);
    if (!b) m.set(k, (b = new RingBuffer(HISTORY_SAMPLES)));
    b.push({ t, v });
  }
}

export type LogLevel = "info" | "warn" | "error";
export interface LogEntry { id: number; t: number; level: LogLevel; message: string }

export class EventLog {
  private buf = new RingBuffer<LogEntry>(300);
  private n = 0;
  add(t: number, level: LogLevel, message: string) { this.buf.push({ id: this.n++, t, level, message }); }
  entries() { return this.buf.toArray(); }
}
