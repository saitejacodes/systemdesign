import { FigureCaption } from "@/components/brand";

type Box = { x: number; y: number; w: number; h: number; label: string; sub?: string; dashed?: boolean; accent?: boolean };

const BOXES: Box[] = [
  { x: 16, y: 200, w: 120, h: 56, label: "Clients", sub: "curl · k6" },
  { x: 170, y: 200, w: 110, h: 56, label: "nginx", sub: "L7 · no buffering" },
  { x: 318, y: 156, w: 170, h: 56, label: "gateway-a", sub: "auth·limit·cache·admit", accent: true },
  { x: 318, y: 244, w: 170, h: 56, label: "gateway-b", sub: "route·stream·bill", accent: true },
  { x: 566, y: 30, w: 176, h: 44, label: "llm-1", sub: "llama.cpp · Qwen 0.5B" },
  { x: 566, y: 84, w: 176, h: 44, label: "llm-2", sub: "llama.cpp · Qwen 0.5B" },
  { x: 566, y: 138, w: 176, h: 44, label: "llm-3", sub: "llama.cpp · Qwen 0.5B" },
  { x: 566, y: 192, w: 176, h: 44, label: "llm-fallback", sub: "SmolLM2 135M", dashed: true },
  { x: 566, y: 246, w: 176, h: 44, label: "llm-canary", sub: "Q8_0 · profile", dashed: true },
  { x: 566, y: 300, w: 176, h: 44, label: "embed", sub: "bge-small · 384 dims" },
  { x: 170, y: 392, w: 120, h: 48, label: "Redis", sub: "buckets · exact cache" },
  { x: 306, y: 392, w: 182, h: 48, label: "Postgres + pgvector", sub: "tenants · ledger · semantic" },
  { x: 504, y: 392, w: 150, h: 48, label: "NATS JetStream", sub: "batch work queue" },
  { x: 670, y: 392, w: 110, h: 48, label: "worker", sub: "idempotent jobs" },
  { x: 800, y: 110, w: 144, h: 44, label: "Prometheus", sub: "scrape · alerts" },
  { x: 800, y: 166, w: 144, h: 44, label: "Grafana", sub: "dashboard" },
  { x: 800, y: 222, w: 144, h: 44, label: "Jaeger", sub: "OTel traces" },
];

const line = { stroke: "var(--ink)", strokeWidth: 1.25, fill: "none" } as const;
const hot = { stroke: "var(--cobalt)", strokeWidth: 2, fill: "none" } as const;
const dash = { ...line, strokeDasharray: "4 4" } as const;

/** The stage 10 system, drawn as a technical figure. Request path in cobalt; dashed = optional or async. */
export function ArchitectureFigure() {
  return (
    <figure className="grid gap-3">
      <div className="overflow-x-auto border border-ink" tabIndex={0} style={{ background: "var(--surface)" }}>
        <svg
          viewBox="0 0 960 460"
          role="img"
          aria-label="Capstone architecture at stage 10: clients send requests to nginx, which balances two TypeScript gateways. Each gateway authenticates the tenant, checks the Redis token bucket and caches, admits the request into a bounded priority queue, routes it to one of three llama.cpp replicas (or a fallback or canary model), and streams tokens back. Postgres with pgvector holds tenants, the usage ledger and the semantic cache; an embedding server computes vectors. Batch jobs go through NATS JetStream to a worker that calls nginx at the lowest priority. Prometheus, Grafana and Jaeger observe everything."
          style={{ width: "100%", minWidth: 640, height: "auto", display: "block", fontFamily: "var(--font-mono)" }}
        >
          <defs>
            <marker id="cap-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--cobalt)" }} />
            </marker>
          </defs>
          {/* request path */}
          <path d="M136,228 H168" style={hot} markerEnd="url(#cap-arrow)" />
          <path d="M280,228 H298 V184 H316" style={hot} markerEnd="url(#cap-arrow)" />
          <path d="M298,228 V272 H316" style={hot} markerEnd="url(#cap-arrow)" />
          <path d="M488,184 H527 M488,272 H527 M527,52 V322" style={hot} />
          {[52, 106, 160, 214, 268, 322].map((y) => <path key={y} d={`M527,${y} H564`} style={hot} markerEnd="url(#cap-arrow)" />)}
          {/* stores */}
          <path d="M360,300 V340 H230 V390 M400,300 V390 M450,300 V340 H579 V390" style={line} />
          <path d="M654,416 H668" style={line} />
          <path d="M725,392 V372 H200 V258" style={dash} />
          <text x="170" y="456" style={{ fontSize: 10, fill: "var(--ink-muted)" }}>worker → nginx at the lowest priority</text>
          {/* observability */}
          <path d="M742,52 H770 V132 H798 M770,132 V244 H798 M770,188 H798" style={dash} />
          <text x="476" y="146" style={{ fontSize: 10, fill: "var(--cobalt)" }}>route</text>
          {BOXES.map((b) => (
            <g key={b.label}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} style={{ fill: b.accent ? "var(--surface-sunk)" : "var(--paper)", stroke: "var(--ink)", strokeWidth: b.accent ? 1.75 : 1.25, strokeDasharray: b.dashed ? "5 4" : undefined }} />
              <text x={b.x + 10} y={b.y + (b.sub ? 20 : b.h / 2 + 4)} style={{ fontSize: 13, fontWeight: 700, fill: "var(--ink)" }}>{b.label}</text>
              {b.sub && <text x={b.x + 10} y={b.y + 36} style={{ fontSize: 10, fill: "var(--ink-muted)" }}>{b.sub}</text>}
            </g>
          ))}
        </svg>
      </div>
      <FigureCaption parts={["Figure 1", "The platform at stage 10", "Cobalt is the request path; dashed is optional or async"]} />
    </figure>
  );
}
