import client from "prom-client";

/**
 * Prometheus metrics. RED for the API (Rate, Errors, Duration) plus the LLM-specific signals:
 * TTFT and TPOT histograms, tokens, queue depth, shedding and cache results.
 *
 * Labels are low-cardinality on purpose: tier (3 values), replica (3), route templates. Never put a tenant id,
 * prompt or request id in a label: every distinct value creates a new time series in Prometheus.
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry }); // process CPU, memory, event-loop lag, GC

export const requests = new client.Counter({
  name: "gateway_requests_total",
  help: "HTTP requests by route template and status code",
  labelNames: ["route", "status"] as const,
  registers: [registry],
});

export const requestDuration = new client.Histogram({
  name: "gateway_request_duration_seconds",
  help: "Full request duration (for streams: until the last token)",
  labelNames: ["route"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64],
  registers: [registry],
});

export const ttft = new client.Histogram({
  name: "llm_ttft_seconds",
  help: "Time to first token, measured at the gateway (queueing + prefill + first decode step)",
  labelNames: ["replica", "tier"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32],
  registers: [registry],
});

export const tpot = new client.Histogram({
  name: "llm_tpot_seconds",
  help: "Mean time per output token of one request, after the first token",
  labelNames: ["replica"] as const,
  buckets: [0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64],
  registers: [registry],
});

export const tokens = new client.Counter({
  name: "llm_tokens_total",
  help: "Tokens processed: prompt (prefilled), cached_prompt (reused from the KV cache) and completion",
  labelNames: ["type", "tier"] as const,
  registers: [registry],
});

export const shed = new client.Counter({
  name: "gateway_shed_total",
  help: "Requests refused before reaching a model: overloaded (503) or rate_limited (429)",
  labelNames: ["reason", "tier"] as const,
  registers: [registry],
});

export const cacheLookups = new client.Counter({
  name: "gateway_cache_lookups_total",
  help: "Response cache lookups by kind (exact, semantic) and result (hit, miss, coalesced)",
  labelNames: ["kind", "result"] as const,
  registers: [registry],
});

export const streamOutcomes = new client.Counter({
  name: "llm_streams_total",
  help: "Generations by outcome: ok, cancelled (client left), error",
  labelNames: ["outcome"] as const,
  registers: [registry],
});

/** Gauges read live state at scrape time instead of being incremented everywhere. */
export function registerGauge(name: string, help: string, labelNames: string[], collect: (g: client.Gauge<string>) => void | Promise<void>): void {
  new client.Gauge({
    name,
    help,
    labelNames,
    registers: [registry],
    async collect() {
      await collect(this);
    },
  });
}

export const batchJobs = new client.Counter({
  name: "batch_jobs_total",
  help: "Batch jobs handled by the worker, by result",
  labelNames: ["result"] as const,
  registers: [registry],
});
