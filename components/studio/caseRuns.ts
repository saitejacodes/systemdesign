import "server-only";
import type { CaseRuns } from "@/components/studio/run/config";
import { getCaseStudies } from "@/lib/content";

/**
 * Run-mode data for every case study (traffic profile + run challenge), keyed by case id; the design itself is only known in
 * the browser. Content errors are caught by the content tests; here a broken case only means the editor falls back to
 * defaultProfile and the generic challenges, rather than the whole editor failing.
 */
export function caseRuns(): CaseRuns {
  const out: CaseRuns = {};
  try {
    for (const c of getCaseStudies()) out[c.meta.id] = { title: c.meta.title, trafficProfile: c.meta.trafficProfile, runChallenge: c.meta.runChallenge };
  } catch (e) {
    console.warn(`Studio: case-study run data unavailable (${(e as Error).message})`);
  }
  return out;
}
