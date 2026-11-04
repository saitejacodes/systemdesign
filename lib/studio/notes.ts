/** The 7-step interview framework (CLAUDE.md §10), used as the Notes template for every design. */
export const FRAMEWORK_HEADINGS = ["Requirements", "Estimation", "API", "Data Model", "High-Level Design", "Deep Dives", "Wrap-up"] as const;

// Each heading carries the prompts a reviewer checks under it, so the notes double as a self-review checklist.
const PROMPTS: Record<(typeof FRAMEWORK_HEADINGS)[number], string[]> = {
  Requirements: ["Functional: what must users be able to do?", "Non-functional: scale, latency targets, availability, consistency, durability.", "Out of scope:"],
  Estimation: ["Users and daily actives → requests per second (average and peak).", "Read:write ratio.", "Storage per item × items per day × retention.", "Bandwidth in and out."],
  API: ["Endpoints or RPCs with request and response.", "Pagination, idempotency keys, auth."],
  "Data Model": ["Entities, keys and access patterns.", "Which database, and why (SQL vs NoSQL, partition key, indexes)."],
  "High-Level Design": ["Walk each request type through the diagram, component by component."],
  "Deep Dives": ["Scalability: what you shard, replicate or cache, and how.", "Fault tolerance: what fails, how it is detected, what happens to requests."],
  "Wrap-up": ["Bottlenecks: what breaks first at 10× load.", "Trade-offs: each decision, the alternative, and why.", "What you would monitor and alert on."],
};

export function notesTemplate(intro?: string): string {
  const body = FRAMEWORK_HEADINGS.map((h) => `## ${h}\n\n${PROMPTS[h].map((p) => `- ${p}`).join("\n")}\n`).join("\n");
  return `${intro ? `${intro.trim()}\n\n` : ""}${body}`;
}
