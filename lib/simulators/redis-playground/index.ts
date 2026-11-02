import type { SimDefinition } from "@/lib/sim/definition";
import { challenges } from "./challenges";
import { GROUPS, redisModel, type RedisConfig, type RedisState } from "./model";
import { RedisView } from "./view";

export const definition: SimDefinition<RedisConfig, RedisState> = {
  model: redisModel,
  defaultConfig: { group: "strings" },
  controls: [
    { key: "group", label: "Exercise set", type: "select", options: GROUPS.map((g) => ({ value: g.id, label: g.label })), help: "Two auto-checked exercises per set. Your keys stay when you switch sets." },
  ],
  challenges,
  tour: [
    { target: "canvas", title: "A Redis you can poke", body: "Type commands as you would in redis-cli: replies, errors and quoting follow real Redis. It is a simulation of Redis behavior, not a real Redis server." },
    { target: "canvas", title: "Watch the keys", body: "The key browser shows every key's type, value and TTL. Expired keys linger until something touches them or the active cycle finds them." },
    { target: "transport", title: "Time is simulated", body: "Play runs the clock that TTLs count against; the +10 s, +1 min and +30 min buttons fast-forward it. Pause freezes every TTL." },
    { target: "faults", title: "Break it", body: "Stop the active expiry cycle and expired keys pile up in memory until a read deletes them lazily." },
    { target: "challenges", title: "Prove it", body: "Each challenge is a set of two exercises, checked after every command: sessions and counters, leaderboards and unique visitors, and MULTI for atomicity." },
  ],
  View: RedisView,
  cards: [
    { key: "keys", label: "Keys in memory", digits: 0 },
    { key: "ttl", label: "Keys with a TTL", digits: 0 },
    { key: "stale", label: "Expired, not reclaimed", digits: 0, tone: (v) => (v > 0 ? "hot" : undefined) },
    { key: "lazy", label: "Expired lazily", digits: 0 },
    { key: "active", label: "Expired by active cycle", digits: 0 },
    { key: "passed", label: "Exercises passed of 6", digits: 0 },
  ],
  charts: [
    { title: "Keys in memory", keys: [{ key: "keys", label: "All keys", color: "var(--cobalt)" }, { key: "stale", label: "Expired, not reclaimed", color: "var(--status-hot)" }] },
  ],
  hud: (m) => [{ k: "Keys", v: String(m.keys ?? 0) }, { k: "Commands", v: String(m.commands ?? 0) }, { k: "Exercises", v: `${m.passed ?? 0}/6` }],
};
