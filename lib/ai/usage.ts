import type { StorageAdapter } from "@/lib/db/adapter";
import type { AiUsage } from "@/lib/db/types";
import { estimateCost } from "./pricing";
import type { ChatResult } from "./types";

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Adds one request to this month's AiUsage row. Unknown prices add tokens but no cost. */
export async function recordUsage(db: StorageAdapter, r: ChatResult, now = new Date()): Promise<AiUsage> {
  const month = monthKey(now);
  const cur = (await db.get("aiUsage", month)) ?? { month, requests: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
  const row: AiUsage = {
    month,
    requests: cur.requests + 1,
    inputTokens: cur.inputTokens + r.inputTokens,
    outputTokens: cur.outputTokens + r.outputTokens,
    estimatedCost: cur.estimatedCost + (estimateCost(r) ?? 0),
  };
  await db.put("aiUsage", row);
  return row;
}
