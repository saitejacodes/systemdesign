import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/sim/engine";
import { challenges } from "./challenges";
import { availModel, comps, downtime, fmtMin, fmtPct, formula, parentOf, stages, total, weakest, type AvailConfig, type AvailState, type Start } from "./model";

const sim = (start: Start = "lesson") => new Simulation(availModel, { start } as AvailConfig, 1);
const byName = (s: AvailState, name: string) => comps(s).filter((c) => c.name === name)[0].id;
const outcome = (id: string, s: AvailState) => challenges.find((c) => c.id === id)!.winCondition({}, s);

describe("availability calculator", () => {
  it("series multiplies: the lesson's checkout path", () => {
    const s = sim().state;
    expect(total(s)).toBeCloseTo(0.9999 * 0.9995 * 0.999, 12);
    expect(total(s)).toBeCloseTo(0.99840065, 8);
    expect(downtime(total(s)).year / 60).toBeCloseTo(14.01, 2); // lesson: ≈ 14.0 hours a year
    expect(formula(s)).toBe("0.9999 × 0.9995 × 0.999");
    expect(total(sim("tiers").state)).toBeCloseTo(0.997002999, 12);
  });

  it("parallel is 1 − Π(1 − a): two 99% copies give 99.99%", () => {
    const x = sim("blank");
    x.act("set", { id: byName(x.state, "Component"), pct: 99 });
    x.act("parallel", byName(x.state, "Component"));
    expect(total(x.state)).toBeCloseTo(0.9999, 12);
    x.act("parallel", comps(x.state)[0].id);
    expect(total(x.state)).toBeCloseTo(1 - 0.01 ** 3, 12);
    expect(formula(x.state)).toBe("1 − 0.01 × 0.01 × 0.01");
  });

  it("nested groups: one zone vs a server in each zone (lesson numbers)", () => {
    const x = sim("zones");
    expect(total(x.state)).toBeCloseTo((1 - 0.005 ** 2) * 0.999, 12); // 99.898%
    // Give each server its own zone: Server n → Zone n in series, inside the parallel set; then drop the shared zone.
    for (const name of ["Server 1", "Server 2"]) {
      x.act("series", byName(x.state, name));
      const z = x.state.sel!;
      x.act("set", { id: z, name: `Zone of ${name}`, pct: 99.9 });
    }
    x.act("remove", byName(x.state, "Zone A"));
    expect(total(x.state)).toBeCloseTo(1 - (1 - 0.995 * 0.999) ** 2, 12); // 99.9964%
    expect(fmtPct(total(x.state))).toBe("99.9964%");
    const root = x.state.blocks[x.state.root];
    expect(root.kind === "series" && root.children.length).toBe(1);
  });

  it("downtime per year, month and week", () => {
    const d = downtime(0.999);
    expect(d.year).toBeCloseTo(525.6, 9);
    expect(d.month).toBeCloseTo(43.2, 9);
    expect(d.week).toBeCloseTo(10.08, 9);
    expect(downtime(0.9999).year).toBeCloseTo(52.56, 9);
    expect(downtime(0.99999).month * 60).toBeCloseTo(25.92, 6);
    expect(fmtMin(downtime(0.999).year)).toBe("8.76 h");
    expect(fmtMin(downtime(0.99).year)).toBe("3.65 days");
    expect(fmtPct(0.999)).toBe("99.90%");
  });

  it("the weakest link moves once it is fixed", () => {
    const x = sim();
    const db = byName(x.state, "Database");
    expect(weakest(x.state)).toBe(db);
    expect(stages(x.state).find((v) => v.id === db)!.share).toBeCloseTo(0.001 / (0.0001 + 0.0005 + 0.001), 9);
    x.act("parallel", db);
    expect(weakest(x.state)).toBe(byName(x.state, "App server"));
  });

  it("drag-and-drop moves regroup and normalise the tree", () => {
    const x = sim("tiers");
    const [lb, app, db] = ["Load balancer", "App server", "Database"].map((n) => byName(x.state, n));
    x.act("move", { id: db, to: app }); // drop on a component → parallel pair
    expect(parentOf(x.state, db)!.kind).toBe("parallel");
    expect(total(x.state)).toBeCloseTo(0.999 * (1 - 0.001 ** 2), 12);
    x.act("move", { id: db, to: x.state.root }); // back to the end of the chain; the one-child group dissolves
    expect(parentOf(x.state, app)!.id).toBe(x.state.root);
    expect(total(x.state)).toBeCloseTo(0.999 ** 3, 12);
    x.act("move", { id: x.state.root, to: lb }); // the root can't move
    expect(comps(x.state)).toHaveLength(3);
    for (const id of [lb, app]) x.act("remove", id);
    x.act("remove", db); // the last component stays
    expect(comps(x.state)).toHaveLength(1);
  });

  it("switching the starting system rebuilds the diagram", () => {
    const x = sim();
    x.setConfig({ start: "practice" });
    x.step();
    expect(comps(x.state)).toHaveLength(5);
    expect(total(x.state)).toBeCloseTo(0.9969035482, 9);
  });

  it("four-nines: every tier doubled passes; two tiers or a better part fail", () => {
    const x = sim("tiers");
    expect(outcome("four-nines", x.state).passed).toBe(false);
    x.act("parallel", byName(x.state, "Load balancer"));
    x.act("parallel", byName(x.state, "App server"));
    expect(outcome("four-nines", x.state)).toMatchObject({ passed: false });
    expect(total(x.state)).toBeCloseTo(0.998998002, 9);
    const cheat = structuredClone(x.state);
    cheat.blocks[byName(cheat, "Database")] = { ...comps(cheat).find((c) => c.name === "Database")!, pct: 99.999 };
    expect(outcome("four-nines", cheat).detail).toMatch(/limit/);
    x.act("parallel", byName(x.state, "Database"));
    expect(total(x.state)).toBeCloseTo(0.999997, 9);
    expect(outcome("four-nines", x.state).passed).toBe(true);
    expect(challenges[0].done!(x.state)).toBe(true);
    // A spare that bypasses the database doesn't count.
    const y = sim("tiers");
    y.act("series", y.state.root);
    y.act("move", { id: y.state.sel!, to: byName(y.state, "Database") });
    expect(outcome("four-nines", y.state).detail).toMatch(/skips/);
  });

  it("two-spares: only the two services are worth a spare", () => {
    const spare = (names: string[]) => { const x = sim("practice"); for (const n of names) x.act("parallel", byName(x.state, n)); return x.state; };
    const good = spare(["Service A", "Service B"]);
    expect(total(good)).toBeCloseTo(0.99889835, 8);
    expect(outcome("two-spares", good).passed).toBe(true);
    expect(total(spare(["API gateway", "Database"]))).toBeCloseTo(0.9979007, 7);
    expect(outcome("two-spares", spare(["API gateway", "Database"])).passed).toBe(false);
    expect(total(spare(["Service A", "API gateway"]))).toBeCloseTo(0.9983994, 7);
    expect(outcome("two-spares", spare(["Service A", "API gateway"])).passed).toBe(false);
    expect(outcome("two-spares", spare(["Service A", "Service B", "Database"])).detail).toMatch(/budget/);
  });

  it("is deterministic and pure: actions return a new state", () => {
    const x = sim();
    const before = x.state;
    x.act("parallel", byName(before, "Database"));
    expect(x.state).not.toBe(before);
    expect(comps(before)).toHaveLength(3);
    expect(sim().state).toEqual(sim().state);
  });
});
