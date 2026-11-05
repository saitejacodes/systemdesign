// The 7 phases (CLAUDE.md §10). Section/simulator counts match content and the simulator registry (checked by curriculum.test.ts).
export type PhaseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PhaseInfo {
  n: PhaseNumber;
  name: string;
  short: string;
  weeks: [number, number];
  sections: number;
  simulators: number;
}

export const PHASES: PhaseInfo[] = [
  { n: 1, name: "Foundations & Networking", short: "Foundations", weeks: [1, 2], sections: 12, simulators: 4 },
  { n: 2, name: "APIs, Data, Storage & Search", short: "APIs & data", weeks: [3, 6], sections: 18, simulators: 7 },
  { n: 3, name: "Caching & Messaging", short: "Caching", weeks: [7, 8], sections: 13, simulators: 4 },
  { n: 4, name: "Distributed Systems & Reliability", short: "Distributed", weeks: [9, 10], sections: 15, simulators: 9 },
  { n: 5, name: "Observability, Security, Deploy", short: "Observe", weeks: [11, 12], sections: 14, simulators: 4 },
  { n: 6, name: "Advanced & AI-Native", short: "AI", weeks: [13, 13], sections: 18, simulators: 3 },
  { n: 7, name: "Interview Mastery", short: "Interview", weeks: [14, 16], sections: 8, simulators: 0 },
];

/** Real case studies in content/case-studies (checked by curriculum.test.ts). */
export const CASE_STUDY_COUNT = 19;

const pad = (n: number) => String(n).padStart(2, "0");
export const weekLabel = ([a, b]: [number, number]) => (a === b ? `Wk ${pad(a)}` : `Wk ${pad(a)}–${pad(b)}`);
export const phaseOfWeek = (week: number) => PHASES.find((p) => week >= p.weeks[0] && week <= p.weeks[1])!;
