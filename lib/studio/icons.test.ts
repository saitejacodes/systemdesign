import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { iconMarkup, iconPhase } from "./icons";
import { COMPONENT_KINDS, type NodeKind } from "./types";

const KINDS: NodeKind[] = [...COMPONENT_KINDS, "note"];

function parse(markup: string): Document {
  return new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${markup}</svg>`, "image/svg+xml");
}

describe("iconMarkup", () => {
  it.each(KINDS)("%s: non-empty, well-formed SVG markup", (kind) => {
    const markup = iconMarkup(kind);
    expect(markup.length).toBeGreaterThan(100);
    expect(markup).not.toMatch(/<svg/);
    const doc = parse(markup);
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.documentElement.children.length).toBeGreaterThan(2);
  });

  it.each(KINDS)("%s: colours are CSS variables only", (kind) => {
    const markup = iconMarkup(kind);
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(markup).not.toMatch(/rgba?\(|hsla?\(/i);
    expect(markup).not.toMatch(/\s(fill|stroke)="/); // style="" only, so tokens apply in exports
    const colours = markup.match(/(?:fill|stroke):([^;"]+)/g) ?? [];
    for (const c of colours) expect(c.split(":")[1]).toMatch(/^(var\(--(ink|surface|cobalt|phase-[1-7])\)|none)$/);
    expect(markup).toContain("var(--cobalt)");
  });

  it.each(COMPONENT_KINDS)("%s: main body uses its curriculum phase colour", (kind) => {
    expect(iconPhase(kind)).toBe(CATALOG[kind].phase);
    expect(iconMarkup(kind)).toContain(`fill:var(--phase-${CATALOG[kind].phase})`);
    for (const p of [1, 2, 3, 4, 5, 6, 7].filter((n) => n !== CATALOG[kind].phase)) {
      expect(iconMarkup(kind)).not.toContain(`var(--phase-${p})`);
    }
  });

  it("every drawing is distinct", () => {
    expect(new Set(KINDS.map(iconMarkup)).size).toBe(KINDS.length);
  });

  it("notes have no phase colour", () => {
    expect(iconPhase("note")).toBeNull();
    expect(iconMarkup("note")).not.toMatch(/--phase-/);
  });
});
