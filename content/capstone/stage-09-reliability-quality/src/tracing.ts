// Loaded before anything else with `node --require ./dist/tracing.js`, so the instrumentations can patch
// http, fetch (undici), pg and ioredis before the application imports them. That is also why this project
// compiles to CommonJS: require hooks are the reliable way to patch modules at load time.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? "llm-gateway",
  traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  instrumentations: [
    // Do not trace Prometheus scrapes and health checks: thousands of identical, useless traces.
    new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => /^\/(metrics|healthz|readyz)/.test(req.url ?? "") }),
    new UndiciInstrumentation(),
    new PgInstrumentation(),
    new IORedisInstrumentation(),
  ],
});

sdk.start();

// Flush buffered spans on shutdown so the last requests' traces are not lost.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    sdk.shutdown().catch(() => {});
  });
}
