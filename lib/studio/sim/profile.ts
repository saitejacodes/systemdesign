import type { ComponentKind, StudioGraph } from "../types";
import type { TrafficProfile } from "./types";

/** Datastore kinds, in the order a default request type lists them. */
const STORE_KINDS: ComponentKind[] = ["sql-db", "nosql-db", "shard-group", "object-storage", "search-index", "vector-db"];
/** Requests a day per user assumed by the default profile. */
export const DEFAULT_REQUESTS_PER_USER_PER_DAY = 10;

/**
 * A sensible starting profile for any graph: qps from the clients' users (users × 10 requests a day / 86,400 s, min 10),
 * 10:1 reads, 3× peak, a "Read" and a "Write" request type ending at whichever datastores the design has.
 */
export function defaultProfile(graph: StudioGraph): TrafficProfile {
  let users = 0;
  const present = new Set<ComponentKind>();
  for (const n of graph.nodes) {
    if (n.kind === "note") continue;
    present.add(n.kind);
    if (n.kind === "client") users += typeof n.props.users === "number" && Number.isFinite(n.props.users) ? Math.max(0, n.props.users) : 1_000_000;
  }
  const stores = STORE_KINDS.filter((k) => present.has(k));
  const readKinds: ComponentKind[] = stores.length ? stores : present.has("cache") ? ["cache"] : ["service"];
  const nonBlob = readKinds.filter((k) => k !== "object-storage" && k !== "search-index");
  const writeKinds = nonBlob.length ? nonBlob : readKinds;
  return {
    qps: Math.max(10, Math.round((users * DEFAULT_REQUESTS_PER_USER_PER_DAY) / 86_400)),
    readWriteRatio: 10,
    peakMultiplier: 3,
    requestTypes: [
      { id: "read", name: "Read", op: "read", weight: 1, target: { kinds: readKinds } },
      { id: "write", name: "Write", op: "write", weight: 1, target: { kinds: writeKinds } },
    ],
  };
}
