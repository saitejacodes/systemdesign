import { describe, expect, it } from "vitest";
import { REGISTRY } from "./registry";
import { SIM_TITLES } from "./titles";

describe("simulator registry", () => {
  it.each(REGISTRY.map((s) => [s.id, s] as const))("%s matches its module", async (_id, s) => {
    const { definition: d } = await s.load();
    expect(d.challenges.map((c) => c.id)).toEqual(s.challengeIds);
    expect(d.challenges.length).toBeGreaterThanOrEqual(1);
    expect(d.tour.length).toBeGreaterThanOrEqual(3);
    expect(d.tour.length).toBeLessThanOrEqual(6);
    expect(SIM_TITLES[s.id]).toBe(s.title);
    for (const c of d.controls) expect(d.defaultConfig).toHaveProperty(c.key);
  });
  it("ids are unique", () => expect(new Set(REGISTRY.map((s) => s.id)).size).toBe(REGISTRY.length));
});
