import type { Challenge } from "@/lib/sim/engine";
import type { EstConfig, EstState } from "./model";

export const challenges: Challenge<EstConfig, EstState>[] = [
  {
    id: "five-drills",
    title: "Pass 5 drills",
    description: "Open the drills under the calculator and land 5 of them within ±50% on both peak QPS and storage per year. The calculator is hidden during a drill.",
    durationMs: 1_800_000,
    better: "higher",
    done: (s) => s.passedThisRun >= 5,
    winCondition(_h, s) {
      return s.passedThisRun >= 5
        ? { passed: true, value: s.passedThisRun, detail: "5 drills within tolerance. Order-of-magnitude thinking is the whole skill." }
        : { passed: false, value: s.passedThisRun, detail: `${s.passedThisRun} of 5 drills passed. Write the chain down: users × actions ÷ 86,400 × peak.` };
    },
    hint: "86,400 seconds in a day ≈ 10⁵. So 1M actions a day ≈ 12/s. Round aggressively, then multiply by the peak factor.",
  },
  {
    id: "speed-drill",
    title: "A drill in under 3 minutes",
    description: "Pass any one drill within 3 minutes of opening it, about the time you'd spend on estimation in an interview.",
    durationMs: 600_000,
    done: (s) => s.fastest < 180_000,
    winCondition(_h, s) {
      const sec = Number.isFinite(s.fastest) ? Math.round(s.fastest / 1000) : 0;
      return s.fastest < 180_000
        ? { passed: true, value: sec, detail: `Passed in ${sec} s.` }
        : { passed: false, value: sec || 600, detail: Number.isFinite(s.fastest) ? `Your fastest pass took ${sec} s. Aim for under 180.` : "No drill passed yet." };
    },
    hint: "Don't compute exactly. 200M × 22 ≈ 4.4B a day ≈ 50K/s. Two significant figures are plenty.",
  },
];
